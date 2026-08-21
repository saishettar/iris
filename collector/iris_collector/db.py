from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path

import psycopg2
import psycopg2.extras
import psycopg2.pool

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


def list_traces(limit: int = 50) -> list[dict]:
    with _connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT t.trace_id, t.first_seen_at, count(s.span_id) AS span_count
                FROM traces t
                JOIN spans s ON s.trace_id = t.trace_id
                GROUP BY t.trace_id, t.first_seen_at
                ORDER BY t.first_seen_at DESC
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
