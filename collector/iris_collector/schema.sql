CREATE TABLE IF NOT EXISTS traces (
    trace_id TEXT PRIMARY KEY,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spans (
    span_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES traces (trace_id),
    parent_span_id TEXT,
    name TEXT NOT NULL,
    service_name TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    status_code TEXT,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS spans_trace_id_idx ON spans (trace_id);

CREATE TABLE IF NOT EXISTS eval_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    suite_target TEXT NOT NULL,
    version_tag TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS eval_results (
    result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES eval_runs (run_id),
    description TEXT NOT NULL,
    passed BOOLEAN NOT NULL,
    latency_ms DOUBLE PRECISION NOT NULL,
    assertion_results JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS eval_results_run_id_idx ON eval_results (run_id);
