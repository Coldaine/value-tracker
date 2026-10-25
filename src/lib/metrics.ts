import { modelById, plans, vendorById } from "./data";
import type { Model, Plan, PlanMetrics, Settings } from "./types";
import { normalizeSettings } from "./settings";
export { DEFAULT_SETTINGS } from "./settings";

/**
 * Reference agentic-coding workload, per 1M output tokens. Agent loops re-read
 * the same context every turn, so cache reads dominate. Editable here, and
 * documented on the Methodology page.
 */
export const WORKLOAD = { cacheReadPerOut: 40, cacheWritePerOut: 2, freshInputPerOut: 4 };

/** USD to produce 1M output tokens (plus the context an agent reads to get there). */
export function allInCostPerMOut(m: Model): number | null {
  if (m.input == null || m.output == null) return null;
  const cacheRead = m.cacheRead ?? m.input * 0.1;
  const cacheWrite = m.cacheWrite ?? m.input * 1.25;
  return (
    m.output +
    WORKLOAD.cacheReadPerOut * cacheRead +
    WORKLOAD.cacheWritePerOut * cacheWrite +
    WORKLOAD.freshInputPerOut * m.input
  );
}

/** Used only when a plan's best model has no known API price. */
const FALLBACK_TOKEN_MODEL_ID = "sonnet-5.5";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const logNorm = (x: number, lo: number, hi: number) =>
  clamp01((Math.log(x) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)));

// Fixed anchors keep scores stable when the table is filtered.
const ANCHORS = {
  multiple: [0.4, 12] as const,
  capacityM: [0.1, 100] as const,
  intel: [30, 58] as const,
};

export function computeMetrics(input: Settings, list: Plan[] = plans): PlanMetrics[] {
  const settings = normalizeSettings(input);
  const fallback = modelById(FALLBACK_TOKEN_MODEL_ID)!;
  let w = settings.weights;
  const maxWeight = Math.max(w.value, w.intel, w.capacity);
  // A common factor cancels in the weighted mean. Scale only extreme finite
  // inputs so the sum and multiplication by 100 cannot overflow.
  if (maxWeight > Number.MAX_VALUE / 300) {
    w = { value: w.value / maxWeight, intel: w.intel / maxWeight, capacity: w.capacity / maxWeight };
  }

  const rows = list
    .filter((p) => settings.basisFilter === "all" || p.basis === "published")
    .map((plan) => {
      const override = settings.overrides[plan.id];
      const overridden = override !== undefined;
      const apiValue = overridden ? override : plan.apiValue[settings.scenario];
      const multiple = apiValue / plan.price;
      const topModel = modelById(plan.topModelId);
      const tokenModelAssumed = !topModel || allInCostPerMOut(topModel) == null;
      const tokenModel = tokenModelAssumed ? fallback : topModel!;
      const outputTokensM = apiValue / allInCostPerMOut(tokenModel)!;
      const intel = topModel?.aaIndex ?? null;

      const vN = logNorm(Math.max(multiple, 1e-6), ...ANCHORS.multiple);
      const cN = logNorm(Math.max(outputTokensM, 1e-6), ...ANCHORS.capacityM);
      let num = w.value * vN + w.capacity * cN;
      let den = w.value + w.capacity;
      if (intel != null) {
        num += w.intel * clamp01((intel - ANCHORS.intel[0]) / (ANCHORS.intel[1] - ANCHORS.intel[0]));
        den += w.intel;
      }
      const score = den > 0 ? (100 * num) / den : 0;

      return {
        plan,
        vendor: vendorById(plan.vendorId),
        apiValue,
        overridden,
        multiple,
        subsidyPct: (multiple - 1) * 100,
        outputTokensM,
        // Zero API value buys no output: Infinity is rendered as n/a by usd().
        costPerMOut: plan.price / outputTokensM,
        intel,
        topModel,
        tokenModel,
        tokenModelAssumed,
        score,
      } satisfies PlanMetrics;
    });

  return rows;
}
