from iris_eval.diff import classify, diff_results
from iris_eval.runner import EvalCaseResult


def result(description: str, passed: bool) -> EvalCaseResult:
    return EvalCaseResult(description=description, passed=passed, output="x", latency_ms=1.0)


def test_classify_all_change_types():
    assert classify(None, True) == "new"
    assert classify(True, None) == "removed"
    assert classify(True, True) == "unchanged"
    assert classify(False, False) == "unchanged"
    assert classify(True, False) == "regressed"
    assert classify(False, True) == "fixed"


def test_diff_results_matches_by_description_not_position():
    baseline = [
        {"description": "a", "passed": True},
        {"description": "b", "passed": False},
    ]
    candidate = [
        result("b", True),  # fixed, and reordered vs baseline
        result("a", False),  # regressed
        result("c", True),  # new
    ]

    rows = diff_results(baseline, candidate)
    by_desc = {r.description: r for r in rows}

    assert by_desc["a"].change == "regressed"
    assert by_desc["b"].change == "fixed"
    assert by_desc["c"].change == "new"
