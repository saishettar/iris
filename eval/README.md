# iris-eval

A small YAML-driven eval/regression runner, in the shape of promptfoo's
config and assertion vocabulary: point it at a Python callable, give it test
cases with expected-output assertions, and it tells you what passed.

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
      - type: llm-rubric
        rubric: "Does the answer cite a specific course code for every claim?"
```

`contains`/`regex`/`latency` are deterministic, evaluated directly against
the target's return value and wall-clock latency. `llm-rubric` calls Claude
to grade the output against a plain-language rubric (the same
judge-a-completion-against-a-rubric approach as nyu-rag's groundedness
scoring, generalized to any rubric string).

## Usage

```
pip install -e .
iris-eval path/to/suite.yaml            # runs deterministic + llm-rubric assertions (needs ANTHROPIC_API_KEY)
iris-eval path/to/suite.yaml --no-judge  # deterministic assertions only, no API key or spend
```

Exit code is 1 if any test case failed, 0 otherwise -- suitable for a CI
gate once there's a suite worth gating on.

`examples/fixture_suite.yaml` runs against a fake target
(`examples/fixtures.py`, no real LLM call) and is what `tests/` exercises;
it's a template to copy when wiring this up against a real call path.
