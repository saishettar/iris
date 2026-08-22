# iris-eval

A small YAML-driven eval/regression runner, in the shape of promptfoo's
config and assertion vocabulary: point it at a Python callable (sync or
`async def`), give it test cases with expected-output assertions, and it
tells you what passed.

## Suite format

```yaml
target: "module.path:function_name"   # called as function_name(**vars)

tests:
  - description: "what this test checks"
    vars:
      question: "..."
      courses: [...]
    assert:
      - type: contains
        value: "some substring"
      - type: regex
        value: "\\[CS-GY \\d+\\]"
      - type: latency
        threshold_ms: 5000
      - type: cost
        threshold_usd: 0.02
      - type: llm-rubric
        rubric: "Does the answer cite a specific course code for every claim?"
      - type: answer-relevance
```

`contains`/`regex`/`latency` are deterministic, evaluated directly against
the target's return value and wall-clock latency. `cost` checks a
`cost_usd` the target reported itself -- a plain string return can't
carry that, so return `iris_eval.runner.EvalOutput(text=..., cost_usd=...)`
instead when you want this assertion; without it, `cost` fails cleanly
with a clear reason rather than guessing a number. `llm-rubric` calls
Claude to grade the output against a plain-language rubric (the same
judge-a-completion-against-a-rubric approach as nyu-rag's groundedness
scoring, generalized to any rubric string). `answer-relevance` grades
whether the output actually addresses the question in that test case's
`vars["question"]` (required for this assertion type) -- not whether it's
correct, just on-topic.

## Usage

```
pip install -e .
iris-eval path/to/suite.yaml            # runs deterministic + llm-rubric/answer-relevance assertions (needs ANTHROPIC_API_KEY)
iris-eval path/to/suite.yaml --no-judge  # deterministic assertions only, no API key or spend
```

Exit code is 1 if any test case failed, 0 otherwise -- suitable for a CI
gate once there's a suite worth gating on.

**Diff against a stored baseline:**

```
iris-eval path/to/suite.yaml --out results.json --version-tag v2
iris-eval path/to/suite.yaml --baseline results.json   # on a later run
```

Prints a per-test new/removed/regressed/fixed report (matched by
description, so added or removed test cases show up correctly rather than
comparing by position) in addition to the normal pass/fail output.

`examples/fixture_suite.yaml` runs against a fake target
(`examples/fixtures.py`, no real LLM call) and is what `tests/` exercises;
it's a template to copy when wiring this up against a real call path.
