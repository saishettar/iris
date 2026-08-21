"""Deterministic assertion checks -- promptfoo's `contains`/`regex`/`latency`
vocabulary, evaluated against a test case's actual output and latency."""
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


def check_deterministic(output: str, latency_ms: float, assertion: Assertion) -> AssertionResult:
    if assertion.type == "contains":
        return check_contains(output, assertion)
    if assertion.type == "regex":
        return check_regex(output, assertion)
    if assertion.type == "latency":
        return check_latency(latency_ms, assertion)
    raise ValueError(f"not a deterministic assertion type: {assertion.type}")


DETERMINISTIC_TYPES = {"contains", "regex", "latency"}
