import { trace, type Tracer } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

let initialized = false;

function initTracerProvider(): void {
  if (initialized) return;

  const endpoint = process.env.IRIS_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces";
  const serviceName = process.env.IRIS_SERVICE_NAME ?? "iris-instrumented-app";

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint }))],
  });
  provider.register();
  initialized = true;
}

export function getTracer(): Tracer {
  initTracerProvider();
  return trace.getTracer("iris_otel");
}

/** Test-only hook, mirrors the Python SDK's escape hatch for swapping in a console exporter. */
export function _markInitialized(): void {
  initialized = true;
}
