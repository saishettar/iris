from __future__ import annotations

import argparse
import dataclasses
import json
import os
import sys

from .config import load_suite
from .runner import run_suite


def main(argv: list[str] | None = None) -> int:
    # A suite's `target` is resolved via importlib relative to the caller's
    # cwd (e.g. "fixtures:fake_answer" run from an examples/ dir). `python -m
    # iris_eval.cli` gets this for free (-m prepends cwd to sys.path), but
    # the installed `iris-eval` console script doesn't -- it's a plain
    # entry-point wrapper, so target resolution silently fails unless cwd is
    # already on sys.path some other way. Add it explicitly so both
    # invocation styles behave the same.
    if os.getcwd() not in sys.path:
        sys.path.insert(0, os.getcwd())

    parser = argparse.ArgumentParser(prog="iris-eval")
    parser.add_argument("suite", help="path to a YAML eval suite")
    parser.add_argument(
        "--no-judge",
        action="store_true",
        help="skip llm-rubric assertions (fails if a test case needs one) -- no API key or spend needed",
    )
    parser.add_argument(
        "--out",
        help="write results as JSON to this path (e.g. for posting to the collector's /eval-runs)",
    )
    parser.add_argument(
        "--version-tag",
        default=None,
        help="a label for this run (prompt/model version, git sha, ...), recorded in --out's JSON",
    )
    args = parser.parse_args(argv)

    suite = load_suite(args.suite)

    judge_client = None
    if not args.no_judge:
        import anthropic

        judge_client = anthropic.Anthropic()

    results = run_suite(suite, judge_client=judge_client)

    failed = 0
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"[{status}] {result.description} ({result.latency_ms:.0f}ms)")
        for ar in result.assertion_results:
            mark = "ok " if ar.passed else "FAIL"
            print(f"    {mark} {ar.assertion_type}: {ar.detail}")
        if not result.passed:
            failed += 1

    print(f"\n{len(results) - failed}/{len(results)} passed")

    if args.out:
        payload = {
            "suite_target": suite.target,
            "version_tag": args.version_tag,
            "results": [dataclasses.asdict(r) for r in results],
        }
        with open(args.out, "w") as f:
            json.dump(payload, f, indent=2)
        print(f"Wrote results to {args.out}")

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
