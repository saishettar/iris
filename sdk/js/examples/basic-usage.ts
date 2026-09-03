/**
 * Standalone sanity check for iris-otel -- no API key or collector required.
 *
 * Exports to a console exporter instead of OTLP so it can be run without a
 * running collector. Run: `npx tsx examples/basic-usage.ts` from `sdk/js/`.
 */
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import * as irisTracer from "../src/tracer.js";
import { observe, traceLlmCall } from "../src/instrumentation.js";

// Point the global tracer provider at a console exporter for this demo,
// bypassing tracer.ts's own OTLP setup (no collector needed to try it out).
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({ "service.name": "iris-example" }),
  spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
});
provider.register();
irisTracer._markInitialized(); // skip iris-otel's own OTLP init, we set the provider above

interface FakeResponse {
  model: string;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

const fakeLlmCall = traceLlmCall<[{ model: string; messages: unknown }], FakeResponse>(
  {
    model: "claude-sonnet-5",
    extractUsage: (response) => [response.usage.input_tokens, response.usage.output_tokens],
    extractFinishReasons: (response) => response.stop_reason,
  },
  async (_args) => ({
    model: "claude-sonnet-5",
    stop_reason: "end_turn",
    usage: { input_tokens: 42, output_tokens: 17 },
  }),
);

await observe("invoke_agent", { "gen_ai.agent.name": "example-agent" }, async () => {
  await fakeLlmCall({ model: "claude-sonnet-5", messages: [{ role: "user", content: "hello" }] });
});
