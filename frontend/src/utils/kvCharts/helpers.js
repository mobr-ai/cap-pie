// src/utils/kvCharts/helpers.js
export const safeColumns = (kv) =>
  Array.isArray(kv?.metadata?.columns)
    ? kv.metadata.columns.filter(Boolean)
    : [];

export const uniqueCount = (arr) => {
  const s = new Set();
  for (const v of arr || []) s.add(String(v));
  return s.size;
};

export const shortSeries = (s) =>
  String(s).length > 18 ? String(s).slice(0, 16) + "…" : String(s);

export function inferXYFields(values, cols) {
  const sample = values?.[0] || {};
  const keys = Object.keys(sample);

  if (keys.includes("x") && keys.includes("y"))
    return { xField: "x", yField: "y" };

  const xCandidate =
    keys.find((k) => k.toLowerCase().includes("x")) ||
    keys.find((k) => k.toLowerCase().includes("time")) ||
    keys[0];

  const yCandidate =
    keys.find((k) => k.toLowerCase().includes("y")) ||
    keys.find((k) => k.toLowerCase().includes("fee")) ||
    keys.find((k) => k.toLowerCase().includes("value")) ||
    keys[1] ||
    keys[0];

  return { xField: xCandidate, yField: yCandidate };
}

export function shouldUseLogScale(nums) {
  const arr = (nums || []).filter(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (arr.length < 8) return false;

  let min = Infinity;
  let max = -Infinity;
  for (const v of arr) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0) return false;

  return max / min >= 1000;
}
