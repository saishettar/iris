"""Minimal OTLP/HTTP trace receiver — a deliberate hand-rolled alternative to
running the stock OpenTelemetry Collector, so the protocol-level work (parsing
the real OTLP protobuf wire format) is our own code. Listens on the same
/v1/traces path the OTLPSpanExporter posts to by default.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI, Request, Response
from opentelemetry.proto.collector.trace.v1.trace_service_pb2 import (
    ExportTraceServiceRequest,
    ExportTraceServiceResponse,
)

from . import db
from .otlp import extract_spans

logger = logging.getLogger("iris.collector")

app = FastAPI(title="Iris OTLP Collector")


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

    response = ExportTraceServiceResponse()
    return Response(content=response.SerializeToString(), media_type="application/x-protobuf")


@app.get("/traces")
def list_traces(limit: int = 50):
    return db.list_traces(limit=limit)


@app.get("/traces/{trace_id}")
def get_trace(trace_id: str):
    return db.get_trace_spans(trace_id)
