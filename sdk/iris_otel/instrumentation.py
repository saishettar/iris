from __future__ import annotations

import asyncio
import functools
import os
from contextlib import contextmanager

from opentelemetry.trace import Status, StatusCode

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
    """Wrap an LLM call in a `chat` span with `gen_ai.*` attributes (OTel GenAI conventions).

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
                if system_instructions:
                    span.set_attribute("gen_ai.system_instructions", system_instructions)

        def _set_response_attrs(span, result):
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

        if asyncio.iscoroutinefunction(func):

            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                tracer = get_tracer()
                with tracer.start_as_current_span("chat") as span:
                    _set_request_attrs(span, kwargs)
                    try:
                        result = await func(*args, **kwargs)
                    except Exception as exc:
                        span.record_exception(exc)
                        span.set_status(Status(StatusCode.ERROR, str(exc)))
                        raise
                    _set_response_attrs(span, result)
                    return result

            return async_wrapper

        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span("chat") as span:
                _set_request_attrs(span, kwargs)
                try:
                    result = func(*args, **kwargs)
                except Exception as exc:
                    span.record_exception(exc)
                    span.set_status(Status(StatusCode.ERROR, str(exc)))
                    raise
                _set_response_attrs(span, result)
                return result

        return sync_wrapper

    return decorator
