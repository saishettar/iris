"""LLM-as-judge grading -- promptfoo's `llm-rubric` assertion, reusing the
same judge-a-completion-against-a-rubric approach as nyu-rag's groundedness
scoring, generalized to an arbitrary rubric string per test case."""
from __future__ import annotations

from dataclasses import dataclass

JUDGE_MODEL = "claude-sonnet-5"

JUDGE_SYSTEM_PROMPT = (
    "You are grading whether an AI system's output satisfies a rubric. "
    "Respond with exactly one line: PASS or FAIL, then a one-sentence reason."
)


@dataclass
class JudgeResult:
    passed: bool
    reason: str


def llm_rubric(output: str, rubric: str, client) -> JudgeResult:
    message = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=200,
        system=JUDGE_SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"Rubric: {rubric}\n\nOutput to grade:\n{output}",
            }
        ],
    )
    text = next(block.text for block in message.content if block.type == "text").strip()
    first_line = text.splitlines()[0].strip().upper()
    return JudgeResult(passed=first_line.startswith("PASS"), reason=text)
