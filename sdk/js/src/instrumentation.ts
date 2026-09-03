import { performance } from "node:perf_hooks";
import { SpanStatusCode, type Attributes, type Span } from "@opentelemetry/api";
import { getDurationHistogram, getTokenHistogram } from "./metrics.js";
import { getTracer } from "./tracer.js";

// The GenAI semantic conventions deliberately keep prompt/response content
// out of default telemetry for privacy; capture is opt-in only.
const CAPTURE_CONTENT = (process.env.IRIS_CAPTURE_CONTENT ?? "false").toLowerCase() === "true";

/**
 * Top-level span for one agent operation, per the `invoke_agent` OTel GenAI span kind.
 *
 * `fn` runs with the new span active (so a `traceLlmCall`-wrapped call inside
 * it becomes a child span automatically), and its return value/throw
 * propagates through unchanged. Works for sync or async `fn`.
 */
export async function observe<T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => T | Promise<T>,
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value as never);
    }
    try {
      return await fn(span);
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
      throw err;
    } finally {
      span.end();
    }
  });
}

type ExtractUsage<TResult> = (result: TResult) => [number | undefined, number | undefined] | undefined;
type ExtractFinishReasons<TResult> = (result: TResult) => string | string[] | undefined;
type ExtractMessages<TResult> = (result: TResult) => unknown;

export interface TraceLlmCallOptions<TArgs, TResult> {
  model?: string;
  extractUsage?: ExtractUsage<TResult>;
  extractFinishReasons?: ExtractFinishReasons<TResult>;
  extractMessages?: ExtractMessages<TResult>;
  systemInstructions?: string;
  /** Pull `model`/`messages`/`system` for span attributes out of the call args (default: first arg, as an options-object-style SDK call like Anthropic's `messages.create({...})`). */
  getRequestFields?: (args: TArgs) => { model?: string; messages?: unknown; system?: unknown };
}

const defaultGetRequestFields = (args: unknown[]): { model?: string; messages?: unknown; system?: unknown } => {
  const first = args[0];
  if (first && typeof first === "object") {
    const obj = first as Record<string, unknown>;
    return { model: obj.model as string | undefined, messages: obj.messages, system: obj.system };
  }
  return {};
};

/**
 * Wrap an LLM call in a `chat` span with `gen_ai.*` attributes (OTel GenAI conventions),
 * and record the real OTel Metrics the conventions also specify --
 * gen_ai.client.operation.duration and gen_ai.client.token.usage histograms
 * -- not just span attributes a dashboard has to aggregate after the fact.
 *
 * `extractUsage(result)`, `extractFinishReasons(result)`, and
 * `extractMessages(result)` let callers adapt to their provider's response
 * shape; see `presets/anthropic.ts` for ready-made Anthropic extractors.
 */
export function traceLlmCall<TArgs extends unknown[], TResult>(
  options: TraceLlmCallOptions<TArgs, TResult>,
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  const getRequestFields = options.getRequestFields ?? (defaultGetRequestFields as (args: TArgs) => ReturnType<typeof defaultGetRequestFields>);

  return async (...args: TArgs): Promise<TResult> => {
    const tracer = getTracer();
    return tracer.startActiveSpan("chat", async (span) => {
      const requestFields = getRequestFields(args);
      const resolvedModel = options.model ?? requestFields.model;
      if (resolvedModel) {
        span.setAttribute("gen_ai.request.model", resolvedModel);
      }

      if (CAPTURE_CONTENT) {
        if (requestFields.messages !== undefined) {
          span.setAttribute("gen_ai.input.messages", JSON.stringify(requestFields.messages));
        }
        // systemInstructions covers a static, wrap-time prompt; the call's
        // own `system` field covers one built dynamically per call -- prefer
        // the explicit static one if both happen to be given.
        const resolvedSystem = options.systemInstructions ?? requestFields.system;
        if (resolvedSystem !== undefined) {
          span.setAttribute("gen_ai.system_instructions", String(resolvedSystem));
        }
      }

      const start = performance.now();
      try {
        const result = await fn(...args);
        const durationS = (performance.now() - start) / 1000;

        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        if (options.extractUsage) {
          [inputTokens, outputTokens] = options.extractUsage(result) ?? [undefined, undefined];
          if (inputTokens !== undefined) span.setAttribute("gen_ai.usage.input_tokens", inputTokens);
          if (outputTokens !== undefined) span.setAttribute("gen_ai.usage.output_tokens", outputTokens);
        }

        if (options.extractFinishReasons) {
          const finishReasons = options.extractFinishReasons(result);
          if (finishReasons !== undefined) {
            span.setAttribute("gen_ai.response.finish_reasons", finishReasons);
          }
        }

        if (CAPTURE_CONTENT && options.extractMessages) {
          span.setAttribute("gen_ai.output.messages", JSON.stringify(options.extractMessages(result)));
        }

        const metricAttrs: Attributes = resolvedModel ? { "gen_ai.request.model": resolvedModel } : {};
        getDurationHistogram().record(durationS, metricAttrs);
        if (inputTokens !== undefined) {
          getTokenHistogram().record(inputTokens, { ...metricAttrs, "gen_ai.token.type": "input" });
        }
        if (outputTokens !== undefined) {
          getTokenHistogram().record(outputTokens, { ...metricAttrs, "gen_ai.token.type": "output" });
        }

        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message });
        throw err;
      } finally {
        span.end();
      }
    });
  };
}
