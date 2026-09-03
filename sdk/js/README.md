# @saishettar/iris-otel

TypeScript instrumentation SDK for [Iris](https://github.com/saishettar/iris), a self-hosted OpenTelemetry-native observability platform for LLM/agent pipelines. Mirrors the Python `iris_otel` package: real `gen_ai.*` spans and metrics over OTLP, per the [OpenTelemetry GenAI semantic conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) — not an invented schema.

## Install

```bash
npm install @saishettar/iris-otel
```

## Usage

```ts
import { observe, traceLlmCall } from "@saishettar/iris-otel";
import { anthropicUsage, anthropicFinishReason } from "@saishettar/iris-otel/presets/anthropic";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const callClaude = traceLlmCall(
  { model: "claude-sonnet-5", extractUsage: anthropicUsage, extractFinishReasons: anthropicFinishReason },
  (params: Anthropic.Messages.MessageCreateParamsNonStreaming) => client.messages.create(params),
);

await observe("invoke_agent", { "gen_ai.agent.name": "my-agent" }, async () => {
  await callClaude({ model: "claude-sonnet-5", max_tokens: 1024, messages: [{ role: "user", content: "hi" }] });
});
```

Spans export to the collector over OTLP/HTTP (`IRIS_OTLP_ENDPOINT`, defaults to `http://localhost:4318/v1/traces`). Set `IRIS_SERVICE_NAME` per app you instrument so multiple agents stay distinguishable in one Iris dashboard. Prompt/response content capture is opt-in (`IRIS_CAPTURE_CONTENT=true`), matching the convention's privacy stance.

See the [main Iris README](https://github.com/saishettar/iris#readme) for the full platform (collector, dashboard, eval runner) and the Python SDK this package mirrors.
