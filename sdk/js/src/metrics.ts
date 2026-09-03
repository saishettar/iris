/**
 * Real OTel Metrics (not just span attributes): gen_ai.client.operation.duration
 * and gen_ai.client.token.usage as actual Histogram instruments, exported over
 * OTLP -- mirrors the Python iris_otel SDK's metrics.py so both languages emit
 * the same two instruments the OTel GenAI semantic conventions specify.
 */
import { metrics, type Histogram } from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

let initialized = false;
let durationHistogram: Histogram | null = null;
let tokenHistogram: Histogram | null = null;

function initMeterProvider(): void {
  if (initialized) return;

  const endpoint = process.env.IRIS_OTLP_METRICS_ENDPOINT ?? "http://localhost:4318/v1/metrics";
  const serviceName = process.env.IRIS_SERVICE_NAME ?? "iris-instrumented-app";
  const exportIntervalMillis = Number(process.env.IRIS_METRICS_EXPORT_INTERVAL_MS ?? "5000");

  const reader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: endpoint }),
    exportIntervalMillis,
  });
  const provider = new MeterProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    readers: [reader],
  });
  metrics.setGlobalMeterProvider(provider);
  initialized = true;
}

function getMeter() {
  initMeterProvider();
  return metrics.getMeter("iris_otel");
}

export function getDurationHistogram(): Histogram {
  if (!durationHistogram) {
    durationHistogram = getMeter().createHistogram("gen_ai.client.operation.duration", {
      unit: "s",
      description: "Duration of a GenAI client operation",
    });
  }
  return durationHistogram;
}

export function getTokenHistogram(): Histogram {
  if (!tokenHistogram) {
    tokenHistogram = getMeter().createHistogram("gen_ai.client.token.usage", {
      unit: "{token}",
      description: "Tokens used per GenAI client operation, by gen_ai.token.type",
    });
  }
  return tokenHistogram;
}
