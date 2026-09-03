"""LLM-as-judge grading -- promptfoo's `llm-rubric` and `answer-relevance`
assertions, reusing the same judge-a-completion approach as nyu-rag's
groundedness scoring."""
from __future__ import annotations

from dataclasses import dataclass

JUDGE_MODEL = "claude-sonnet-5"

RUBRIC_SYSTEM_PROMPT = (
    "You are grading whether an AI system's output satisfies a rubric. "
    "Respond with exactly two lines: first PASS or FAIL, then SCORE: <a "
    "number 0-10 rating how well it satisfies the rubric, 10 being perfect>. "
    "Then a one-sentence reason on a third line."
)

ANSWER_RELEVANCE_SYSTEM_PROMPT = (
    "You are grading whether an AI system's answer is relevant to the question "
    "it was asked -- not whether it's factually correct, just whether it "
    "actually addresses what was asked rather than going off topic or dodging "
    "the question. Respond with exactly two lines: first PASS or FAIL, then "
    "SCORE: <a number 0-10 rating how relevant it is, 10 being fully relevant>. "
    "Then a one-sentence reason on a third line."
)


@dataclass
class JudgeResult:
    passed: bool
    reason: str
    score: float | None = None


def _parse_score(second_line: str) -> float | None:
    """Normalizes the judge's 0-10 SCORE line to 0-1. Returns None (not a
    fabricated 0 or 0.5) if the judge didn't answer in the expected shape --
    an unparseable judge response is a missing score, not a guessed one."""
    if not second_line.upper().startswith("SCORE"):
        return None
    try:
        raw = float(second_line.split(":", 1)[1].strip())
    except (IndexError, ValueError):
        return None
    return max(0.0, min(10.0, raw)) / 10.0


def _judge(system_prompt: str, user_content: str, client) -> JudgeResult:
    message = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=200,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
    )
    text = next(block.text for block in message.content if block.type == "text").strip()
    lines = text.splitlines()
    first_line = lines[0].strip().upper() if lines else ""
    score = _parse_score(lines[1].strip()) if len(lines) > 1 else None
    return JudgeResult(passed=first_line.startswith("PASS"), reason=text, score=score)


def llm_rubric(output: str, rubric: str, client) -> JudgeResult:
    return _judge(RUBRIC_SYSTEM_PROMPT, f"Rubric: {rubric}\n\nOutput to grade:\n{output}", client)


def answer_relevance(question: str, output: str, client) -> JudgeResult:
    return _judge(
        ANSWER_RELEVANCE_SYSTEM_PROMPT, f"Question: {question}\n\nAnswer to grade:\n{output}", client
    )
