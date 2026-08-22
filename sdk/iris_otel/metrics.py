"""Real OTel Metrics (not just span attributes): gen_ai.client.operation.duration
and gen_ai.client.token.usage as actual Histogram instruments, exported over
OTLP -- the piece the custom SQL-over-spans dashboard aggregates don't
replace, since those are a separate signal from what the OTel GenAI
semantic conventions actually specify.
"""
from __future__ import annotations

import os

from opentelemetry import metrics
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource

_initialized = False
_duration_histogram = None
_token_histogram = None


def _init_meter_provider() -> None:
    global _initialized
    if _initialized:
        return

    endpoint = os.environ.get("IRIS_OTLP_METRICS_ENDPOINT", "http://localhost:4318/v1/metrics")
    service_name = os.environ.get("IRIS_SERVICE_NAME", "iris-instrumented-app")
    export_interval_ms = int(os.environ.get("IRIS_METRICS_EXPORT_INTERVAL_MS", "5000"))

    reader = PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=endpoint),
        export_interval_millis=export_interval_ms,
    )
    provider = MeterProvider(
        resource=Resource.create({"service.name": service_name}), metric_readers=[reader]
    )
    metrics.set_meter_provider(provider)
    _initialized = True


def _get_meter():
    _init_meter_provider()
    return metrics.get_meter("iris_otel")


def get_duration_histogram():
    global _duration_histogram
    if _duration_histogram is None:
        _duration_histogram = _get_meter().create_histogram(
            "gen_ai.client.operation.duration",
            unit="s",
            description="Duration of a GenAI client operation",
        )
    return _duration_histogram


def get_token_histogram():
    global _token_histogram
    if _token_histogram is None:
        _token_histogram = _get_meter().create_histogram(
            "gen_ai.client.token.usage",
            unit="{token}",
            description="Tokens used per GenAI client operation, by gen_ai.token.type",
        )
    return _token_histogram
