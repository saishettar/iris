from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
import psycopg2.extras
import psycopg2.pool

from .pricing import estimate_cost_usd

_pool: psycopg2.pool.SimpleConnectionPool | None = None

SCHEMA_SQL = (Path(__file__).parent / "schema.sql").read_text()


def _get_pool() -> psycopg2.pool.SimpleConnectionPool:
    global _pool
    if _pool is None:
        dsn = os.environ.get("IRIS_DATABASE_URL", "postgresql://iris:iris@localhost:5432/iris")
        _pool = psycopg2.pool.SimpleConnectionPool(1, 10, dsn)
    return _pool


@contextmanager
def _connection():
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def init_schema() -> None:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)


def insert_spans(spans: list[dict]) -> None:
    if not spans:
        return

    trace_ids = sorted({s["trace_id"] for s in spans})
    with _connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                "INSERT INTO traces (trace_id) VALUES %s ON CONFLICT (trace_id) DO NOTHING",
                [(tid,) for tid in trace_ids],
            )
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO spans (span_id, trace_id, parent_span_id, name, service_name,
                                    start_time, end_time, status_code, attributes)
                VALUES %s
                ON CONFLICT (span_id) DO NOTHING
                """,
                [
                    (
                        s["span_id"],
                        s["trace_id"],
                        s["parent_span_id"],
                        s["name"],
                        s["service_name"],
                        s["start_time"],
                        s["end_time"],
                        s["status_code"],
                        psycopg2.extras.Json(s["attributes"]),
                    )
                    for s in spans
                ],
            )


def list_traces(
    limit: int = 50,
    model: str | None = None,
    since: str | None = None,
    until: str | None = None,
    has_error: bool | None = None,
) -> list[dict]:
    conditions = []
    params: list = []

    if model:
        conditions.append(
            "EXISTS (SELECT 1 FROM spans s2 WHERE s2.trace_id = t.trace_id "
            "AND s2.name = 'chat' AND s2.attributes->>'gen_ai.request.model' = %s)"
        )
        params.append(model)
    if since:
        conditions.append("t.first_seen_at >= %s")
        params.append(since)
    if until:
        conditions.append("t.first_seen_at <= %s")
        params.append(until)
    if has_error is True:
        conditions.append(
            "EXISTS (SELECT 1 FROM spans s3 WHERE s3.trace_id = t.trace_id "
            "AND s3.status_code = 'STATUS_CODE_ERROR')"
        )
    elif has_error is False:
        conditions.append(
            "NOT EXISTS (SELECT 1 FROM spans s3 WHERE s3.trace_id = t.trace_id "
            "AND s3.status_code = 'STATUS_CODE_ERROR')"
        )

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT t.trace_id, t.first_seen_at, count(s.span_id) AS span_count
                FROM traces t
                JOIN spans s ON s.trace_id = t.trace_id
                {where_clause}
                GROUP BY t.trace_id, t.first_seen_at
                ORDER BY t.first_seen_at DESC
                LIMIT %s
                """,
                params,
            )
            return cur.fetchall()


def get_trace_spans(trace_id: str) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM spans WHERE trace_id = %s ORDER BY start_time",
                (trace_id,),
            )
            return cur.fetchall()


def insert_eval_run(suite_target: str, version_tag: str | None, results: list[dict]) -> str:
    """Store one iris-eval run (the JSON shape `iris-eval --out` writes). Returns the new run_id."""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO eval_runs (suite_target, version_tag) VALUES (%s, %s) RETURNING run_id",
                (suite_target, version_tag),
            )
            run_id = cur.fetchone()[0]

            if results:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO eval_results (run_id, description, passed, latency_ms, assertion_results)
                    VALUES %s
                    """,
                    [
                        (
                            run_id,
                            r["description"],
                            r["passed"],
                            r["latency_ms"],
                            psycopg2.extras.Json(r["assertion_results"]),
                        )
                        for r in results
                    ],
                )
            return str(run_id)


def list_eval_runs(limit: int = 50) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT r.run_id, r.suite_target, r.version_tag, r.created_at,
                       count(res.result_id) AS test_count,
                       count(res.result_id) FILTER (WHERE res.passed) AS passed_count
                FROM eval_runs r
                LEFT JOIN eval_results res ON res.run_id = r.run_id
                GROUP BY r.run_id
                ORDER BY r.created_at DESC
                LIMIT %s
                """,
                (limit,),
            )
            return cur.fetchall()


def get_eval_run(run_id: str) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM eval_results WHERE run_id = %s ORDER BY description",
                (run_id,),
            )
            return cur.fetchall()


def get_metrics_summary(days: int = 14) -> dict:
    """Aggregate metrics derived from real span data. cost_usd per model comes
    from pricing.py's table, which is empty by default -- a model not in it
    just gets cost_usd: None rather than a guessed number."""
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT date_trunc('day', first_seen_at) AS day, count(*) AS count
                FROM traces
                WHERE first_seen_at >= now() - (%s || ' days')::interval
                GROUP BY day
                ORDER BY day
                """,
                (days,),
            )
            trace_volume = cur.fetchall()

            cur.execute(
                """
                SELECT
                    attributes->>'gen_ai.request.model' AS model,
                    count(*) AS count,
                    COALESCE(SUM((attributes->>'gen_ai.usage.input_tokens')::numeric), 0)::float
                        AS input_tokens,
                    COALESCE(SUM((attributes->>'gen_ai.usage.output_tokens')::numeric), 0)::float
                        AS output_tokens
                FROM spans
                WHERE name = 'chat' AND attributes ? 'gen_ai.request.model'
                GROUP BY model
                ORDER BY count DESC
                """
            )
            model_usage = cur.fetchall()
            for row in model_usage:
                row["cost_usd"] = estimate_cost_usd(row["model"], row["input_tokens"], row["output_tokens"])

            cur.execute(
                """
                SELECT
                    percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p50,
                    percentile_cont(0.95) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p95,
                    percentile_cont(0.99) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p99
                FROM spans
                WHERE name = 'chat' AND end_time IS NOT NULL
                """
            )
            latency_percentiles = cur.fetchone()

    return {
        "trace_volume": trace_volume,
        "model_usage": model_usage,
        "latency_percentiles": latency_percentiles,
    }
