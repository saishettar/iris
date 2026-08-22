# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two real, simultaneous audiences:

- **Engineers self-hosting Iris**: someone running LLM/agent pipelines (their own or a team's) who wants tracing, automated quality scoring, and regression detection when a prompt or model changes -- without inventing telemetry conventions from scratch.
- **Technical interviewers and recruiters** evaluating this project as work product during a job search. They skim a README, look at screenshots, and (if compelling enough) click into the live dashboard or the code itself. What they need to see quickly: real, working software -- not a mockup -- built with awareness of the existing ecosystem (Langfuse, promptfoo, OpenTelemetry GenAI conventions) rather than reinvented in isolation.

Design and documentation have to hold up to both: functional enough that a real self-hoster could actually use it, and legible/credible enough that a reviewer understands what they're looking at in under a minute.

## Product Purpose

A self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines: trace what a pipeline actually did, score its output automatically, and catch regressions when a prompt or model changes. Success (for the self-hoster) is genuine visibility into pipeline behavior without building custom tracing/eval tooling from scratch. Success (for the portfolio audience) is a credible, working demonstration of production-shaped engineering judgment -- real architecture decisions, real trade-offs stated honestly, real dogfooding results.

## Positioning

Not a novel category -- a small, self-hosted, OpenTelemetry-native implementation of patterns Langfuse (tracing) and promptfoo (eval/regression CI) already proved out, built on the OTel GenAI semantic conventions from day one rather than an invented schema. Being OTel-native from the start is the one differentiator explicitly claimed: even Langfuse bolted OTel support on after the fact. A neighboring "we invented our own observability schema" competitor could not truthfully make the same claim.

## Operating Context

- Self-hosted via `docker compose up -d --build` (Postgres + collector + dashboard, one command).
- Instrumentation is SDK-based (Python decorators/context managers), not a network proxy -- an agent must be instrumented at the code level (or already emit OTel traces) to appear in the dashboard. There is no zero-code "point any agent at this" mode.
- Two real dogfooded integrations exist today: nyu-rag (a single-call RAG answer generator) and undercut (a multi-round Claude tool-use agent, formerly f1-race-strategy-agent) -- both real, separate GitHub repos, both actually instrumented and traced live.
- A CI regression gate (GitHub Action) runs the eval suite on PRs touching the prompt and posts results as a comment, in both dogfooded repos.

## Capabilities and Constraints

- Traces: `chat`/`execute_tool`/`invoke_agent` spans per OTel GenAI semantic conventions, both sync and async target functions. Content capture (prompts/responses) is opt-in and off by default.
- Metrics: real OTel Histogram instruments (`gen_ai.client.operation.duration`, `gen_ai.client.token.usage`), a separate signal from the span-derived SQL aggregates -- both are visualized, kept visually distinct in Analytics.
- Eval: YAML suites, deterministic assertions (`contains`/`regex`/`latency`/`cost`) and LLM-judge assertions (`llm-rubric`/`answer-relevance`), baseline diffing in both the CLI and the dashboard.
- Dashboard: trace explorer (filterable by agent/model/time-range/error-status), trace/span detail, analytics, regression comparison -- all reading real data from the collector, no mock data in the shipped app.
- Constraint (deliberate, not a gap): eval runs are standalone re-invocations of a target function, not scoring of live traffic already in the collector -- closer to how promptfoo actually works.
- Constraint: no auth on the collector or dashboard -- acceptable for a self-hosted personal tool, a real gap if ever run somewhere shared.
- Constraint: connecting a *new* agent requires either code-level instrumentation (adding the SDK, decorating call sites) or the agent already emitting OTel-compliant traces pointed at the collector -- there is no proxy/interception mode.

## Brand Commitments

Name: **Iris** -- the part of the eye that adapts to observe and let in exactly the right amount of light. Chosen deliberately over Prism (NSA-PRISM collision), Oculus (Meta), and Crucible (Atlassian). Short, real word, no notable brand collision. This naming rationale is itself part of the project's documented craft and shouldn't be silently changed.

## Evidence on Hand

- Real screenshots in `docs/screenshots/` (trace explorer, trace detail, analytics, regression) captured against the actual live dashboard with real (though locally-seeded, not production) span/metric data -- not staged mockups.
- Real dogfooding results documented in the README: a live eval run against nyu-rag caught a genuine brittle-regex bug in the eval suite itself; instrumenting undercut's async multi-round agent surfaced and fixed two real SDK gaps (no async support, static-only system-prompt capture) before shipping.
- Real, public GitHub repos with genuine (not staged) commit history: iris, nyu-rag, undercut -- all MIT licensed.
- No demo video/GIF exists yet. No architecture diagram beyond the ASCII one already in the README.

## Product Principles

1. Prior art over invented novelty -- cite Langfuse/promptfoo/OTel GenAI conventions by name rather than implying an invented category.
2. Real validation over claimed validation -- every feature in the README was actually run against a live stack (not just unit-tested) before being described as done; gaps are stated honestly in Roadmap/Limitations rather than hidden.
3. Design for two audiences at once -- a real self-hoster's daily-use needs (Operate mode: scanability, filters, real data) and a reviewer's first-60-seconds needs (Persuade/Experience: the dashboard has to look credible and intentional, not just functional).
4. No fabricated numbers -- e.g. cost-by-model ships with an empty pricing table rather than guessed dollar figures; a missing signal shows as "not tracked" or "not priced," never a plausible-looking fake value.
