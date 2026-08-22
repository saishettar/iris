"""Deterministic assertion checks -- promptfoo's `contains`/`regex`/`latency`/
`cost` vocabulary, evaluated against a test case's actual output, latency,
and (if the target reported it) cost."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .config import Assertion


@dataclass
class AssertionResult:
    assertion_type: str
    passed: bool
    detail: str


def check_contains(output: str, assertion: Assertion) -> AssertionResult:
    passed = assertion.value in output
    return AssertionResult("contains", passed, f"expected output to contain {assertion.value!r}")


def check_regex(output: str, assertion: Assertion) -> AssertionResult:
    passed = re.search(assertion.value, output) is not None
    return AssertionResult("regex", passed, f"expected output to match /{assertion.value}/")


def check_latency(latency_ms: float, assertion: Assertion) -> AssertionResult:
    passed = latency_ms <= assertion.threshold_ms
    return AssertionResult(
        "latency", passed, f"{latency_ms:.0f}ms vs threshold {assertion.threshold_ms:.0f}ms"
    )


def check_cost(cost_usd: float | None, assertion: Assertion) -> AssertionResult:
    if cost_usd is None:
        return AssertionResult(
            "cost",
            False,
            "target didn't report cost -- return an EvalOutput(text=..., cost_usd=...) to enable this assertion",
        )
    passed = cost_usd <= assertion.threshold_usd
    return AssertionResult(
        "cost", passed, f"${cost_usd:.4f} vs threshold ${assertion.threshold_usd:.4f}"
    )


def check_deterministic(
    output: str, latency_ms: float, cost_usd: float | None, assertion: Assertion
) -> AssertionResult:
    if assertion.type == "contains":
        return check_contains(output, assertion)
    if assertion.type == "regex":
        return check_regex(output, assertion)
    if assertion.type == "latency":
        return check_latency(latency_ms, assertion)
    if assertion.type == "cost":
        return check_cost(cost_usd, assertion)
    raise ValueError(f"not a deterministic assertion type: {assertion.type}")


DETERMINISTIC_TYPES = {"contains", "regex", "latency", "cost"}
