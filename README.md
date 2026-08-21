# Iris

Self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines.

Full project scope, milestones, and design rationale: [`observability_platform_scope.md`](observability_platform_scope.md).

## Layout
- `sdk/` — Python instrumentation SDK (OpenTelemetry-based, emits `gen_ai.*` spans)
- `collector/` — OTLP receiver / collector config + storage layer
- `frontend/` — React dashboard
- `docker-compose.yml` — one-command self-hosted stack

## Status
M0 — repo skeleton in progress.
