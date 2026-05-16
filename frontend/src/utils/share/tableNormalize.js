// src/utils/share/tableNormalize.js

/* ----------------------------- helpers ----------------------------- */

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function isNumericHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x === "count" ||
    x.endsWith("count") ||
    x.includes("votes") ||
    x.includes("vote") ||
    x.includes("yes") ||
    x.includes("no") ||
    x.includes("abstain") ||
    x.includes("total") ||
    x.includes("amount") ||
    x.includes("sum") ||
    x.includes("avg") ||
    x.includes("min") ||
    x.includes("max")
  );
}

function isTimeHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x.includes("timestamp") ||
    x.includes("time") ||
    x.includes("date") ||
    x.includes("slot") ||
    x.includes("epoch")
  );
}

function isHashishHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return (
    x.includes("hash") ||
    x.includes("tx") ||
    x.endsWith("id") ||
    x.includes("address") ||
    x.includes("policy") ||
    x.includes("fingerprint")
  );
}

function isUrlHeaderName(h) {
  const x = String(h || "").toLowerCase();
  return x.includes("url") || x.includes("link") || x.includes("ipfs");
}

function approxCellText(cell) {
  if (!cell) return "";
  const a = cell.querySelector && cell.querySelector("a");
  if (a && a.textContent) return String(a.textContent).trim();
  return String(cell.textContent || "").trim();
}

/**
 * Firefox-safe computed style getter.
 * In some Firefox cases, getComputedStyle can throw for detached/cloned nodes
 * (or when objects become "dead"). Export code should never hard-fail because of it.
 */
function safeGetComputedStyle(el) {
  try {
    if (!el || !el.ownerDocument) return null;
    return window.getComputedStyle(el);
  } catch {
    return null;
  }
}

/**
 * Content-aware smart <colgroup> for mixed tables.
 * Works best with table-layout: fixed.
 */
export function applySmartColGroup(tableEl, sandboxWidthPx) {
  if (!tableEl) return;

  const headerRow = tableEl.querySelector("thead tr");
  if (!headerRow) return;

  const ths = Array.from(headerRow.querySelectorAll("th"));
  const headers = ths.map((th) => String(th.textContent || "").trim());
  const headersLower = headers.map((h) => h.toLowerCase());
  const n = headers.length;
  if (!n) return;

  // Remove any existing colgroups (export clone should be deterministic)
  tableEl.querySelectorAll("colgroup").forEach((cg) => cg.remove());

  // Sample body rows to estimate content lengths
  const rows = Array.from(tableEl.querySelectorAll("tbody tr")).slice(0, 25);
  const maxLens = new Array(n).fill(0);

  rows.forEach((tr) => {
    const tds = Array.from(tr.querySelectorAll("td"));
    for (let i = 0; i < n; i += 1) {
      const txt = approxCellText(tds[i]);
      const len = Math.min(90, txt.length);
      if (len > maxLens[i]) maxLens[i] = len;
    }
  });

  const baseWeights = headersLower.map((h) => {
    if (isNumericHeaderName(h)) return 0.55;
    if (isTimeHeaderName(h)) return 1.25;
    if (isUrlHeaderName(h)) return 2.6;
    if (isHashishHeaderName(h)) return 2.2;
    return 1.0;
  });

  // Minimum px widths so headers like "proposalTimestamp" never get crushed.
  const minPx = headersLower.map((h) => {
    if (isNumericHeaderName(h)) return 90;
    if (isTimeHeaderName(h)) return 210;
    if (isUrlHeaderName(h)) return 320;
    if (isHashishHeaderName(h)) return 320;
    return 160;
  });

  const extra = headers.map((h, i) => {
    const headerLen = Math.min(30, String(h || "").length);
    const contentLen = maxLens[i];

    if (isNumericHeaderName(headersLower[i])) {
      return 0.08 * headerLen + 0.02 * Math.min(20, contentLen);
    }
    if (isTimeHeaderName(headersLower[i])) {
      return 0.06 * headerLen + 0.03 * Math.min(40, contentLen);
    }
    if (
      isUrlHeaderName(headersLower[i]) ||
      isHashishHeaderName(headersLower[i])
    ) {
      return 0.05 * headerLen + 0.035 * Math.min(70, contentLen);
    }
    return 0.06 * headerLen + 0.03 * Math.min(50, contentLen);
  });

  const weights = baseWeights.map((b, i) => b + extra[i]);

  const wDen = weights.reduce((a, b) => a + b, 0) || 1;
  let pct = weights.map((w) => (w / wDen) * 100);

  const denomW = Math.max(600, Number(sandboxWidthPx) || 1200);
  let minPct = minPx.map((px) => (px / denomW) * 100);

  let totalMin = minPct.reduce((a, b) => a + b, 0);
  if (totalMin > 100) {
    const scale = 100 / totalMin;
    minPct = minPct.map((p) => p * scale);
    totalMin = 100;
  }

  // Enforce minimums
  let used = 0;
  const fixed = new Array(n).fill(false);
  for (let i = 0; i < n; i += 1) {
    if (pct[i] < minPct[i]) {
      pct[i] = minPct[i];
      fixed[i] = true;
    }
    used += pct[i];
  }

  // If over budget, reduce flex columns proportionally
  if (used > 100) {
    const over = used - 100;
    let flexSum = 0;
    for (let i = 0; i < n; i += 1) if (!fixed[i]) flexSum += pct[i];

    if (flexSum > 0) {
      for (let i = 0; i < n; i += 1) {
        if (!fixed[i]) {
          const cut = (pct[i] / flexSum) * over;
          pct[i] = Math.max(minPct[i], pct[i] - cut);
        }
      }
    }
  } else if (used < 100) {
    // If under budget, give it to non-numeric columns
    const remain = 100 - used;
    let flexW = 0;
    for (let i = 0; i < n; i += 1) {
      if (!isNumericHeaderName(headersLower[i])) flexW += weights[i];
    }

    if (flexW > 0) {
      for (let i = 0; i < n; i += 1) {
        if (!isNumericHeaderName(headersLower[i])) {
          pct[i] += (weights[i] / flexW) * remain;
        }
      }
    }
  }

  // Clamp extremes a bit, then renormalize
  pct = pct.map((p, i) => {
    if (isNumericHeaderName(headersLower[i])) return clamp(p, minPct[i], 14);
    return clamp(p, minPct[i], 52);
  });

  const sumPct = pct.reduce((a, b) => a + b, 0) || 1;
  pct = pct.map((p) => (p / sumPct) * 100);

  const colgroup = document.createElement("colgroup");
  for (let i = 0; i < n; i += 1) {
    const col = document.createElement("col");
    col.style.width = `${pct[i].toFixed(3)}%`;
    colgroup.appendChild(col);
  }
  tableEl.insertBefore(colgroup, tableEl.firstChild);

  // Wrap long strings sanely
  tableEl.querySelectorAll("th, td").forEach((cell) => {
    cell.style.whiteSpace = "normal";
    cell.style.wordBreak = "break-word";
    cell.style.overflowWrap = "anywhere";
    cell.style.verticalAlign = "top";
  });

  // Numeric columns: compact + right aligned (header + body)
  headersLower.forEach((h, idx) => {
    if (!isNumericHeaderName(h)) return;
    const nth = idx + 1;
    tableEl
      .querySelectorAll(
        `thead th:nth-child(${nth}), tbody td:nth-child(${nth})`,
      )
      .forEach((cell) => {
        cell.style.whiteSpace = "nowrap";
        cell.style.textAlign = "right";
      });
  });
}

/**
 * Expand scroll containers and normalize KVTable so it exports cleanly.
 * IMPORTANT: this is export-only (runs on a clone).
 */
export function forceExpandForExport(root, sandboxWidthPx) {
  if (!root) return;

  // Expand all descendants that may clip/collapse in the clone
  const all = root.querySelectorAll("*");
  all.forEach((el) => {
    const cs = safeGetComputedStyle(el);

    // If computed style is unavailable (Firefox on detached clone), apply safe defaults.
    if (!cs) {
      el.style.overflow = "visible";
      el.style.maxHeight = "none";
      el.style.height = "auto";

      if (el.classList?.contains("kv-table") || el.closest?.(".kv-table")) {
        el.style.color = "#0f172a";
        el.style.background = "#ffffff";
      }
      return;
    }

    if (
      cs.overflow === "auto" ||
      cs.overflow === "scroll" ||
      cs.overflow === "hidden"
    ) {
      el.style.overflow = "visible";
    }

    if (cs.maxHeight && cs.maxHeight !== "none") el.style.maxHeight = "none";
    if (cs.height && cs.height.endsWith("%")) el.style.height = "auto";

    if (el.classList?.contains("kv-table") || el.closest?.(".kv-table")) {
      el.style.color = "#0f172a";
      el.style.background = "#ffffff";
    }
  });

  // Also expand the root itself if it is a scroll container
  {
    const cs = safeGetComputedStyle(root);
    if (!cs) {
      root.style.overflow = "visible";
      root.style.maxHeight = "none";
    } else {
      if (
        cs.overflow === "auto" ||
        cs.overflow === "scroll" ||
        cs.overflow === "hidden"
      ) {
        root.style.overflow = "visible";
      }
      if (cs.maxHeight && cs.maxHeight !== "none")
        root.style.maxHeight = "none";
    }
  }

  const isRootWrap = root.classList?.contains("kv-table-wrapper");
  const isRootTable = root.classList?.contains("kv-table");

  const kvWrap = isRootWrap ? root : root.querySelector(".kv-table-wrapper");
  if (kvWrap) {
    kvWrap.style.overflow = "visible";
    kvWrap.style.height = "auto";
    kvWrap.style.maxHeight = "none";
    kvWrap.style.display = "block";
    kvWrap.style.width = "100%";
    kvWrap.style.maxWidth = "100%";
    kvWrap.style.boxSizing = "border-box";
    kvWrap.style.background = "#ffffff";
  }

  // Critical fix: if root IS the table, use it directly.
  const kvTable = isRootTable ? root : root.querySelector(".kv-table");
  if (kvTable) {
    kvTable.style.width = "100%";
    kvTable.style.maxWidth = "100%";
    kvTable.style.tableLayout = "fixed";
    kvTable.style.borderCollapse = "collapse";
    kvTable.style.boxSizing = "border-box";
    kvTable.style.background = "#ffffff";
    kvTable.style.color = "#0f172a";

    applySmartColGroup(kvTable, sandboxWidthPx);
  }
}
