# Iris — LLM/Agent Observability Platform — Project Scope (v2, aligned to industry standards)

A self-hosted tool that traces calls to LLM/agent pipelines, scores them automatically for quality, and flags regressions when a prompt or model changes — generalizing the eval methodology you already built for nyu-rag (hit-rate@5, LLM-judged groundedness) into a reusable system. This version replaces the ad-hoc schema/protocol from v1 with the actual conventions and prior art the industry already uses, so the project reads as "built with awareness of the ecosystem" rather than "reinvented from scratch."

## Prior art — know this before you build

This space is genuinely crowded, so be upfront about it rather than pretending Iris is novel:

- **Langfuse** (YC-backed, open source, self-hostable) — the closest direct analog to what you're building: SDK-based tracing, an "observations" data model (traces containing nested spans/generations), async batched ingestion, plus built-in evals/datasets/prompt management. It added OpenTelemetry support as an integration rather than being OTel-native from inception.
- **Helicone** — leans more gateway/proxy (caching, cost tracking) than deep tracing, closer to the other project idea we discussed.
- **LangSmith**, **Arize Phoenix**, **W&B Weave**, **PromptLayer** — other established players, mostly hosted-first.
- **promptfoo** — the actual, widely-used open-source tool for "CI for prompts": a YAML config defines prompts, providers (models), and test cases with assertions; running `promptfoo eval` does a Cartesian product (every prompt × every provider × every test case), supports deterministic assertions (`contains`, `regex`, `latency`, `cost`) and model-graded assertions (`llm-rubric`, `answer-relevance`, embedding `similar`), and has an official GitHub Action that fails a PR and posts results as a comment when prompts regress.
- **OpenTelemetry GenAI Semantic Conventions** — the emerging vendor-neutral standard (part of OpenTelemetry, which is a CNCF project) for how LLM/agent telemetry should be structured. This is the one genuinely new, timely angle: it's recent enough that several established tools (Langfuse included) bolted it on after the fact rather than being built on it from day one.

**The honest positioning for your resume/README, given all this existing prior art:** you're not inventing a new category — you're building a small, self-hosted, OpenTelemetry-native implementation of patterns Langfuse and promptfoo already proved out, informed by real industry standards instead of an invented schema. That's a *more* credible story in an interview than claiming novelty you can't defend, and "I understood the existing landscape and built something interoperable with it" is itself a good signal.

**Your actual differentiator:** be OTel-native from the start (emit real `gen_ai.*` spans over OTLP), which even Langfuse wasn't originally. Small, but real and explainable.

---

## What changes from the original scope

1. **Trace schema → OpenTelemetry GenAI semantic conventions**, not an invented field list.
2. **SDK → an OpenTelemetry instrumentation library**, not a bespoke decorator posting arbitrary JSON.
3. **Collector → an OTLP receiver**, not a custom REST shape (you can build on the real OpenTelemetry Collector plus a custom exporter, rather than writing an ingestion protocol from scratch).
4. **Eval/regression suite → modeled on promptfoo's config and assertion vocabulary** (YAML test cases, deterministic + LLM-graded assertions), rather than a bespoke "26 questions" script.

## Revised trace schema (OpenTelemetry GenAI conventions)

Span names:
- `chat` — an individual LLM call
- `execute_tool` — a tool invocation
- `invoke_agent` — the top-level agent operation wrapping the above

Key span attributes:
- `gen_ai.request.model` — e.g. `claude-sonnet-4-6`
- `gen_ai.usage.input_tokens` / `gen_ai.usage.output_tokens`
- `gen_ai.response.finish_reasons` — e.g. `stop`, `tool_calls`
- `gen_ai.input.messages` / `gen_ai.output.messages` — structured content, **opt-in only** (the convention deliberately keeps prompt/response content out of default telemetry for privacy — worth keeping this design choice, it's a real production concern you can speak to)
- `gen_ai.system_instructions` — system prompt, also opt-in

Metrics:
- `gen_ai.client.operation.duration` (histogram, latency)
- `gen_ai.client.token.usage` (histogram, dimensioned by `gen_ai.token.type`: input vs output)

---

## Milestones

**M0 — Scope & schema**
- Repo skeleton: `sdk/`, `collector/`, `frontend/`, `docker-compose.yml`
- Read the OpenTelemetry GenAI semantic conventions doc end to end before writing code — this is the spec you're implementing against, not a schema you're inventing
- Decide the two test subjects for dogfooding (nyu-rag, undercut)

**M1 — Instrumentation SDK (Python, OpenTelemetry-based)**
- Use the real `opentelemetry-sdk` and `opentelemetry-exporter-otlp` packages rather than a bespoke HTTP client
- A thin wrapper/decorator around a Claude/OpenAI call that opens a `chat` span, sets `gen_ai.*` attributes, and closes it — content capture (`gen_ai.input.messages` etc.) gated behind an explicit opt-in flag, off by default
- Exports spans via OTLP (gRPC or HTTP) to your collector
- Validate against one real call path in nyu-rag's `generation/answer.py`

**M2 — OTLP collector + storage**
- Either run the real OpenTelemetry Collector with a custom exporter, or write a minimal OTLP receiver yourself (FastAPI/gRPC) if you want more of the protocol-level work to be your own code — decide this deliberately and say so in the README, since it's a legitimate design choice either way
- Postgres schema storing spans in the trace/span hierarchy (a trace has many spans; a span has attributes)
- Basic batching so high-volume ingestion doesn't fall over

**M3 — Automated evaluation layer (promptfoo-style)**
- A YAML test-case format modeled on promptfoo: prompts/providers/tests with `assert` blocks
- Deterministic assertions first: `contains`, `regex`, `latency`, `cost` thresholds
- Then model-graded: an `llm-rubric`-equivalent (reuse your nyu-rag groundedness-judging approach here) and an `answer-relevance`-equivalent
- Store eval results linked to spans/traces, tagged by `prompt_version`/`model_version` so scores are comparable across changes

**M4 — Dashboard (React)**
- Trace/span table: filter by model, time range, eval score, error status
- Trace detail view: the full span tree for one `invoke_agent` call (matches how Langfuse and Phoenix visualize nested tool calls)
- Aggregate charts: cost over time, `gen_ai.client.operation.duration` percentiles (p50/p95/p99), token usage, eval score trend
- Regression view: diff eval scores between two tagged versions

**M5 — Regression suite ("CI for prompts", promptfoo-compatible shape)**
- CLI command that runs your YAML eval suite against the current pipeline, diffs against a stored baseline, flags regressions past a threshold
- A GitHub Action, modeled directly on promptfoo's official action: trigger on PRs touching prompt files, post results as a PR comment, fail the check on regression
- Explicitly note in the README that this is the same shape as promptfoo's CI workflow, applied to your own trace data instead of a standalone eval run — that's a stronger, more precise claim than implying you invented the idea

**M6 — Dogfood, deploy, polish**
- Wire the SDK into nyu-rag and undercut for real so the dashboard shows genuine OTLP traffic
- One-command self-hosted setup via `docker-compose up`
- README stating the prior-art positioning explicitly (Langfuse/promptfoo/OTel GenAI conventions cited by name) plus an architecture diagram and demo video/gif

---

## Stretch goals (only if time allows)
- Multi-provider support (OpenAI + Claude + a local model)
- Cost-spike alerting via Slack/webhook
- Export/import compatibility with the OpenTelemetry Collector so Iris can sit alongside existing OTel infra, not just standalone

## Realistic time estimate
- M0–M4 (a working end-to-end system): roughly 3–5 weeks part-time
- M5–M6 (regression suite + dogfooding + polish): another 1–2 weeks
- Add ~3–5 days versus the original plan for learning the actual OTel SDK/GenAI conventions instead of inventing your own — worth it for the credibility gain

## Resume bullet potential (draft, revisit once built)
- Built Iris, a self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines — an instrumentation SDK emitting spans per the OTel GenAI semantic conventions, an OTLP collector, and automated eval scoring modeled on promptfoo's assertion framework.
- Designed a promptfoo-style regression suite ("CI for prompts") wired into GitHub Actions, diffing eval scores against a baseline and failing a PR when prompt/model changes regress quality.
- Instrumented 2 existing LLM applications (a RAG assistant, an agentic pit-strategy tool) with the SDK, validating the platform against real, non-synthetic OTLP traffic.

## Naming note
Landed on **Iris** — the part of the eye that adapts to observe and let in exactly the right amount of light. Short, real word, no notable brand collision (unlike Prism/NSA-PRISM, Palantir/Palantir Technologies, Oculus/Meta, or Crucible/Atlassian, all considered and set aside for that reason).
