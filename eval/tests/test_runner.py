from unittest.mock import MagicMock

from iris_eval.config import Assertion, EvalSuite, EvalCase
from iris_eval.runner import run_suite


def fake_target(question: str) -> str:
    return f"The answer to '{question}' is 42."


def test_deterministic_assertions_pass():
    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="mentions 42",
                vars={"question": "what is it"},
                assertions=[
                    Assertion(type="contains", value="42"),
                    Assertion(type="regex", value=r"\d+"),
                    Assertion(type="latency", threshold_ms=10_000),
                ],
            )
        ],
    )

    results = run_suite(suite)

    assert len(results) == 1
    assert results[0].passed
    assert [r.assertion_type for r in results[0].assertion_results] == ["contains", "regex", "latency"]


def test_deterministic_assertion_failure_is_reported_not_raised():
    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="expects something not present",
                vars={"question": "what is it"},
                assertions=[Assertion(type="contains", value="banana")],
            )
        ],
    )

    results = run_suite(suite)

    assert not results[0].passed
    assert results[0].assertion_results[0].passed is False


def test_llm_rubric_uses_judge_client_and_parses_pass():
    mock_client = MagicMock()
    mock_block = MagicMock(type="text", text="PASS: the answer is correct and well-cited.")
    mock_client.messages.create.return_value = MagicMock(content=[mock_block])

    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="graded by rubric",
                vars={"question": "what is it"},
                assertions=[Assertion(type="llm-rubric", rubric="Does the answer contain a number?")],
            )
        ],
    )

    results = run_suite(suite, judge_client=mock_client)

    assert results[0].passed
    assert mock_client.messages.create.called


def test_llm_rubric_without_judge_client_raises():
    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="needs a judge",
                vars={"question": "what is it"},
                assertions=[Assertion(type="llm-rubric", rubric="anything")],
            )
        ],
    )

    try:
        run_suite(suite, judge_client=None)
        assert False, "expected RuntimeError"
    except RuntimeError:
        pass
