"""Resolve a suite's target callable and run every test case against it,
applying each assertion and collecting pass/fail results."""
from __future__ import annotations

import importlib
import inspect
import time
from dataclasses import dataclass, field

from .assertions import DETERMINISTIC_TYPES, AssertionResult, check_deterministic
from .config import EvalSuite
from .judge import answer_relevance, llm_rubric


@dataclass
class EvalOutput:
    """Return this instead of a bare string to also report cost, enabling
    the `cost` assertion. A target that only returns a string still works
    everywhere else -- cost assertions just fail cleanly with a clear
    reason instead of a fabricated number."""

    text: str
    cost_usd: float | None = None


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


async def run_suite(suite: EvalSuite, judge_client=None) -> list[EvalCaseResult]:
    """Async so it can call either a sync or `async def` target -- an
    agentic target (e.g. a multi-round tool-use loop) is often async, since
    it awaits its own LLM calls."""
    target = resolve_target(suite.target)
    results = []

    for test in suite.tests:
        start = time.perf_counter()
        raw_output = target(**test.vars)
        if inspect.isawaitable(raw_output):
            raw_output = await raw_output
        latency_ms = (time.perf_counter() - start) * 1000

        if isinstance(raw_output, EvalOutput):
            output_text, cost_usd = raw_output.text, raw_output.cost_usd
        else:
            output_text, cost_usd = raw_output, None

        assertion_results = []
        for assertion in test.assertions:
            if assertion.type in DETERMINISTIC_TYPES:
                assertion_results.append(
                    check_deterministic(output_text, latency_ms, cost_usd, assertion)
                )
            elif assertion.type == "llm-rubric":
                if judge_client is None:
                    raise RuntimeError(
                        "test case uses an llm-rubric assertion but no judge_client was provided"
                    )
                judged = llm_rubric(output_text, assertion.rubric, judge_client)
                assertion_results.append(AssertionResult("llm-rubric", judged.passed, judged.reason))
            elif assertion.type == "answer-relevance":
                if judge_client is None:
                    raise RuntimeError(
                        "test case uses an answer-relevance assertion but no judge_client was provided"
                    )
                question = test.vars.get("question")
                if question is None:
                    raise ValueError(
                        f"answer-relevance assertion on {test.description!r} needs a 'question' var"
                    )
                judged = answer_relevance(question, output_text, judge_client)
                assertion_results.append(
                    AssertionResult("answer-relevance", judged.passed, judged.reason)
                )
            else:
                raise ValueError(f"unknown assertion type: {assertion.type}")

        results.append(
            EvalCaseResult(
                description=test.description,
                passed=all(r.passed for r in assertion_results),
                output=output_text,
                latency_ms=latency_ms,
                assertion_results=assertion_results,
            )
        )

    return results
