import json

from iris_eval.cli import main


def test_out_flag_writes_expected_json_shape(tmp_path):
    suite_path = tmp_path / "suite.yaml"
    suite_path.write_text(
        """
target: "tests.test_cli:fake_target"
tests:
  - description: "says hello"
    vars:
      name: "world"
    assert:
      - type: contains
        value: "hello"
"""
    )
    out_path = tmp_path / "results.json"

    exit_code = main([str(suite_path), "--no-judge", "--out", str(out_path), "--version-tag", "v1"])

    assert exit_code == 0
    payload = json.loads(out_path.read_text())
    assert payload["suite_target"] == "tests.test_cli:fake_target"
    assert payload["version_tag"] == "v1"
    assert len(payload["results"]) == 1
    assert payload["results"][0]["passed"] is True
    assert payload["results"][0]["assertion_results"][0]["assertion_type"] == "contains"


def test_baseline_flag_reports_regression(tmp_path, capsys):
    suite_path = tmp_path / "suite.yaml"
    suite_path.write_text(
        """
target: "tests.test_cli:fake_target_fails"
tests:
  - description: "says hello"
    vars:
      name: "world"
    assert:
      - type: contains
        value: "hello"
"""
    )
    baseline_path = tmp_path / "baseline.json"
    baseline_path.write_text(
        json.dumps(
            {
                "suite_target": "x",
                "version_tag": "baseline",
                "results": [
                    {
                        "description": "says hello",
                        "passed": True,
                        "output": "hello world",
                        "latency_ms": 1.0,
                        "assertion_results": [],
                    }
                ],
            }
        )
    )

    exit_code = main([str(suite_path), "--no-judge", "--baseline", str(baseline_path)])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert "[REGRESSED] says hello" in captured.out
    assert "1 regression(s) vs baseline" in captured.out


def fake_target(name: str) -> str:
    return f"hello {name}"


def fake_target_fails(name: str) -> str:
    return f"goodbye {name}"
