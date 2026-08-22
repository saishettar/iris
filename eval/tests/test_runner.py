import asyncio
from unittest.mock import MagicMock

from iris_eval.config import Assertion, EvalCase, EvalSuite
from iris_eval.runner import EvalOutput, run_suite


def run(suite, judge_client=None):
    return asyncio.run(run_suite(suite, judge_client=judge_client))


def fake_target(question: str) -> str:
    return f"The answer to '{question}' is 42."


async def fake_async_target(question: str) -> str:
    await asyncio.sleep(0.001)
    return f"The answer to '{question}' is 42."


def fake_target_with_cost(question: str) -> EvalOutput:
    return EvalOutput(text=f"The answer to '{question}' is 42.", cost_usd=0.002)


def fake_target_no_args() -> str:
    return "some answer"


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

    results = run(suite)

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

    results = run(suite)

    assert not results[0].passed
    assert results[0].assertion_results[0].passed is False


def test_async_target_is_awaited():
    suite = EvalSuite(
        target="tests.test_runner:fake_async_target",
        tests=[
            EvalCase(
                description="mentions 42",
                vars={"question": "what is it"},
                assertions=[Assertion(type="contains", value="42")],
            )
        ],
    )

    results = run(suite)

    assert results[0].passed


def test_cost_assertion_passes_when_target_reports_cost():
    suite = EvalSuite(
        target="tests.test_runner:fake_target_with_cost",
        tests=[
            EvalCase(
                description="cheap enough",
                vars={"question": "what is it"},
                assertions=[Assertion(type="cost", threshold_usd=0.01)],
            )
        ],
    )

    results = run(suite)

    assert results[0].passed
    assert results[0].output == "The answer to 'what is it' is 42."


def test_cost_assertion_fails_cleanly_when_target_reports_no_cost():
    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="no cost reported",
                vars={"question": "what is it"},
                assertions=[Assertion(type="cost", threshold_usd=0.01)],
            )
        ],
    )

    results = run(suite)

    assert not results[0].passed
    assert "didn't report cost" in results[0].assertion_results[0].detail


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

    results = run(suite, judge_client=mock_client)

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
        run(suite, judge_client=None)
        assert False, "expected RuntimeError"
    except RuntimeError:
        pass


def test_answer_relevance_uses_judge_client_and_needs_question_var():
    mock_client = MagicMock()
    mock_block = MagicMock(type="text", text="PASS: directly answers the question.")
    mock_client.messages.create.return_value = MagicMock(content=[mock_block])

    suite = EvalSuite(
        target="tests.test_runner:fake_target",
        tests=[
            EvalCase(
                description="graded for relevance",
                vars={"question": "what is it"},
                assertions=[Assertion(type="answer-relevance")],
            )
        ],
    )

    results = run(suite, judge_client=mock_client)

    assert results[0].passed
    call_kwargs = mock_client.messages.create.call_args.kwargs
    assert "what is it" in call_kwargs["messages"][0]["content"]


def test_answer_relevance_without_question_var_raises():
    suite = EvalSuite(
        target="tests.test_runner:fake_target_no_args",
        tests=[
            EvalCase(
                description="missing question var",
                vars={},
                assertions=[Assertion(type="answer-relevance")],
            )
        ],
    )

    try:
        run(suite, judge_client=MagicMock())
        assert False, "expected ValueError"
    except ValueError:
        pass
