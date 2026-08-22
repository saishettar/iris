"""Classify a candidate run's results against a stored baseline, by test
description (not position) -- the same logic the dashboard's Regression
view uses, available here for the CLI/CI path too."""
from __future__ import annotations

from dataclasses import dataclass

from .runner import EvalCaseResult


@dataclass
class DiffRow:
    description: str
    baseline_passed: bool | None
    candidate_passed: bool | None
    change: str  # "new" | "removed" | "regressed" | "fixed" | "unchanged"


def classify(baseline_passed: bool | None, candidate_passed: bool | None) -> str:
    if baseline_passed is None and candidate_passed is not None:
        return "new"
    if baseline_passed is not None and candidate_passed is None:
        return "removed"
    if baseline_passed is not None and candidate_passed is not None:
        if baseline_passed == candidate_passed:
            return "unchanged"
        return "fixed" if candidate_passed else "regressed"
    return "unchanged"


def diff_results(baseline: list[dict], candidate: list[EvalCaseResult]) -> list[DiffRow]:
    baseline_by_desc = {r["description"]: r["passed"] for r in baseline}
    candidate_by_desc = {r.description: r.passed for r in candidate}
    descriptions = list(dict.fromkeys([*baseline_by_desc, *candidate_by_desc]))
    return [
        DiffRow(desc, baseline_by_desc.get(desc), candidate_by_desc.get(desc), classify(
            baseline_by_desc.get(desc), candidate_by_desc.get(desc)
        ))
        for desc in descriptions
    ]
