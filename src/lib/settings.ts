import { plans } from "./data";
import type { Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  scenario: "high",
  basisFilter: "all",
  weights: { value: 40, intel: 35, capacity: 25 },
  overrides: {},
};

const planIds = new Set(plans.map((plan) => plan.id));
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const own = (value: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Recover each invalid field independently; never coerce persisted values. */
export function normalizeSettings(value: unknown): Settings {
  const input = record(value);
  const scenario = own(input, "scenario");
  const basisFilter = own(input, "basisFilter");
  const weights = record(own(input, "weights"));
  const weight = (key: keyof Settings["weights"]) => {
    const value = own(weights, key);
    return nonnegative(value) ? value : DEFAULT_SETTINGS.weights[key];
  };
  const overrides: Settings["overrides"] = {};
  // Iterate the catalog, not arbitrary keys. Both plan bases accept overrides,
  // as computeMetrics did before; stale/unknown plan IDs have no effect.
  const supplied = record(own(input, "overrides"));
  for (const id of planIds) {
    const value = own(supplied, id);
    if (nonnegative(value)) overrides[id] = value;
  }
  return {
    scenario: scenario === "low" || scenario === "mid" || scenario === "high"
      ? scenario : DEFAULT_SETTINGS.scenario,
    basisFilter: basisFilter === "all" || basisFilter === "published"
      ? basisFilter : DEFAULT_SETTINGS.basisFilter,
    weights: { value: weight("value"), intel: weight("intel"), capacity: weight("capacity") },
    overrides,
  };
}

export function parseSettings(raw: string | null): Settings {
  try {
    return normalizeSettings(raw === null ? undefined : JSON.parse(raw));
  } catch {
    return normalizeSettings(undefined);
  }
}

export function updateSettings(current: unknown, patch: unknown): Settings {
  const input = record(patch);
  const next = normalizeSettings(current);
  // Preserve omitted top-level preferences; supplied nested fields are recovered
  // against defaults, just like a stored payload.
  for (const key of ["scenario", "basisFilter", "weights", "overrides"] as const) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      Object.assign(next, { [key]: input[key] });
    }
  }
  return normalizeSettings(next);
}

export function overrideSettings(current: unknown, planId: string, value: unknown): Settings {
  const next = normalizeSettings(current);
  if (planIds.has(planId)) {
    // Match Controls: clearing or submitting an invalid number restores the plan.
    if (nonnegative(value)) next.overrides[planId] = value;
    else delete next.overrides[planId];
  }
  return next;
}
