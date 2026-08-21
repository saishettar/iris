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

## Status
M0, M1 done. M2 (collector + storage) in progress — not yet validated against
a running Postgres in this environment (no local Docker/Postgres available
during development; code is written against the real driver/schema and
awaits an end-to-end run).
