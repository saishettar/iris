"""Ready-made `extract_*` callables for `trace_llm_call`, keyed by provider."""


def anthropic_usage(response):
    usage = getattr(response, "usage", None)
    if usage is None:
        return None, None
    return getattr(usage, "input_tokens", None), getattr(usage, "output_tokens", None)


def anthropic_finish_reason(response):
    return getattr(response, "stop_reason", None)


def anthropic_output_text(response):
    content = getattr(response, "content", None) or []
    return [block.text for block in content if getattr(block, "type", None) == "text"]
