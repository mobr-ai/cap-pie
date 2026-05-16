// src/utils/landingMessageOps.js

import { kvToChartSpec } from "@/utils/kvCharts";

// ...

export function artifactToMessage(a) {
  if (!a || !a.id || !a.artifact_type || !a.config) return null;

  const rawType = String(a.artifact_type || "")
    .trim()
    .toLowerCase();
  const kv = a.config?.kv || null;

  // Only artifacts we can render
  if (!kv) return null;

  const id = `artifact_${a.id}`;

  if (rawType === "table" || rawType === "kv_table" || rawType === "kv") {
    return {
      id,
      role: "assistant",
      type: "table",
      title: a.title || "",
      content: a.source_query || "",
      kv, // LandingPage expects m.kv for KVTable
      created_at: a.created_at || null,
      artifact_id: a.id,
      config: a.config || null,
    };
  }

  if (rawType === "chart") {
    const vegaSpec = kvToChartSpec(kv);
    if (!vegaSpec) return null;

    return {
      id,
      role: "assistant",
      type: "chart",
      title: a.title || "",
      content: a.source_query || "",
      vegaSpec, // LandingPage expects m.vegaSpec for VegaChart
      created_at: a.created_at || null,
      artifact_id: a.id,
      config: a.config || null,
    };
  }

  return null;
}

export function mergeById(prev, next) {
  const map = new Map();
  (prev || []).forEach((m) => map.set(m.id, m));
  (next || []).forEach((m) => map.set(m.id, m));
  return Array.from(map.values());
}

export function injectArtifactsAfterMessage(restoredMsgs, artifacts) {
  const msgs = Array.isArray(restoredMsgs) ? restoredMsgs.slice() : [];
  const artifactsArr = Array.isArray(artifacts) ? artifacts : [];
  if (!artifactsArr.length) return msgs;

  const toNum = (v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && !Number.isNaN(n) ? n : null;
  };

  const getMsgNumericId = (m) => {
    // Preferred: explicit numeric id attached when restoring from conversation endpoint
    const explicit = toNum(m?.conv_message_id);
    if (explicit != null) return explicit;

    // Fallback: parse "conv_123"
    const id = m?.id;
    if (typeof id === "string" && id.startsWith("conv_")) {
      const parsed = toNum(id.slice("conv_".length));
      if (parsed != null) return parsed;
    }

    return null;
  };

  // Build a map: anchor_message_numeric_id -> artifact messages[]
  const byAnchor = new Map();

  for (const a of artifactsArr) {
    const am = artifactToMessage(a);
    if (!am) continue;

    // Backend uses conversation_message_id to reference the triggering message (usually the user message)
    // Keep fallbacks for compatibility.
    const anchor =
      toNum(a?.conversation_message_id) ??
      toNum(a?.assistant_message_id) ??
      toNum(a?.message_id);

    if (anchor == null) continue;

    if (!byAnchor.has(anchor)) byAnchor.set(anchor, []);
    byAnchor.get(anchor).push(am);
  }

  if (!byAnchor.size) return msgs;

  // Insert artifacts *after* their anchor message.
  // If anchor is the user message, artifacts will appear before the assistant message (stream-consistent).
  const out = [];
  for (const m of msgs) {
    out.push(m);

    const mid = getMsgNumericId(m);
    if (mid == null) continue;

    const inserts = byAnchor.get(mid);
    if (inserts?.length) {
      for (const im of inserts) out.push(im);
    }
  }

  return out;
}

const isWS = (ch) => /\s/.test(ch || "");
const isAlphaNum = (ch) => /[A-Za-z0-9]/.test(ch || "");
const isDigit = (ch) => /[0-9]/.test(ch || "");

export function appendChunkSmart(prev, chunk) {
  if (!chunk) return prev || "";
  if (!prev) return chunk;

  const lastChar = prev.slice(-1);
  const firstChar = chunk[0];

  // If chunk already starts with whitespace, keep as-is
  if (isWS(firstChar)) return prev + chunk;

  // Avoid gluing words: if previous ends in alphanum and chunk starts in alphanum, add a space
  if (isAlphaNum(lastChar) && isAlphaNum(firstChar)) return prev + " " + chunk;

  // Avoid gluing decimals: "3." + "14" should be "3.14"
  if (lastChar === "." && isDigit(firstChar)) return prev + chunk;

  // Avoid gluing punctuation after letters/numbers
  if (
    isAlphaNum(lastChar) &&
    [",", ".", ":", ";", "!", "?", ")"].includes(firstChar)
  )
    return prev + chunk;

  // Avoid "word(" -> add space before "(" if needed
  if (isAlphaNum(lastChar) && firstChar === "(") return prev + " " + chunk;

  return prev + chunk;
}

export function normalizeKvResultType(rt) {
  const s = String(rt || "")
    .trim()
    .toLowerCase();
  if (s === "kv_table" || s === "kv") return "kv_table";
  if (s === "table") return "kv_table";
  return s || rt;
}
