from __future__ import annotations

import asyncio
import functools
import os
import time
from contextlib import contextmanager

from opentelemetry.trace import Status, StatusCode

from .metrics import get_duration_histogram, get_token_histogram
from .tracer import get_tracer

# The GenAI semantic conventions deliberately keep prompt/response content
# out of default telemetry for privacy; capture is opt-in only.
CAPTURE_CONTENT = os.environ.get("IRIS_CAPTURE_CONTENT", "false").lower() == "true"


@contextmanager
def observe(name: str = "invoke_agent", **attributes):
    """Top-level span for one agent operation, per the `invoke_agent` OTel GenAI span kind.

    A plain sync context manager works fine even inside `async def` code --
    span start/end is local bookkeeping, not I/O, so there's no async variant.
    """
    tracer = get_tracer()
    with tracer.start_as_current_span(name) as span:
        for key, value in attributes.items():
            span.set_attribute(key, value)
        yield span


def trace_llm_call(
    model: str | None = None,
    extract_usage=None,
    extract_finish_reasons=None,
    extract_messages=None,
    system_instructions: str | None = None,
):
    """Wrap an LLM call in a `chat` span with `gen_ai.*` attributes (OTel GenAI conventions),
    and record the real OTel Metrics the conventions also specify --
    gen_ai.client.operation.duration and gen_ai.client.token.usage histograms
    -- not just span attributes a dashboard has to aggregate after the fact.

    Works on both sync and async (`async def`) target functions -- the
    wrapped call is awaited if the original was a coroutine function, since
    an agent doing multi-round tool use typically calls the client async.

    `extract_usage(result) -> (input_tokens, output_tokens)`,
    `extract_finish_reasons(result) -> str | list[str]`, and
    `extract_messages(result) -> Any` let callers adapt to their provider's
    response shape; see `presets.py` for ready-made Anthropic extractors.
    """

    def decorator(func):
        def _set_request_attrs(span, kwargs):
            resolved_model = model or kwargs.get("model")
            if resolved_model:
                span.set_attribute("gen_ai.request.model", resolved_model)

            if CAPTURE_CONTENT:
                messages = kwargs.get("messages")
                if messages is not None:
                    span.set_attribute("gen_ai.input.messages", str(messages))
                # system_instructions covers a static, decoration-time prompt;
                # kwargs["system"] covers one built dynamically per call (e.g.
                # a prompt that interpolates per-request state) -- prefer the
                # explicit static one if both happen to be given.
                resolved_system = system_instructions or kwargs.get("system")
                if resolved_system:
                    span.set_attribute("gen_ai.system_instructions", str(resolved_system))

            return resolved_model

        def _set_response_attrs(span, result, resolved_model, duration_s):
            input_tokens = output_tokens = None
            if extract_usage:
                input_tokens, output_tokens = extract_usage(result)
                if input_tokens is not None:
                    span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
                if output_tokens is not None:
                    span.set_attribute("gen_ai.usage.output_tokens", output_tokens)

            if extract_finish_reasons:
                span.set_attribute("gen_ai.response.finish_reasons", extract_finish_reasons(result))

            if CAPTURE_CONTENT and extract_messages:
                span.set_attribute("gen_ai.output.messages", str(extract_messages(result)))

            metric_attrs = {"gen_ai.request.model": resolved_model} if resolved_model else {}
            get_duration_histogram().record(duration_s, metric_attrs)
            if input_tokens is not None:
                get_token_histogram().record(input_tokens, {**metric_attrs, "gen_ai.token.type": "input"})
            if output_tokens is not None:
                get_token_histogram().record(output_tokens, {**metric_attrs, "gen_ai.token.type": "output"})

        if asyncio.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                tracer = get_tracer()
                with tracer.start_as_current_span("chat") as span:
                    resolved_model = _set_request_attrs(span, kwargs)
                    start = time.perf_counter()
                    try:
                        result = await func(*args, **kwargs)
                    except Exception as exc:
                        span.record_exception(exc)
                        span.set_status(Status(StatusCode.ERROR, str(exc)))
                        raise
                    duration_s = time.perf_counter() - start
                    _set_response_attrs(span, result, resolved_model, duration_s)
                    return result

            return async_wrapper

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span("chat") as span:
                resolved_model = _set_request_attrs(span, kwargs)
                start = time.perf_counter()
                try:
                    result = func(*args, **kwargs)
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                    raise
                duration_s = time.perf_counter() - start
                _set_response_attrs(span, result, resolved_model, duration_s)
                return result

        return sync_wrapper

    return decorator
