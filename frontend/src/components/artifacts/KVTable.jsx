// src/components/artifacts/KVTable.jsx
import React, { useMemo, useState } from "react";

/**
 * Shared guard to decide if a KV result is a *valid* table.
 * Use this before rendering or pinning.
 */
export function isValidKVTable(kv) {
  if (!kv || typeof kv !== "object") return false;

  const meta = kv.metadata || {};
  const dataValues = Array.isArray(kv?.data?.values) ? kv.data.values : [];

  // Hard rule: if backend says count 0, treat as invalid,
  // even if data.values was mistakenly filled.
  if (typeof meta.count === "number" && meta.count <= 0) {
    return false;
  }

  const rawColumns = Array.isArray(meta.columns) ? meta.columns : [];
  const columns = rawColumns
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter((c) => c.length > 0);

  // Must have declared columns AND column data
  if (!columns.length || !dataValues.length) return false;

  // Must have at least one non-empty cell
  const maxLen = Math.max(...dataValues.map((c) => c.values?.length || 0));
  if (!Number.isFinite(maxLen) || maxLen === 0) return false;

  let hasNonEmpty = false;
  for (let i = 0; i < maxLen && !hasNonEmpty; i++) {
    for (let c = 0; c < dataValues.length && !hasNonEmpty; c++) {
      const val = dataValues[c]?.values?.[i];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        hasNonEmpty = true;
      }
    }
  }

  return hasNonEmpty;
}

/** Convert some non-http schemes to clickable web URLs. */
function normalizeHref(href) {
  if (!href) return "";
  const h = String(href).trim();
  if (!h) return "";

  // Handle protocol-relative: //example.com
  if (h.startsWith("//")) return `https:${h}`;

  // Handle ipfs://CID/path -> https://ipfs.io/ipfs/CID/path
  if (h.toLowerCase().startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${h.slice("ipfs://".length)}`;
  }

  // Handle www.example.com
  if (/^www\./i.test(h)) return `https://${h}`;

  return h;
}

/**
 * Parse a cell string that might contain:
 * - a literal <a href="...">label</a>
 * - a plain URL
 *
 * Returns { href, label } or null.
 */
function parseLink(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  // 1) Literal <a ...>...</a> (common from backend rendering as string)
  // Keep it simple and safe: only extract href and inner text.
  const anchorMatch = raw.match(
    /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  if (anchorMatch) {
    const href = normalizeHref(anchorMatch[1]);
    const label = String(anchorMatch[2] || "")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (href) return { href, label: label || href };
  }

  // 2) Plain URL (only auto-link when the whole cell is a URL)
  // Supports http(s)://..., www...., ipfs://...
  const isWholeUrl =
    /^(https?:\/\/\S+)$/i.test(raw) ||
    /^(www\.\S+)$/i.test(raw) ||
    /^(ipfs:\/\/\S+)$/i.test(raw);

  if (isWholeUrl) {
    const href = normalizeHref(raw);
    if (href) return { href, label: raw };
  }

  return null;
}

export default function KVTable({ kv, sortable = true }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  // Global guard: if metadata is inconsistent, do not render anything
  if (!isValidKVTable(kv)) return null;

  const metadata = kv.metadata || {};
  const rawColumns = Array.isArray(metadata.columns) ? metadata.columns : [];
  const columns = rawColumns
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter((c) => c.length > 0);

  const cols = Array.isArray(kv?.data?.values) ? kv.data.values : [];

  const formatValue = (key, value) => {
    if (value === null || value === undefined) return "";
    const raw = String(value).trim();
    if (!raw) return "";

    const n = Number(raw);
    if (!Number.isNaN(n)) {
      return Number.isInteger(n) ? n.toString() : n.toString();
    }

    if (!Number.isNaN(Date.parse(raw)) && /T\d{2}:\d{2}/.test(raw)) {
      return raw;
    }

    return raw;
  };

  const rows = [];
  const maxLen = Math.max(...cols.map((c) => c.values?.length || 0));
  for (let i = 0; i < maxLen; i++) {
    const row = {};
    for (let c = 0; c < cols.length; c++) {
      const colKey = columns[c] || Object.keys(cols[c] || {})[0];
      const val = cols[c]?.values?.[i];
      row[colKey] = formatValue(colKey, val);
    }
    rows.push(row);
  }

  // Filter out rows that are completely empty (extra safety)
  const nonEmptyRows = rows.filter((row) =>
    columns.some((col) => row[col] !== ""),
  );
  if (!nonEmptyRows.length) return null;

  const detectType = (v) => {
    if (v === "" || v == null) return "string";
    if (!isNaN(Number(v))) return "number";
    if (!isNaN(Date.parse(v))) return "date";
    return "string";
  };

  const handleSort = (key) => {
    if (!sortable) return;
    if (key === sortKey) setSortAsc((prev) => !prev);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey || !sortable) return nonEmptyRows;

    const t = detectType(nonEmptyRows[0]?.[sortKey]);
    const copy = [...nonEmptyRows];

    copy.sort((a, b) => {
      const A = a[sortKey];
      const B = b[sortKey];
      if (t === "number") return Number(A) - Number(B);
      if (t === "date") return new Date(A) - new Date(B);
      return String(A).localeCompare(String(B));
    });

    return sortAsc ? copy : copy.reverse();
  }, [nonEmptyRows, sortKey, sortAsc, sortable]);

  const renderCell = (value) => {
    const link = parseLink(value);
    if (!link) return value;

    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="kv-table-link"
        onClick={(e) => e.stopPropagation()}
      >
        {link.label}
      </a>
    );
  };

  return (
    <div className="kv-table-wrapper table-scroll">
      <table className="kv-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                className={
                  sortable && sortKey === col
                    ? sortAsc
                      ? "sorted-asc"
                      : "sorted-desc"
                    : ""
                }
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, idx) => (
            <tr key={idx}>
              {columns.map((col) => (
                <td key={col}>{renderCell(row[col])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
