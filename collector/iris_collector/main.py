"""Minimal OTLP/HTTP trace receiver — a deliberate hand-rolled alternative to
running the stock OpenTelemetry Collector, so the protocol-level work (parsing
the real OTLP protobuf wire format) is our own code. Listens on the same
/v1/traces path the OTLPSpanExporter posts to by default.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse
from opentelemetry.proto.collector.metrics.v1.metrics_service_pb2 import (
    ExportMetricsServiceRequest,
    ExportMetricsServiceResponse,
)
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTraceServiceRequest,
    ExportTraceServiceResponse,
)
from pydantic import BaseModel

from . import db
from .eval_export import build_eval_case_snippet
from .live import broadcaster
from .otlp import extract_spans
from .otlp_metrics import extract_histogram_points

logger = logging.getLogger("iris.collector")

app = FastAPI(title="Iris OTLP Collector")

# The dashboard (frontend/) is a separate origin (different port in dev,
# likely a different host once deployed) -- without this, the browser
# accepts the response at the network level but blocks it from JS, which
# only surfaces once something actually calls this from a browser rather
# than curl/TestClient.
_cors_origins = os.environ.get("IRIS_CORS_ORIGINS", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    db.init_schema()


@app.post("/v1/traces")
async def ingest_traces(request: Request) -> Response:
    body = await request.body()
    otlp_request = ExportTraceServiceRequest()
    otlp_request.ParseFromString(body)

    spans = extract_spans(otlp_request)
    db.insert_spans(spans)
    logger.info("ingested %d span(s)", len(spans))

    trace_ids = sorted({s["trace_id"] for s in spans})
    for trace in db.get_trace_summaries(trace_ids):
        broadcaster.publish(trace)

    response = ExportTraceServiceResponse()
    return Response(content=response.SerializeToString(), media_type="application/x-protobuf")


@app.post("/v1/metrics")
async def ingest_metrics(request: Request) -> Response:
    body = await request.body()
    otlp_request = ExportMetricsServiceRequest()
    otlp_request.ParseFromString(body)

    points = extract_histogram_points(otlp_request)
    db.insert_metric_points(points)
    logger.info("ingested %d metric point(s)", len(points))

    response = ExportMetricsServiceResponse()
    return Response(content=response.SerializeToString(), media_type="application/x-protobuf")


@app.get("/metrics/raw")
def list_metric_points(limit: int = 100):
    return db.list_metric_points(limit=limit)


@app.get("/metrics/otel-summary")
def get_otel_metrics_summary(hours: int = 24):
    return db.get_otel_metrics_summary(hours=hours)


@app.get("/traces")
def list_traces(
    limit: int = 50,
    model: str | None = None,
    agent: str | None = None,
    since: str | None = None,
    until: str | None = None,
    has_error: bool | None = None,
):
    return db.list_traces(
        limit=limit, model=model, agent=agent, since=since, until=until, has_error=has_error
    )


@app.get("/traces/stream")
async def stream_traces(request: Request) -> StreamingResponse:
    """Server-Sent Events feed for the dashboard's live-tail view. One
    real event per trace the moment its spans are queryable -- no polling,
    no synthetic tick. A ': keep-alive' comment every 15s keeps the
    connection from being dropped by intermediaries; SSE comment lines
    (leading ':') are ignored by EventSource per spec."""
    queue = broadcaster.subscribe()

    async def event_source():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    trace = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(jsonable_encoder(trace))}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(event_source(), media_type="text/event-stream")


@app.get("/agents")
def get_agent_summary():
    return db.get_agent_summary()


@app.get("/traces/{trace_id}")
def get_trace(trace_id: str):
    return db.get_trace_spans(trace_id)


class AnnotationIn(BaseModel):
    verdict: str
    note: str | None = None


@app.post("/traces/{trace_id}/annotations")
def add_annotation(trace_id: str, body: AnnotationIn):
    if body.verdict not in ("good", "bad"):
        raise HTTPException(status_code=422, detail="verdict must be 'good' or 'bad'")
    return db.add_annotation(trace_id, body.verdict, body.note)


@app.get("/traces/{trace_id}/annotations")
def list_annotations(trace_id: str):
    return db.list_annotations(trace_id)


@app.get("/traces/{trace_id}/eval-case", response_class=PlainTextResponse)
def get_eval_case(trace_id: str):
    spans = db.get_trace_spans(trace_id)
    snippet = build_eval_case_snippet(trace_id, spans)
    if snippet is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "No captured input/output on this trace -- set IRIS_CAPTURE_CONTENT=true "
                "on the instrumented app and re-run to promote a trace to an eval case."
            ),
        )
    return snippet


class AssertionResultIn(BaseModel):
    assertion_type: str
    passed: bool
    detail: str


class EvalCaseResultIn(BaseModel):
    description: str
    passed: bool
    output: str
    latency_ms: float
    assertion_results: list[AssertionResultIn]


class EvalRunIn(BaseModel):
    """Matches the JSON shape `iris-eval --out` writes."""

    suite_target: str
    version_tag: str | None = None
    results: list[EvalCaseResultIn]


@app.post("/eval-runs")
def ingest_eval_run(run: EvalRunIn):
    run_id = db.insert_eval_run(
        run.suite_target,
        run.version_tag,
        [r.model_dump() for r in run.results],
    )
    return {"run_id": run_id}


@app.get("/eval-runs")
def list_eval_runs(limit: int = 50):
    return db.list_eval_runs(limit=limit)


@app.get("/eval-runs/{run_id}")
def get_eval_run(run_id: str):
    return db.get_eval_run(run_id)


@app.get("/metrics/summary")
def get_metrics_summary(days: int = 14):
    return db.get_metrics_summary(days=days)
