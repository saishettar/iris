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


def fake_target(name: str) -> str:
    return f"hello {name}"
