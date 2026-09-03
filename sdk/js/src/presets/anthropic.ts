/** Ready-made extractors for `traceLlmCall`, keyed to the `@anthropic-ai/sdk` response shape. */

interface AnthropicUsageLike {
  input_tokens?: number;
  output_tokens?: number;
}

interface AnthropicResponseLike {
  usage?: AnthropicUsageLike;
  stop_reason?: string | null;
  content?: Array<{ type?: string; text?: string }>;
}

export function anthropicUsage(response: AnthropicResponseLike): [number | undefined, number | undefined] {
  const usage = response?.usage;
  if (!usage) return [undefined, undefined];
  return [usage.input_tokens, usage.output_tokens];
}

export function anthropicFinishReason(response: AnthropicResponseLike): string | undefined {
  return response?.stop_reason ?? undefined;
}

export function anthropicOutputText(response: AnthropicResponseLike): string[] {
  const content = response?.content ?? [];
  return content.filter((block) => block?.type === "text").map((block) => block.text ?? "");
}
