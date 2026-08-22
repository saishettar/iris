"""Turn a real captured trace into a paste-ready iris-eval test case. The
collector doesn't own the user's suite.yaml -- that file lives in their own
app's repo -- so this returns a YAML snippet to copy in, not a write to a
file we have no access to.

Content capture is opt-in (IRIS_CAPTURE_CONTENT); a trace captured without it
has no gen_ai.input.messages/gen_ai.output.messages attributes at all, and
this returns None rather than fabricate a case from nothing.
"""
from __future__ import annotations

import ast

import yaml


def _extract_last_message_text(raw: str) -> str | None:
    """The SDK stores messages as str(list_of_dicts) (span attributes must be
    primitives), so this is a Python literal, not JSON -- ast.literal_eval,
    not json.loads."""
    try:
        messages = ast.literal_eval(raw)
    except (ValueError, SyntaxError):
        return None
    if not isinstance(messages, list) or not messages:
        return None
    last = messages[-1]
    if isinstance(last, dict) and isinstance(last.get("content"), str):
        return last["content"]
    return None


def build_eval_case_snippet(trace_id: str, spans: list[dict]) -> str | None:
    chat_span = next(
        (
            s
            for s in spans
            if s.get("name") == "chat"
            and "gen_ai.input.messages" in s.get("attributes", {})
            and "gen_ai.output.messages" in s.get("attributes", {})
        ),
        None,
    )
    if chat_span is None:
        return None

    attrs = chat_span["attributes"]
    input_text = _extract_last_message_text(attrs["gen_ai.input.messages"])
    output_text = _extract_last_message_text(attrs["gen_ai.output.messages"])
    if input_text is None or output_text is None:
        return None

    agent_name = next(
        (s["attributes"].get("gen_ai.agent.name") for s in spans if s.get("parent_span_id") is None),
        None,
    )
    label = agent_name or chat_span.get("service_name") or "trace"
    short_id = trace_id[:12]

    case = [
        {
            "description": f"{label} -- promoted from trace {short_id}",
            "vars": {
                # A generic placeholder key -- the collector has no way to know
                # the real target function's parameter names.
                "input": input_text,
            },
            "assert": [
                {"type": "contains", "value": output_text[:80]},
            ],
        }
    ]

    header = (
        "# Paste under the 'tests:' list in your suite.yaml.\n"
        "# Rename 'input' under vars to match your target function's real\n"
        "# parameter name -- the collector doesn't know your function signature.\n"
    )
    footer_lines = ["# Full captured output, for writing a better assertion than the"]
    footer_lines.append("# 80-char 'contains' guess above:")
    for line in output_text.splitlines() or [output_text]:
        footer_lines.append(f"# {line}")

    body = yaml.safe_dump(case, sort_keys=False, allow_unicode=True)
    return header + body + "\n" + "\n".join(footer_lines) + "\n"
