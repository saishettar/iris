# Iris

Self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines.

Full project scope, milestones, and design rationale: [`observability_platform_scope.md`](observability_platform_scope.md).

## Layout
- `sdk/` — Python instrumentation SDK (OpenTelemetry-based, emits `gen_ai.*` spans)
- `collector/` — OTLP receiver / collector config + storage layer
- `frontend/` — React dashboard
- `docker-compose.yml` — one-command self-hosted stack

## Design decisions

**Collector (M2):** hand-rolled OTLP/HTTP receiver (FastAPI, parsing the real
`ExportTraceServiceRequest` protobuf via `opentelemetry-proto`) rather than
running the stock OpenTelemetry Collector image. Both are legitimate — this
one puts more of the protocol-level work in our own code, which fits Iris's
OTel-native differentiator better than wrapping an existing binary would.

**Frontend (M4):** Vite + React + React Router + shadcn/ui (Radix primitives,
Tailwind v4), with dashboard views authored in v0 and adapted into the app
rather than hand-coded from scratch.

## Status
M0, M1, M2 done (M2's Postgres storage layer is unvalidated in this
environment — no local Docker/Postgres available during development; code is
written against the real driver/schema and awaits an end-to-end run). M3 (eval
layer) not started. M4 (dashboard): all four views built from a v0-generated
design (ported from a single-page tabbed mockup into real routes — trace
explorer `/`, trace detail `/traces/:traceId`, analytics `/analytics`,
regression `/regression`). Trace explorer and detail are wired to the real
collector API; analytics and regression stay on the v0 mock data with a TODO,
pending an aggregate-metrics endpoint and the M3 eval layer respectively.
