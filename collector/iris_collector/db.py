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
    agent: str | None = None,
    since: str | None = None,
    until: str | None = None,
    has_error: bool | None = None,
    tag: str | None = None,
    session: str | None = None,
) -> list[dict]:
    conditions = []
    params: list = []

    if model:
        conditions.append(
            "EXISTS (SELECT 1 FROM spans s2 WHERE s2.trace_id = t.trace_id "
            "AND s2.name = 'chat' AND s2.attributes->>'gen_ai.request.model' = %s)"
        )
        params.append(model)
    if agent:
        # Matches the same agent.name-then-service_name fallback used everywhere
        # this identity is displayed (get_agent_summary(), the SELECT below) --
        # filtering on gen_ai.agent.name alone silently excluded any trace whose
        # only identity is service_name.
        conditions.append(
            "EXISTS (SELECT 1 FROM spans s5 WHERE s5.trace_id = t.trace_id "
            "AND s5.parent_span_id IS NULL "
            "AND COALESCE(s5.attributes->>'gen_ai.agent.name', s5.service_name) = %s)"
        )
        params.append(agent)
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
    if tag:
        conditions.append("%s = ANY(t.tags)")
        params.append(tag)
    if session:
        conditions.append(
            "EXISTS (SELECT 1 FROM spans s6 WHERE s6.trace_id = t.trace_id "
            "AND s6.parent_span_id IS NULL AND s6.attributes->>'session.id' = %s)"
        )
        params.append(session)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"""
                SELECT
                    t.trace_id,
                    t.first_seen_at,
                    t.tags,
                    count(s.span_id) AS span_count,
                    (SELECT s4.attributes->>'gen_ai.agent.name' FROM spans s4
                     WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL
                     LIMIT 1) AS agent_name,
                    (SELECT s4.service_name FROM spans s4
                     WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL
                     LIMIT 1) AS service_name,
                    (SELECT s4.attributes->>'session.id' FROM spans s4
                     WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL
                     LIMIT 1) AS session_id
                FROM traces t
                JOIN spans s ON s.trace_id = t.trace_id
                {where_clause}
                GROUP BY t.trace_id, t.first_seen_at, t.tags
                ORDER BY t.first_seen_at DESC
                LIMIT %s
                """,
                params,
            )
            return cur.fetchall()


def get_trace_summaries(trace_ids: list[str]) -> list[dict]:
    """Same row shape as list_traces() (trace_id, first_seen_at, span_count,
    agent_name, service_name), for a specific set of trace_ids -- used to build
    the summary broadcast to live-tail subscribers right after a batch of
    spans lands, instead of re-querying the whole table."""
    if not trace_ids:
        return []
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    t.trace_id,
                    t.first_seen_at,
                    t.tags,
                    count(s.span_id) AS span_count,
                    (SELECT s4.attributes->>'gen_ai.agent.name' FROM spans s4
                     WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL
                     LIMIT 1) AS agent_name,
                    (SELECT s4.service_name FROM spans s4
                     WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL
                     LIMIT 1) AS service_name
                FROM traces t
                JOIN spans s ON s.trace_id = t.trace_id
                WHERE t.trace_id = ANY(%s)
                GROUP BY t.trace_id, t.first_seen_at, t.tags
                """,
                (trace_ids,),
            )
            return cur.fetchall()


def add_trace_tag(trace_id: str, tag: str) -> list[str]:
    """Postgres array_append with a pre-check rather than a set union in SQL --
    keeps tag order stable (append order) instead of the arbitrary order a
    dedup-via-set approach would produce, which matters for a user manually
    building up a small ordered list of tags on one trace."""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE traces SET tags = array_append(tags, %s)
                WHERE trace_id = %s AND NOT (%s = ANY(tags))
                RETURNING tags
                """,
                (tag, trace_id, tag),
            )
            row = cur.fetchone()
            if row is not None:
                return row[0]
            cur.execute("SELECT tags FROM traces WHERE trace_id = %s", (trace_id,))
            existing = cur.fetchone()
            return existing[0] if existing else []


def remove_trace_tag(trace_id: str, tag: str) -> list[str]:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE traces SET tags = array_remove(tags, %s) WHERE trace_id = %s RETURNING tags",
                (tag, trace_id),
            )
            row = cur.fetchone()
            return row[0] if row else []


def list_tags() -> list[dict]:
    """Distinct tags in use across all traces, with counts -- powers the tag
    filter dropdown without the frontend having to derive it from a full
    trace dump."""
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT tag, count(*) AS trace_count
                FROM traces, unnest(tags) AS tag
                GROUP BY tag
                ORDER BY trace_count DESC, tag
                """
            )
            return cur.fetchall()


def get_trace_tags(trace_id: str) -> list[str]:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT tags FROM traces WHERE trace_id = %s", (trace_id,))
            row = cur.fetchone()
            return row[0] if row else []


def add_annotation(trace_id: str, verdict: str, note: str | None) -> dict:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO annotations (trace_id, verdict, note)
                VALUES (%s, %s, %s)
                RETURNING id, trace_id, verdict, note, created_at
                """,
                (trace_id, verdict, note),
            )
            return cur.fetchone()


def list_annotations(trace_id: str) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM annotations WHERE trace_id = %s ORDER BY created_at DESC",
                (trace_id,),
            )
            return cur.fetchall()


def create_alert_rule(
    name: str, metric: str, threshold: float, window_minutes: int, webhook_url: str | None
) -> dict:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO alert_rules (name, metric, threshold, window_minutes, webhook_url)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (name, metric, threshold, window_minutes, webhook_url),
            )
            return cur.fetchone()


def list_alert_rules() -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM alert_rules ORDER BY created_at DESC")
            return cur.fetchall()


def set_alert_rule_enabled(rule_id: str, enabled: bool) -> dict | None:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE alert_rules SET enabled = %s WHERE id = %s RETURNING *",
                (enabled, rule_id),
            )
            return cur.fetchone()


def delete_alert_rule(rule_id: str) -> None:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM alert_rules WHERE id = %s", (rule_id,))


def evaluate_alert_rule(rule: dict) -> float | None:
    """The real value a rule's metric currently has over its own window --
    the same aggregate queries get_metrics_summary() runs for the dashboard,
    just scoped to window_minutes instead of a fixed days=N. Returns None
    when there's no data to evaluate yet (an empty window is not a 0 -- it's
    unknown, and firing an alert off an empty window would be a false
    positive on a quiet self-hosted instance)."""
    window = rule["window_minutes"]
    with _connection() as conn:
        with conn.cursor() as cur:
            if rule["metric"] == "error_rate":
                cur.execute(
                    """
                    SELECT
                        count(*),
                        count(*) FILTER (
                            WHERE EXISTS (SELECT 1 FROM spans s WHERE s.trace_id = t.trace_id
                                          AND s.status_code = 'STATUS_CODE_ERROR')
                        )
                    FROM traces t
                    WHERE t.first_seen_at >= now() - (%s || ' minutes')::interval
                    """,
                    (window,),
                )
                total, errored = cur.fetchone()
                if not total:
                    return None
                return (errored / total) * 100

            if rule["metric"] == "latency_p95":
                cur.execute(
                    """
                    SELECT percentile_cont(0.95) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    )
                    FROM spans
                    WHERE name = 'chat' AND end_time IS NOT NULL
                        AND start_time >= now() - (%s || ' minutes')::interval
                    """,
                    (window,),
                )
                (p95,) = cur.fetchone()
                return p95

            if rule["metric"] == "cost":
                cur.execute(
                    """
                    SELECT
                        attributes->>'gen_ai.request.model',
                        COALESCE(SUM((attributes->>'gen_ai.usage.input_tokens')::numeric), 0),
                        COALESCE(SUM((attributes->>'gen_ai.usage.output_tokens')::numeric), 0)
                    FROM spans
                    WHERE name = 'chat' AND attributes ? 'gen_ai.request.model'
                        AND start_time >= now() - (%s || ' minutes')::interval
                    GROUP BY 1
                    """,
                    (window,),
                )
                rows = cur.fetchall()
                if not rows:
                    return None
                total_cost = 0.0
                any_priced = False
                for model, input_tokens, output_tokens in rows:
                    cost = estimate_cost_usd(model, float(input_tokens), float(output_tokens))
                    if cost is not None:
                        any_priced = True
                        total_cost += cost
                return total_cost if any_priced else None

    return None


def recently_fired(rule_id: str, window_minutes: int) -> bool:
    """At most one firing per rule per window -- without this, a sustained
    breach re-fires (and re-POSTs the webhook) on every check-loop tick."""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM alert_events
                WHERE rule_id = %s AND fired_at >= now() - (%s || ' minutes')::interval
                LIMIT 1
                """,
                (rule_id, window_minutes),
            )
            return cur.fetchone() is not None


def record_alert_event(rule_id: str, observed_value: float, message: str) -> dict:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO alert_events (rule_id, observed_value, message)
                VALUES (%s, %s, %s)
                RETURNING *
                """,
                (rule_id, observed_value, message),
            )
            return cur.fetchone()


def list_alert_events(limit: int = 50) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ae.*, ar.name AS rule_name, ar.metric
                FROM alert_events ae
                JOIN alert_rules ar ON ar.id = ae.rule_id
                ORDER BY ae.fired_at DESC
                LIMIT %s
                """,
                (limit,),
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

            cur.execute(
                """
                SELECT
                    date_trunc('day', start_time) AS day,
                    percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p50
                FROM spans
                WHERE name = 'chat' AND end_time IS NOT NULL
                    AND start_time >= now() - (%s || ' days')::interval
                GROUP BY day
                ORDER BY day
                """,
                (days,),
            )
            latency_by_day = cur.fetchall()

            # Per-model latency percentiles over time -- powers Home's "Model
            # latencies" chart (one line per model, same real chat-span
            # durations latency_by_day aggregates, just split by model too).
            cur.execute(
                """
                SELECT
                    date_trunc('day', start_time) AS day,
                    attributes->>'gen_ai.request.model' AS model,
                    percentile_cont(0.5) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p50,
                    percentile_cont(0.75) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p75,
                    percentile_cont(0.9) WITHIN GROUP (
                        ORDER BY EXTRACT(EPOCH FROM (end_time - start_time)) * 1000
                    ) AS p90
                FROM spans
                WHERE name = 'chat' AND end_time IS NOT NULL
                    AND attributes ? 'gen_ai.request.model'
                    AND start_time >= now() - (%s || ' days')::interval
                GROUP BY day, model
                ORDER BY day
                """,
                (days,),
            )
            latency_by_model_day = cur.fetchall()

            # Real OTel GenAI span kinds (chat/execute_tool/invoke_agent) by
            # day -- the honest equivalent of Langfuse's observation-type
            # breakdown; Iris has no Default/Debug/Error observation levels,
            # so this groups by the span kinds Iris actually tracks instead.
            cur.execute(
                """
                SELECT date_trunc('day', start_time) AS day, name, count(*) AS count
                FROM spans
                WHERE start_time >= now() - (%s || ' days')::interval
                GROUP BY day, name
                ORDER BY day
                """,
                (days,),
            )
            spans_by_type_by_day = cur.fetchall()

    return {
        "trace_volume": trace_volume,
        "model_usage": model_usage,
        "latency_percentiles": latency_percentiles,
        "latency_by_day": latency_by_day,
        "latency_by_model_day": latency_by_model_day,
        "spans_by_type_by_day": spans_by_type_by_day,
    }


def insert_metric_points(points: list[dict]) -> None:
    if not points:
        return
    with _connection() as conn:
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(
                cur,
                """
                INSERT INTO metric_points
                    (metric_name, attributes, count, sum_value, min_value, max_value, recorded_at)
                VALUES %s
                """,
                [
                    (
                        p["metric_name"],
                        psycopg2.extras.Json(p["attributes"]),
                        p["count"],
                        p["sum_value"],
                        p["min_value"],
                        p["max_value"],
                        p["recorded_at"],
                    )
                    for p in points
                ],
            )


def list_metric_points(limit: int = 100) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM metric_points ORDER BY recorded_at DESC LIMIT %s",
                (limit,),
            )
            return cur.fetchall()


def get_agent_summary() -> list[dict]:
    """Per-agent rollup for the Overview page: one row per distinct agent (falling
    back to service_name, then 'unnamed agent', the same precedence list_traces()
    uses for its agent filter/label). Real SQL aggregates, same pattern as
    get_metrics_summary() -- no client-side grouping of a raw trace dump."""
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                WITH trace_agents AS (
                    SELECT
                        t.trace_id,
                        t.first_seen_at,
                        COALESCE(
                            (SELECT s4.attributes->>'gen_ai.agent.name' FROM spans s4
                             WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL LIMIT 1),
                            (SELECT s4.service_name FROM spans s4
                             WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL LIMIT 1),
                            'unnamed agent'
                        ) AS agent_key,
                        EXISTS (
                            SELECT 1 FROM spans s3
                            WHERE s3.trace_id = t.trace_id AND s3.status_code = 'STATUS_CODE_ERROR'
                        ) AS has_error
                    FROM traces t
                ),
                agent_rollup AS (
                    SELECT
                        agent_key,
                        count(*) AS trace_count,
                        count(*) FILTER (WHERE has_error) AS error_count,
                        max(first_seen_at) AS last_seen_at
                    FROM trace_agents
                    GROUP BY agent_key
                ),
                agent_latency AS (
                    SELECT
                        ta.agent_key,
                        percentile_cont(0.5) WITHIN GROUP (
                            ORDER BY EXTRACT(EPOCH FROM (sp.end_time - sp.start_time)) * 1000
                        ) AS p50_latency_ms
                    FROM trace_agents ta
                    JOIN spans sp ON sp.trace_id = ta.trace_id
                    WHERE sp.name = 'chat' AND sp.end_time IS NOT NULL
                    GROUP BY ta.agent_key
                ),
                agent_model_counts AS (
                    SELECT
                        ta.agent_key,
                        sp.attributes->>'gen_ai.request.model' AS model,
                        count(*) AS model_count
                    FROM trace_agents ta
                    JOIN spans sp ON sp.trace_id = ta.trace_id
                    WHERE sp.name = 'chat' AND sp.attributes ? 'gen_ai.request.model'
                    GROUP BY ta.agent_key, model
                ),
                agent_model AS (
                    SELECT DISTINCT ON (agent_key) agent_key, model
                    FROM agent_model_counts
                    ORDER BY agent_key, model_count DESC
                )
                SELECT
                    r.agent_key AS agent_name,
                    r.trace_count,
                    r.error_count,
                    r.last_seen_at,
                    l.p50_latency_ms,
                    m.model AS primary_model
                FROM agent_rollup r
                LEFT JOIN agent_latency l ON l.agent_key = r.agent_key
                LEFT JOIN agent_model m ON m.agent_key = r.agent_key
                ORDER BY r.last_seen_at DESC
                """
            )
            return cur.fetchall()


def get_session_summary() -> list[dict]:
    """One row per distinct session.id (an app-set span attribute on the root
    span -- observe("invoke_agent", **{"session.id": "..."}) already forwards
    it, no SDK change needed), for multi-turn agents that group several real
    traces under one conversation. Traces with no session.id attribute simply
    aren't part of any session and don't appear here -- there's no fallback
    identity the way agent_name falls back to service_name, because a session
    grouping that silently included ungrouped traces would misrepresent which
    traces are actually related turns."""
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                WITH trace_sessions AS (
                    SELECT
                        t.trace_id,
                        t.first_seen_at,
                        (SELECT s4.attributes->>'session.id' FROM spans s4
                         WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL LIMIT 1)
                            AS session_id,
                        COALESCE(
                            (SELECT s4.attributes->>'gen_ai.agent.name' FROM spans s4
                             WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL LIMIT 1),
                            (SELECT s4.service_name FROM spans s4
                             WHERE s4.trace_id = t.trace_id AND s4.parent_span_id IS NULL LIMIT 1),
                            'unnamed agent'
                        ) AS agent_name,
                        EXISTS (
                            SELECT 1 FROM spans s3
                            WHERE s3.trace_id = t.trace_id AND s3.status_code = 'STATUS_CODE_ERROR'
                        ) AS has_error
                    FROM traces t
                ),
                session_agent AS (
                    SELECT DISTINCT ON (session_id) session_id, agent_name
                    FROM trace_sessions
                    WHERE session_id IS NOT NULL
                    ORDER BY session_id, first_seen_at DESC
                )
                SELECT
                    ts.session_id,
                    count(*) AS trace_count,
                    min(ts.first_seen_at) AS first_seen_at,
                    max(ts.first_seen_at) AS last_seen_at,
                    bool_or(ts.has_error) AS has_error,
                    sa.agent_name
                FROM trace_sessions ts
                JOIN session_agent sa ON sa.session_id = ts.session_id
                WHERE ts.session_id IS NOT NULL
                GROUP BY ts.session_id, sa.agent_name
                ORDER BY max(ts.first_seen_at) DESC
                """
            )
            return cur.fetchall()


def get_otel_metrics_summary(hours: int = 24) -> dict:
    """Aggregates from the real OTel Metrics signal (metric_points), not the
    span-based SQL aggregates get_metrics_summary() computes -- this is what
    proves the gen_ai.client.operation.duration/token.usage histograms are
    actually flowing, not just theoretically emitted."""
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(count), 0) AS operation_count,
                    CASE WHEN SUM(count) > 0 THEN SUM(sum_value) / SUM(count) ELSE NULL END
                        AS avg_duration_s
                FROM metric_points
                WHERE metric_name = 'gen_ai.client.operation.duration'
                    AND recorded_at >= now() - (%s || ' hours')::interval
                """,
                (hours,),
            )
            duration_summary = cur.fetchone()

            cur.execute(
                """
                SELECT
                    attributes->>'gen_ai.request.model' AS model,
                    attributes->>'gen_ai.token.type' AS token_type,
                    COALESCE(SUM(sum_value), 0) AS total_tokens
                FROM metric_points
                WHERE metric_name = 'gen_ai.client.token.usage'
                    AND recorded_at >= now() - (%s || ' hours')::interval
                GROUP BY model, token_type
                ORDER BY model, token_type
                """,
                (hours,),
            )
            token_usage = cur.fetchall()

            cur.execute(
                """
                SELECT
                    date_trunc('hour', recorded_at) AS bucket,
                    COALESCE(SUM(count), 0) AS operation_count
                FROM metric_points
                WHERE metric_name = 'gen_ai.client.operation.duration'
                    AND recorded_at >= now() - (%s || ' hours')::interval
                GROUP BY bucket
                ORDER BY bucket
                """,
                (hours,),
            )
            operations_by_hour = cur.fetchall()

    return {
        "operation_count": duration_summary["operation_count"],
        "avg_duration_s": duration_summary["avg_duration_s"],
        "token_usage": token_usage,
        "operations_by_hour": operations_by_hour,
    }


# Real, fixed metric catalog for the custom dashboard (Langfuse's "My Custom
# Dashboard") -- every entry reuses an aggregate query this module already
# runs elsewhere (metrics summary, agent summary, eval runs). A widget picks
# one of these by id; there is no free-form user-typed query, so a widget
# can never show a fabricated or unbounded value.
WIDGET_METRICS: dict[str, dict[str, str]] = {
    "traces_total": {"label": "Total traces", "kind": "stat"},
    "agents_total": {"label": "Total agents", "kind": "stat"},
    "error_rate": {"label": "Error rate", "kind": "stat"},
    "p50_latency": {"label": "P50 latency", "kind": "stat"},
    "trace_volume_by_day": {"label": "Trace volume (14d)", "kind": "chart"},
    "latency_by_day": {"label": "P50 latency over time (14d)", "kind": "chart"},
    "model_usage": {"label": "Model usage", "kind": "chart"},
    "agent_traces": {"label": "Traces by agent", "kind": "chart"},
    "eval_pass_rate": {"label": "Eval pass rate by suite", "kind": "chart"},
}


def list_dashboard_widgets() -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM dashboard_widgets ORDER BY position, created_at")
            return cur.fetchall()


def create_dashboard_widget(title: str, metric: str) -> dict:
    if metric not in WIDGET_METRICS:
        raise ValueError(f"unknown widget metric: {metric}")
    kind = WIDGET_METRICS[metric]["kind"]
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM dashboard_widgets")
            next_position = cur.fetchone()["next_position"]
            cur.execute(
                """
                INSERT INTO dashboard_widgets (title, metric, kind, position)
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (title, metric, kind, next_position),
            )
            return cur.fetchone()


def delete_dashboard_widget(widget_id: str) -> None:
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM dashboard_widgets WHERE id = %s", (widget_id,))


def reorder_dashboard_widgets(ordered_ids: list[str]) -> None:
    with _connection() as conn:
        with conn.cursor() as cur:
            for i, widget_id in enumerate(ordered_ids):
                cur.execute("UPDATE dashboard_widgets SET position = %s WHERE id = %s", (i, widget_id))


def get_widget_data(metric: str) -> dict:
    if metric not in WIDGET_METRICS:
        raise ValueError(f"unknown widget metric: {metric}")

    if metric == "traces_total":
        with _connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT count(*) FROM traces")
                return {"kind": "stat", "value": cur.fetchone()[0]}

    if metric == "agents_total":
        return {"kind": "stat", "value": len(get_agent_summary())}

    if metric == "error_rate":
        agents = get_agent_summary()
        total = sum(a["trace_count"] for a in agents)
        errors = sum(a["error_count"] for a in agents)
        return {"kind": "stat", "value": round((errors / total) * 100, 1) if total else 0.0}

    if metric == "p50_latency":
        summary = get_metrics_summary()
        return {"kind": "stat", "value": summary["latency_percentiles"]["p50"]}

    if metric == "trace_volume_by_day":
        summary = get_metrics_summary()
        return {
            "kind": "chart",
            "rows": [{"label": r["day"].strftime("%b %d"), "value": r["count"]} for r in summary["trace_volume"]],
        }

    if metric == "latency_by_day":
        summary = get_metrics_summary()
        return {
            "kind": "chart",
            "rows": [{"label": r["day"].strftime("%b %d"), "value": r["p50"]} for r in summary["latency_by_day"]],
        }

    if metric == "model_usage":
        summary = get_metrics_summary()
        return {
            "kind": "chart",
            "rows": [{"label": r["model"], "value": r["count"]} for r in summary["model_usage"]],
        }

    if metric == "agent_traces":
        agents = get_agent_summary()
        return {"kind": "chart", "rows": [{"label": a["agent_name"], "value": a["trace_count"]} for a in agents]}

    if metric == "eval_pass_rate":
        runs = list_eval_runs(limit=200)
        seen_suites: set[str] = set()
        rows = []
        for r in runs:
            if r["suite_target"] in seen_suites:
                continue
            seen_suites.add(r["suite_target"])
            percent = round((r["passed_count"] / r["test_count"]) * 100, 1) if r["test_count"] else 0.0
            rows.append({"label": r["suite_target"], "value": percent})
        return {"kind": "chart", "rows": rows}

    raise ValueError(f"unhandled widget metric: {metric}")
