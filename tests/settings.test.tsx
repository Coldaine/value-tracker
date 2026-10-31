import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsProvider, useSettings } from "../src/components/SettingsProvider";
import { plans } from "../src/lib/data";
import { mult, tokensM, usd } from "../src/lib/format";
import { computeMetrics, DEFAULT_SETTINGS } from "../src/lib/metrics";
import { normalizeSettings, overrideSettings, parseSettings, updateSettings } from "../src/lib/settings";
import type { Settings } from "../src/lib/types";

const id = plans[0].id;
const metrics = (input: unknown) => computeMetrics(input as Settings);

test("malformed JSON and non-object roots recover defaults", () => {
  for (const raw of [null, "", "{", "null", "[]", "[1]", "42", "true", '"high"']) {
    assert.deepEqual(parseSettings(raw), DEFAULT_SETTINGS);
  }
  for (const value of [undefined, null, [], 42, "high", true]) {
    assert.deepEqual(normalizeSettings(value), DEFAULT_SETTINGS);
    assert.deepEqual(metrics(value), metrics(DEFAULT_SETTINGS));
  }
});

test("nested fields recover individually without losing valid preferences", () => {
  for (const nested of [null, [], "bad", 5]) {
    const input = { scenario: "low", basisFilter: "published", weights: nested, overrides: nested };
    assert.deepEqual(normalizeSettings(input), { ...DEFAULT_SETTINGS, scenario: "low", basisFilter: "published" });
    assert.deepEqual(metrics(input), metrics({ ...DEFAULT_SETTINGS, scenario: "low", basisFilter: "published" }));
  }
  assert.deepEqual(normalizeSettings({ weights: { value: 0, intel: -1 } }).weights,
    { value: 0, intel: 35, capacity: 25 });
  for (const invalid of [-1, NaN, Infinity, -Infinity, "25", null, {}, []]) {
    const result = normalizeSettings({ weights: { value: invalid }, overrides: { [id]: invalid } });
    assert.deepEqual(result, DEFAULT_SETTINGS);
    assert.deepEqual(metrics({ weights: { value: invalid }, overrides: { [id]: invalid } }), metrics(DEFAULT_SETTINGS));
  }
  assert.deepEqual(parseSettings('{"weights":{"value":1e999},"overrides":{"claude-pro":1e999}}'), DEFAULT_SETTINGS);
});

test("only valid scenario/basis enums and own catalog override keys survive", () => {
  for (const invalid of [null, [], {}, "unknown", "toString", "__proto__", 0]) {
    assert.deepEqual(normalizeSettings({ scenario: invalid, basisFilter: invalid }), DEFAULT_SETTINGS);
    assert.deepEqual(metrics({ scenario: invalid, basisFilter: invalid }), metrics(DEFAULT_SETTINGS));
  }
  const polluted = JSON.parse('{"__proto__":{"scenario":"low"},"weights":{"__proto__":{"value":0}},"overrides":{"__proto__":1,"constructor":2,"unknown":3}}');
  assert.deepEqual(normalizeSettings(polluted), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(Object.create({ scenario: "low", weights: { value: 0 } })), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ weights: Object.create({ value: 0 }), overrides: Object.create({ [id]: 20 }) }), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ overrides: Object.assign([], { [id]: 20 }) }), DEFAULT_SETTINGS);
});

test("valid preferences and overrides round trip, including published plans and zero", () => {
  const published = plans.find((p) => p.basis === "published")!;
  for (const scenario of ["low", "mid", "high"] as const) {
    const valid: Settings = { scenario, basisFilter: "published", weights: { value: 0, intel: 12.5, capacity: 1000 }, overrides: { [id]: 0, [published.id]: 123.5 } };
    assert.deepEqual(parseSettings(JSON.stringify(valid)), valid);
    assert.deepEqual(normalizeSettings(valid), valid);
    const rows = metrics(valid);
    assert.ok(rows.every((r) => r.plan.basis === "published"));
    assert.equal(rows.find((r) => r.plan.id === published.id)!.apiValue, 123.5);
  }
});

test("mutation boundary preserves omitted fields and clears invalid overrides", () => {
  const current = { ...DEFAULT_SETTINGS, scenario: "low", overrides: { [id]: 12 } };
  assert.equal(updateSettings(current, { basisFilter: "published" }).scenario, "low");
  assert.deepEqual(updateSettings(current, { weights: { value: 0 } }).weights, { value: 0, intel: 35, capacity: 25 });
  assert.equal(updateSettings(current, { scenario: "bad" }).scenario, "high");
  for (const patch of [null, [], 3, Object.create({ scenario: "mid" })]) {
    assert.deepEqual(updateSettings(current, patch), current);
  }
  for (const value of [null, NaN, Infinity, -Infinity, -1, "10"]) {
    assert.deepEqual(overrideSettings(current, id, value).overrides, {});
  }
  assert.equal(overrideSettings(current, id, 0).overrides[id], 0);
  for (const key of ["unknown", "__proto__", "constructor"]) {
    assert.deepEqual(overrideSettings(current, key, 20), current);
  }
  assert.equal(current.overrides[id], 12);
});

test("provider context mutations persist normalized settings with the existing key; SSR stays default", () => {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  let ctx!: ReturnType<typeof useSettings>;
  function Probe() { ctx = useSettings(); return null; }
  const render = () => renderToStaticMarkup(<SettingsProvider><Probe /></SettingsProvider>);
  const saved = () => JSON.parse(storage.get("value-tracker:settings:v1")!);
  try {
    render();
    ctx.reset();
    ctx.update({ scenario: "low" });
    ctx.setOverride(id, Infinity);
    assert.equal(saved().scenario, "low");
    assert.deepEqual(saved().overrides, {});
    ctx.setOverride(id, 0);
    assert.equal(saved().overrides[id], 0);
    ctx.update({ weights: null, scenario: "bad" } as unknown as Partial<Settings>);
    assert.deepEqual(saved().weights, DEFAULT_SETTINGS.weights);
    assert.equal(saved().scenario, "high");
    assert.equal(saved().overrides[id], 0);
    render();
    assert.deepEqual(ctx.settings, DEFAULT_SETTINGS);
    assert.equal(ctx.isCustomised, false);
    ctx.reset();
    assert.equal(storage.size, 0);
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("zero capacity remains real and display-compatible; zero weights produce zero scores", () => {
  const row = metrics({ overrides: { [id]: 0 } })[0];
  assert.equal(row.overridden, true);
  assert.equal(row.apiValue, 0);
  assert.equal(row.multiple, 0);
  assert.equal(row.outputTokensM, 0);
  assert.equal(row.subsidyPct, -100);
  assert.equal(row.costPerMOut, Infinity);
  assert.equal(usd(row.costPerMOut), "n/a");
  assert.equal(tokensM(row.outputTokensM), "0K");
  assert.equal(mult(row.multiple), "0.0x");
  assert.ok(Number.isFinite(row.score));
  assert.ok(row.score >= 0 && row.score <= 100);
  assert.ok(metrics({ weights: { value: 0, intel: 0, capacity: 0 } }).every((r) => r.score === 0));
});

test("extreme finite weights do not overflow the weighted mean", () => {
  const rows = metrics({ weights: { value: Number.MAX_VALUE, intel: Number.MAX_VALUE, capacity: Number.MAX_VALUE }, overrides: { [id]: Number.MAX_VALUE } });
  assert.equal(rows[0].apiValue, Number.MAX_VALUE);
  assert.ok(rows.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100));
  const equalWeights = metrics({ weights: { value: 1, intel: 1, capacity: 1 } });
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].score, equalWeights[i].score);
});

test("an inherited key such as toString is not treated as an override", () => {
  const plan = { ...plans[0], id: "toString" };
  const [row] = computeMetrics(DEFAULT_SETTINGS, [plan]);
  assert.equal(row.overridden, false);
  assert.ok(Number.isFinite(row.apiValue));
});
