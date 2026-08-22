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
Everything below has now been run against a real `docker compose up` stack
(Postgres + the collector), not just mocked in isolation: real OTLP spans
from the SDK, a real eval run, and the real `/metrics/summary` aggregates,
all stored and read back correctly, with the dashboard showing genuine data
for all four views in a browser. That live pass also caught a real bug the
mocked tests couldn't: the collector had no CORS headers, so a browser could
fetch it fine over curl/TestClient but got silently blocked calling it from
the dashboard's own origin -- fixed via `CORSMiddleware`
(`IRIS_CORS_ORIGINS`, defaults to the Vite dev origin).

The instrumentation SDK, OTLP collector, and Postgres schema (traces/spans,
eval_runs/eval_results) are built and now verified end-to-end.

The dashboard's four views (trace explorer, trace detail, analytics,
regression) are built from a v0-generated design and all four fetch from the
real collector API — trace explorer (`/`), trace detail
(`/traces/:traceId`), regression (`/regression`), and analytics
(`/analytics`), the last backed by `GET /metrics/summary` (trace volume,
model usage, and real latency percentiles derived from span data; no
cost-by-model numbers, since there's no pricing table behind the captured
token counts to convert them honestly).

The eval/scoring layer (`eval/`) is built: YAML test suites, deterministic
assertions (`contains`/`regex`/`latency`), and an `llm-rubric` assertion that
grades output against a rubric via Claude. Validated against a fixture
target, against nyu-rag's real `generate_answer` path live (one run caught a
real brittle-regex failure -- the model's phrasing varied between calls --
that got replaced with an `llm-rubric` assertion instead), and now stored
for real via `POST /eval-runs`. Only one run has been posted so far, so
there's no real production-vs-candidate diff yet; that's the natural next
step once multiple version-tagged runs exist to compare.
