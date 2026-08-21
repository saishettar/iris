"""Standalone sanity check for iris_otel — no API key or collector required.

Exports to a console exporter instead of OTLP so it can be run without an
otel-collector instance. Run: `python examples/basic_usage.py` from `sdk/`.
"""

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import ConsoleSpanExporter, SimpleSpanProcessor

import iris_otel.tracer as iris_tracer
from iris_otel import observe, trace_llm_call

# Point the global tracer provider at a console exporter for this demo,
# bypassing iris_otel.tracer's OTLP setup (no collector needed to try it out).
provider = TracerProvider(resource=Resource.create({"service.name": "iris-example"}))
provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))
trace.set_tracer_provider(provider)
iris_tracer._initialized = True  # skip iris_otel's own OTLP init, we set the provider above


class FakeUsage:
    input_tokens = 42
    output_tokens = 17


class FakeResponse:
    model = "claude-sonnet-5"
    stop_reason = "end_turn"
    usage = FakeUsage()


def fake_extract_usage(response):
    return response.usage.input_tokens, response.usage.output_tokens


def fake_extract_finish_reason(response):
    return response.stop_reason


@trace_llm_call(
    model="claude-sonnet-5",
    extract_usage=fake_extract_usage,
    extract_finish_reasons=fake_extract_finish_reason,
)
def fake_llm_call(messages):
    return FakeResponse()


if __name__ == "__main__":
    with observe("invoke_agent", **{"gen_ai.agent.name": "example-agent"}):
        fake_llm_call(messages=[{"role": "user", "content": "hello"}])
