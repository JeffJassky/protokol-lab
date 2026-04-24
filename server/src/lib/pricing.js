// Model pricing registry. Values are USD per 1M tokens. Gemini preview prices
// are estimates — verify against the official Google AI pricing page and
// update when models move to GA or change tiers.
//
// https://ai.google.dev/gemini-api/docs/pricing

const MILLION = 1_000_000;

const PRICING = {
  'gemini-3-flash-preview': {
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    // Cached input tokens get the implicit-cache discount (~75% off).
    cachedInputPer1M: 0.075,
  },
  'gemini-2.5-flash': {
    inputPer1M: 0.30,
    outputPer1M: 2.50,
    cachedInputPer1M: 0.075,
  },
  'gemini-2.5-pro': {
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    cachedInputPer1M: 0.3125,
  },
};

const FALLBACK_MODEL_ID = 'gemini-3-flash-preview';

// Google Search grounding. Billed per query issued by the model. Verify
// current rate at: https://ai.google.dev/gemini-api/docs/pricing
export const SEARCH_COST_USD_PER_QUERY = 0.035;

export function getModelPricing(model) {
  return PRICING[model] || PRICING[FALLBACK_MODEL_ID];
}

/**
 * Compute USD cost for one chat turn.
 * @param {{
 *   model: string,
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   cachedInputTokens?: number,
 *   searchCalls?: number,
 * }} args
 * @returns {{
 *   inputCostUsd: number,
 *   outputCostUsd: number,
 *   searchCostUsd: number,
 *   totalCostUsd: number,
 * }}
 */
export function calculateCost({
  model,
  inputTokens = 0,
  outputTokens = 0,
  cachedInputTokens = 0,
  searchCalls = 0,
}) {
  const p = getModelPricing(model);
  // Cached tokens are counted inside inputTokens by Gemini — back them out
  // before applying the full input rate, then charge them at the cache rate.
  const freshInput = Math.max(0, inputTokens - cachedInputTokens);
  const freshInputCost = (freshInput * p.inputPer1M) / MILLION;
  const cachedInputCost = (cachedInputTokens * p.cachedInputPer1M) / MILLION;
  const outputCostUsd = (outputTokens * p.outputPer1M) / MILLION;
  const searchCostUsd = searchCalls * SEARCH_COST_USD_PER_QUERY;
  const inputCostUsd = freshInputCost + cachedInputCost;
  const totalCostUsd = inputCostUsd + outputCostUsd + searchCostUsd;
  return { inputCostUsd, outputCostUsd, searchCostUsd, totalCostUsd };
}
