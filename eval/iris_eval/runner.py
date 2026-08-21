"""Resolve a suite's target callable and run every test case against it,
applying each assertion and collecting pass/fail results."""
from __future__ import annotations

import importlib
import time
from dataclasses import dataclass, field

from .assertions import DETERMINISTIC_TYPES, AssertionResult, check_deterministic
from .config import EvalSuite
from .judge import llm_rubric


@dataclass
class EvalCaseResult:
    description: str
    passed: bool
    output: str
    latency_ms: float
    assertion_results: list[AssertionResult] = field(default_factory=list)


def resolve_target(target: str):
    module_path, func_name = target.split(":")
    module = importlib.import_module(module_path)
    return getattr(module, func_name)


def run_suite(suite: EvalSuite, judge_client=None) -> list[EvalCaseResult]:
    target = resolve_target(suite.target)
    results = []

    for test in suite.tests:
        start = time.perf_counter()
        output = target(**test.vars)
        latency_ms = (time.perf_counter() - start) * 1000

        assertion_results = []
        for assertion in test.assertions:
            if assertion.type in DETERMINISTIC_TYPES:
                assertion_results.append(check_deterministic(output, latency_ms, assertion))
            elif assertion.type == "llm-rubric":
                if judge_client is None:
                    raise RuntimeError(
                        "test case uses an llm-rubric assertion but no judge_client was provided"
                    )
                judged = llm_rubric(output, assertion.rubric, judge_client)
                assertion_results.append(AssertionResult("llm-rubric", judged.passed, judged.reason))
            else:
                raise ValueError(f"unknown assertion type: {assertion.type}")

        results.append(
            EvalCaseResult(
                description=test.description,
                passed=all(r.passed for r in assertion_results),
                output=output,
                latency_ms=latency_ms,
                assertion_results=assertion_results,
            )
        )

    return results
