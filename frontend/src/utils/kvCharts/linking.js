// src/utils/kvCharts/linking.js

function isUrlLike(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

function hasUrlInField(values, field) {
  if (!field) return false;
  for (const row of values) {
    if (isUrlLike(row?.[field])) return true;
  }
  return false;
}

function getRoleFields(kv) {
  const m = kv?.metadata || {};
  return m.roles || m.encoding || m.fields || {};
}

export function detectUriField(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const roleFields = getRoleFields(kv);

  // Prefer metadata hints first (in order).
  const candidates = [
    roleFields.uri,
    kv?.metadata?.uriField,
    "uri",
    "URI",
    "url",
    "URL",
    "link",
    "Link",
    "href",
    "Href",
  ].filter(Boolean);

  for (const f of candidates) {
    if (hasUrlInField(values, f)) return f;
  }

  // Otherwise: first field in key order that contains URL-like values.
  const keys = Object.keys(values[0] || {});
  for (const k of keys) {
    if (hasUrlInField(values, k)) return k;
  }

  return null;
}
