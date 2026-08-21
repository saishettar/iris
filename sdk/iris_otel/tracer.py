import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_initialized = False


def _init_tracer_provider() -> None:
    global _initialized
    if _initialized:
        return

    endpoint = os.environ.get("IRIS_OTLP_ENDPOINT", "http://localhost:4318/v1/traces")
    service_name = os.environ.get("IRIS_SERVICE_NAME", "iris-instrumented-app")

    provider = TracerProvider(resource=Resource.create({"service.name": service_name}))
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint)))
    trace.set_tracer_provider(provider)
    _initialized = True


def get_tracer():
    _init_tracer_provider()
    return trace.get_tracer("iris_otel")
