"""LLM-as-judge grading -- promptfoo's `llm-rubric` and `answer-relevance`
assertions, reusing the same judge-a-completion approach as nyu-rag's
groundedness scoring."""
from __future__ import annotations

from dataclasses import dataclass

JUDGE_MODEL = "claude-sonnet-5"

RUBRIC_SYSTEM_PROMPT = (
    "You are grading whether an AI system's output satisfies a rubric. "
    "Respond with exactly one line: PASS or FAIL, then a one-sentence reason."
)

ANSWER_RELEVANCE_SYSTEM_PROMPT = (
    "You are grading whether an AI system's answer is relevant to the question "
    "it was asked -- not whether it's factually correct, just whether it "
    "actually addresses what was asked rather than going off topic or dodging "
    "the question. Respond with exactly one line: PASS or FAIL, then a "
    "one-sentence reason."
)


@dataclass
class JudgeResult:
    passed: bool
    reason: str


def _judge(system_prompt: str, user_content: str, client) -> JudgeResult:
    message = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=200,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next(block.text for block in message.content if block.type == "text").strip()
    first_line = text.splitlines()[0].strip().upper()
    return JudgeResult(passed=first_line.startswith("PASS"), reason=text)


def llm_rubric(output: str, rubric: str, client) -> JudgeResult:
    return _judge(RUBRIC_SYSTEM_PROMPT, f"Rubric: {rubric}\n\nOutput to grade:\n{output}", client)


def answer_relevance(question: str, output: str, client) -> JudgeResult:
    return _judge(
        ANSWER_RELEVANCE_SYSTEM_PROMPT, f"Question: {question}\n\nAnswer to grade:\n{output}", client
    )
