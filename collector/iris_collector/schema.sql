CREATE TABLE IF NOT EXISTS traces (
    trace_id TEXT PRIMARY KEY,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ALTER ... ADD COLUMN IF NOT EXISTS rather than folding into CREATE TABLE
-- IF NOT EXISTS above: init_schema() runs on every startup and the latter
-- is a no-op against a traces table that already exists from before this
-- column was added, which every real deployment's Postgres volume already
-- does.
ALTER TABLE traces ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

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

-- Real OTel Metrics (histogram data points from gen_ai.client.operation.duration
-- and gen_ai.client.token.usage), not the custom SQL aggregates over span data
-- that /metrics/summary computes -- a separate signal, ingested via /v1/metrics.
CREATE TABLE IF NOT EXISTS metric_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    count BIGINT NOT NULL,
    sum_value DOUBLE PRECISION NOT NULL,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,
    recorded_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS metric_points_name_idx ON metric_points (metric_name);

-- Human feedback on a trace -- good/bad plus an optional note -- the
-- human-in-the-loop pattern Langfuse Scores / LangSmith Feedback both
-- ship. Kept separate from eval_results: these are judgments a person made
-- looking at real production output, not an automated assertion's verdict.
CREATE TABLE IF NOT EXISTS annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id TEXT NOT NULL REFERENCES traces (trace_id),
    verdict TEXT NOT NULL CHECK (verdict IN ('good', 'bad')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS annotations_trace_id_idx ON annotations (trace_id);
