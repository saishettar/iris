"""Load a YAML eval suite: a target callable plus a list of test cases."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Assertion:
    type: str
    value: str | None = None
    threshold_ms: float | None = None
    rubric: str | None = None


@dataclass
class EvalCase:
    description: str
    vars: dict = field(default_factory=dict)
    assertions: list[Assertion] = field(default_factory=list)


@dataclass
class EvalSuite:
    target: str  # "module.path:function_name", resolved and called with **vars
    tests: list[EvalCase]


def load_suite(path: str | Path) -> EvalSuite:
    data = yaml.safe_load(Path(path).read_text())

    tests = [
        EvalCase(
            description=raw.get("description", ""),
            vars=raw.get("vars", {}),
            assertions=[Assertion(**a) for a in raw.get("assert", [])],
        )
        for raw in data["tests"]
    ]
    return EvalSuite(target=data["target"], tests=tests)
