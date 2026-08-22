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

**Core system:** SDK, collector (OTLP ingest + Postgres storage for
traces/spans and eval_runs/eval_results), and the eval/scoring layer are all
built and have been run against a real `docker compose up` stack (Postgres +
collector), not just mocked in isolation -- real OTLP spans, a real eval
run, and the `/metrics/summary` aggregates all stored and read back
correctly, with the dashboard showing genuine data in a browser. That live
pass caught a real bug no mocked test could: the collector had no CORS
headers, so curl/TestClient saw a fine response while a browser on the
dashboard's own origin got silently blocked -- fixed via `CORSMiddleware`.

**Dashboard:** all four views (trace explorer `/`, trace detail
`/traces/:traceId`, analytics `/analytics`, regression `/regression`) are
built from a v0-generated design and fetch from the real collector API.
Analytics includes cost-by-model, computed from real captured token counts
against a pricing table that's empty by default (no fabricated numbers --
fill in real pricing per model to enable it). Regression supports a real
baseline-vs-candidate diff (by test description, so added/removed cases
show up correctly) once two comparable runs exist, falling back to a
single-run view otherwise.

**Eval layer:** YAML suites, deterministic assertions
(`contains`/`regex`/`latency`), and an `llm-rubric` assertion that grades
output against a rubric via Claude, stored for real via `POST /eval-runs`.
Validated against a fixture target and against nyu-rag's real
`generate_answer` path live -- one run caught a real brittle-regex failure
(the model's phrasing varied between calls) that got replaced with an
`llm-rubric` assertion instead. A CI workflow (in nyu-rag) runs this suite
on PRs touching the prompt and posts results as a comment, failing the
check on regression.

**Dogfooding:** both intended target apps are instrumented with the SDK --
nyu-rag (`generate_answer`, single call) and undercut/f1-race-strategy-agent
(`decide_llm`, a multi-round Claude tool-use loop). Instrumenting the second
one surfaced two real SDK gaps that got fixed: `trace_llm_call` didn't
support `async` target functions, and `system_instructions` only captured a
static prompt, not one built per call from request state.

**Known gaps, left honest rather than faked:** no auth on the collector or
dashboard (fine for a self-hosted personal tool, worth flagging if this
ever runs somewhere shared); the collector rebuilds its image on every
`docker compose up` rather than using a pinned/pushed one, which only
matters for a real deploy, not local dev.
