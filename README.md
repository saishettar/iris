# Iris

Self-hosted, OpenTelemetry-native observability platform for LLM/agent pipelines: trace calls, score them automatically, and catch regressions when a prompt or model changes.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.12-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-react-blue.svg)

---

## Why

Every LLM app eventually needs the same three things: know what your pipeline actually did (tracing), know whether its output is any good (eval), and know when a prompt or model change made it worse (regression detection). Most tools that do this either invented their own telemetry schema before OpenTelemetry's GenAI conventions existed, or bolted OTel support on after the fact. Iris is built OTel-native from the start — small, but a real, defensible differentiator over prior art like Langfuse.

## Features

- Python instrumentation SDK (`iris_otel`) emitting real `gen_ai.*` spans per the OpenTelemetry GenAI semantic conventions — `chat`, `execute_tool`, and `invoke_agent` span kinds, both sync and async target functions
- Also emits the conventions' actual OTel *Metrics*: `gen_ai.client.operation.duration` and `gen_ai.client.token.usage` as real Histogram instruments over OTLP, not just span attributes a dashboard aggregates after the fact
- Prompt/response content capture is opt-in and off by default (`IRIS_CAPTURE_CONTENT`), matching the convention's privacy stance
- Hand-rolled OTLP/HTTP collector (FastAPI) that parses the real `ExportTraceServiceRequest`/`ExportMetricsServiceRequest` protobufs directly via `opentelemetry-proto`, rather than wrapping the stock OpenTelemetry Collector binary
- Postgres-backed storage for traces/spans, eval runs, and real OTel metric points, with aggregate queries for trace volume (filterable by agent/model/time-range/error-status), model usage, and real p50/p95/p99 latency percentiles and trends computed from span timestamps
- Traces are labeled by the actual agent that produced them (`gen_ai.agent.name` from the root span, plus the OTel `service.name` resource attribute) rather than a bare hex trace ID — set `IRIS_SERVICE_NAME` per app you instrument so multiple agents stay distinguishable in one dashboard
- Analytics visualizes both signals distinctly: span-derived aggregates above a separate "OTel Metrics" section reading from the actual `gen_ai.client.*` histograms, not merged into one and mislabeled
- Cost-by-model computed from real captured token counts against an editable pricing table — empty by default rather than showing a fabricated number
- YAML-driven eval runner (`iris-eval`) with deterministic assertions (`contains`, `regex`, `latency`, `cost`) and LLM-judge assertions (`llm-rubric`, `answer-relevance`) via Claude, plus CLI-level baseline diffing (`--baseline`)
- Baseline-vs-candidate regression diffing in the dashboard, matched by test description (so added/removed test cases show up correctly, not just reordered rows), with a pass-rate-over-time trend across every run of a suite
- A GitHub Action (in both dogfooded apps) that runs the eval suite on every PR touching the prompt and posts results as a comment, failing the check on regression
- React dashboard (an agent overview with real per-agent SQL rollups, trace explorer, trace/span detail with a real proportional-width waterfall and an alternate call-tree graph view, sessions, analytics, regression, and a live agent-connection page) wired entirely to the real collector API — no mock data left in the shipped app
- Sessions group an agent's multi-turn conversations by a `session.id` span attribute (the same convention Langfuse's SDKs use) — set it once in your own `observe()` call, no SDK change required; a trace with no `session.id` simply isn't part of any session rather than being grouped by a guessed fallback
- Trace Explorer live-tails new traces over Server-Sent Events (`GET /traces/stream`) the moment their spans are queryable — a real push from the collector, not a poll loop — and pauses itself (with a visible reason, not a silent no-op) rather than show arrivals that might not match an active server-side filter
- One-command self-hosted setup: `docker compose up -d` brings up Postgres, the collector, *and* the dashboard

## Tech Stack

**SDK / collector / eval:** Python 3.12, OpenTelemetry SDK, FastAPI, psycopg2, Pydantic, PyYAML, Anthropic SDK
**Storage:** PostgreSQL 16
**Frontend:** React 19, TypeScript, Vite, React Router, shadcn/ui (Radix primitives), Tailwind CSS v4
**Infra:** Docker Compose

## Installation

```bash
git clone https://github.com/saishettar/iris.git
cd iris

docker compose up -d --build   # Postgres + collector + dashboard
```

Dashboard at `http://localhost:5173`, collector at `http://localhost:4318` (the OTLP default). For frontend dev iteration instead of the built container, run `cd frontend && npm install && npm run dev` — `VITE_API_BASE_URL` (see `frontend/.env.example`) points it at a different collector if needed.

To also run eval suites with `llm-rubric` assertions, set `ANTHROPIC_API_KEY` in your environment.

## Usage

Once the stack is up, the dashboard's own **Connect** page (`/connect`) walks through
these same steps live against your running collector, with a real "waiting for your
first trace" status that flips the moment one lands. What follows here is the same
information for reading outside the app.

**Instrument an LLM call** (works on sync or async functions):

```python
from iris_otel import observe, trace_llm_call
from iris_otel.presets import anthropic_usage, anthropic_finish_reason

@trace_llm_call(model="claude-sonnet-5", extract_usage=anthropic_usage, extract_finish_reasons=anthropic_finish_reason)
def call_claude(**kwargs):
    return client.messages.create(**kwargs)

with observe("invoke_agent", **{"gen_ai.agent.name": "my-agent"}):
    call_claude(messages=[...])
```

Spans export to the collector automatically (`IRIS_OTLP_ENDPOINT`, defaults to `http://localhost:4318/v1/traces`).

**Run an eval suite:**

```bash
cd eval/examples
iris-eval fixture_suite.yaml --no-judge
```

```
[PASS] cites the course code it recommends (0ms)
    ok  regex: expected output to match /\[CS-GY 6763\]/
    ok  contains: expected output to contain 'Algorithms'
    ok  latency: 0ms vs threshold 1000ms

1/1 passed
```

Add `--out results.json --version-tag <label>` and `POST` the file to `/eval-runs` to store it and see it in the Regression dashboard view.

## Project Structure

```
├── sdk/
│   └── iris_otel/            # observe(), trace_llm_call(), Anthropic presets
│       ├── tracer.py          # Span export (OTLP/HTTP)
│       └── metrics.py         # Real Histogram instruments (OTLP/HTTP)
├── collector/
│   └── iris_collector/
│       ├── main.py           # FastAPI app: OTLP ingest + query endpoints
│       ├── otlp.py           # Trace protobuf -> row dicts
│       ├── otlp_metrics.py   # Metrics protobuf -> row dicts
│       ├── otlp_attrs.py     # Shared KeyValue-list parsing
│       ├── db.py             # Postgres schema, queries, aggregates
│       └── pricing.py        # Per-model $/M-token table (empty by default)
├── eval/
│   └── iris_eval/            # YAML suite loader, assertions, LLM-judge, diff, CLI
├── frontend/
│   └── src/
│       ├── pages/            # Overview, TraceExplorer, TraceDetail, Analytics, Regression, Connect
│       ├── components/       # Layout shell + shadcn/ui primitives
│       └── lib/api.ts        # Typed fetch client for the collector
├── docs/screenshots/
├── docker-compose.yml        # Postgres + collector + frontend, one command
└── observability_platform_scope.md   # Original planning doc (direction, not a spec)
```

## Dogfooding results

Iris is instrumented into two other real projects, not synthetic test traffic:

- **[nyu-rag](https://github.com/saishettar/nyu-rag)** — a single-call RAG answer generator. First real eval run against it caught a genuine bug in the eval suite itself: a regex assertion failed on a correct answer because the model's phrasing varied between calls. Replaced with an `llm-rubric` assertion; both cases pass consistently now.
- **[undercut](https://github.com/saishettar/undercut)** (formerly f1-race-strategy-agent) — a multi-round Claude tool-use agent making live pit-strategy calls. Instrumenting this (a materially different shape than nyu-rag's single call) surfaced two real gaps in the SDK: `trace_llm_call` didn't support `async` target functions, and system-prompt capture only worked for a static, decoration-time string, not one built per call from request state. Both fixed before this integration shipped. Its eval suite runs the agent against real cached race-session data (not synthetic curves), grading both the verdict and whether the reasoning cites the right factors.

Running the real stack locally also caught a bug no mocked test could: the collector had no CORS headers, so `curl`/`TestClient` saw a fine response while an actual browser on the dashboard's own origin got silently blocked. Fixed with `CORSMiddleware`.

## Architecture

```
iris_otel SDK                    collector (FastAPI)              Postgres
  │                                  │
  │ @trace_llm_call / observe()      │
  │ chat / execute_tool /            │
  │ invoke_agent spans               │
  │ + duration/token histograms      │
  ▼                                  │
  OTLP/HTTP ───────────────────────▶ │ POST /v1/traces              traces
                                     │ POST /v1/metrics              spans
                                     │ (real protobuf parsing,       metric_points
                                     │  no OTel Collector binary)
                                     │
eval/ (iris-eval CLI)               │
  YAML suite → assertions           │
  (contains/regex/latency/cost/     │
   llm-rubric/answer-relevance)     │
  --out results.json ─────────────▶ │ POST /eval-runs             eval_runs
  --baseline <prev>  (CLI diff)     │ ───────────────────────────▶ eval_results
                                     │
                                     │ GET /traces (+filters),
                                     │     /eval-runs, /metrics/summary,
                                     │     /metrics/otel-summary, /metrics/raw
                                     │ GET /traces/stream (SSE, live tail)
                                     ▼
                              React dashboard
                        (trace explorer/detail,
                          analytics, regression)
```

**Prior art, and where Iris sits relative to it:** this isn't a novel category. [Langfuse](https://langfuse.com) is the closest direct analog — SDK-based tracing, nested spans, built-in evals — but added OpenTelemetry support after the fact rather than being built on it. [promptfoo](https://www.promptfoo.dev) is the real prior art for "CI for prompts": YAML test cases, deterministic + model-graded assertions, a GitHub Action that fails a PR on regression — Iris's eval layer follows its config/assertion shape directly rather than inventing one. The [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) are the genuinely current, less-settled piece: recent enough that several established tools (Langfuse included) added them on top of an existing schema instead of starting from them. Being OTel-native from day one — real `gen_ai.*` spans over real OTLP, not an invented JSON shape — is the one small, explainable differentiator this project actually claims.

## Roadmap / Limitations

Every real gap against the original plan (no OTel Metrics signal, missing
`cost`/`answer-relevance` assertions, trace filtering, eval/latency trend
charts, no CLI baseline diff, `undercut` had no eval suite, `docker compose
up` didn't include the frontend, and Analytics not visualizing the OTel
metric points once they existed) has been closed — each verified against
the live stack, not just unit-tested in isolation. What's left is a genuine
design decision, not an oversight:

- Eval runs are standalone re-invocations of the target function, not
  scoring of live traffic already flowing through the collector — closer to
  how promptfoo actually works than the platform-integrated version
  originally planned. Follows that filtering traces by eval score isn't
  possible either, for the same reason
- No auth on the collector or dashboard — fine for a self-hosted personal
  tool, worth flagging if this ever runs somewhere shared

**Stretch goals, not started:** multi-provider support beyond Claude, cost-spike alerting, OpenTelemetry Collector export/import interop.

## License

[MIT](LICENSE)

## Acknowledgments

- [Langfuse](https://langfuse.com) and [promptfoo](https://www.promptfoo.dev), whose patterns this project follows rather than reinvents
- The [OpenTelemetry GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) working group
- Dogfooded against [nyu-rag](https://github.com/saishettar/nyu-rag) and [undercut](https://github.com/saishettar/undercut), two other real projects of mine
