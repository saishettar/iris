"""Per-model USD pricing, in dollars per million tokens -- used to compute
cost-by-model in /metrics/summary from the token counts already captured on
`chat` spans (`gen_ai.usage.input_tokens`/`output_tokens`).

Deliberately empty by default: model pricing changes over time and varies by
provider/contract, and guessing at numbers here would produce a cost figure
that looks authoritative but isn't. Fill in real values for the models you
use (check your provider's current pricing page) -- a model with no entry
here just won't get a cost_usd figure, which is the honest state until you
do.
"""
from __future__ import annotations

# model name -> (input $/M tokens, output $/M tokens)
MODEL_PRICING_USD_PER_MILLION_TOKENS: dict[str, tuple[float, float]] = {}


def estimate_cost_usd(model: str, input_tokens: float, output_tokens: float) -> float | None:
    pricing = MODEL_PRICING_USD_PER_MILLION_TOKENS.get(model)
    if pricing is None:
        return None
    input_price, output_price = pricing
    return (input_tokens / 1_000_000) * input_price + (output_tokens / 1_000_000) * output_price
