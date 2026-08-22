# Iris

Self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines.

Full project scope, milestones, and design rationale: [`observability_platform_scope.md`](observability_platform_scope.md).

## Layout
- `sdk/` — Python instrumentation SDK (OpenTelemetry-based, emits `gen_ai.*` spans)
- `collector/` — OTLP receiver / collector config + storage layer
- `eval/` — YAML-driven eval/regression runner (promptfoo-shaped config + assertions)
- `frontend/` — React dashboard
- `docker-compose.yml` — one-command self-hosted stack

## Design decisions

**Collector:** hand-rolled OTLP/HTTP receiver (FastAPI, parsing the real
`ExportTraceServiceRequest` protobuf via `opentelemetry-proto`) rather than
running the stock OpenTelemetry Collector image. Both are legitimate — this
one puts more of the protocol-level work in our own code, which fits Iris's
OTel-native differentiator better than wrapping an existing binary would.

**Frontend:** Vite + React + React Router + shadcn/ui (Radix primitives,
Tailwind v4), with dashboard views authored in v0 and adapted into the app
rather than hand-coded from scratch.

## Status
The instrumentation SDK, OTLP collector, and Postgres schema are built (the
collector's Postgres storage layer hasn't been validated end-to-end in this
environment — no local Docker/Postgres available during development; the code
is written against the real driver/schema and is waiting on a live run).

The dashboard's four views (trace explorer, trace detail, analytics,
regression) are built from a v0-generated design — trace explorer (`/`),
trace detail (`/traces/:traceId`), and regression (`/regression`) are wired
to the real collector API; analytics (`/analytics`) still shows v0's mock
data behind a TODO, pending an aggregate-metrics endpoint.

The eval/scoring layer (`eval/`) is built: YAML test suites, deterministic
assertions (`contains`/`regex`/`latency`), and an `llm-rubric` assertion that
grades output against a rubric via Claude. Validated both against a fixture
target (no real LLM call) and against nyu-rag's real `generate_answer` path,
live: one run caught a real brittle-regex failure (the model's phrasing
varied between calls) that got replaced with an `llm-rubric` assertion
instead. The collector now stores eval runs (`eval_runs`/`eval_results`
tables, `POST /eval-runs`, `GET /eval-runs[/:id]`) and the Regression view
reads from them — request/response parsing validated against real
`iris-eval --out` JSON with the DB layer mocked (same unvalidated-against-a-
live-Postgres caveat as the trace storage above). Only one run gets posted
today, so there's no real production-vs-candidate diff yet; that's the
natural next step once multiple version-tagged runs exist to compare.
