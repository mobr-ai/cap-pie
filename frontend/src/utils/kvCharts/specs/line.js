// src/utils/kvCharts/specs/line.js
import { safeColumns, shortSeries, uniqueCount } from "../helpers.js";
import { detectUriField } from "../linking.js";

export function kvToLineChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const toTemporalMonth = (v) => {
    if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
    return v;
  };

  const looksLong = keys.includes("x") && keys.includes("y");

  const seriesNameForIndex = (idx) => {
    const n = Number(idx);
    if (Number.isNaN(n)) return null;

    if (cols.length >= 2) {
      const a = cols[n + 1];
      const b = cols[n];
      return a || b || null;
    }
    return null;
  };

  // Shared URL detection from original rows
  const uriFieldRaw = detectUriField(kv);

  let prepared = [];

  if (looksLong) {
    prepared = values.map((row, i) => {
      const direct = row.series != null ? row.series : null;
      const fromC = row.c != null ? seriesNameForIndex(row.c) : null;

      const series =
        (direct != null && String(direct)) ||
        (fromC != null && String(fromC)) ||
        `series_${i}`;

      const out = {
        x: toTemporalMonth(row.x),
        y: row.y,
        series: shortSeries(series),
      };

      // Carry URL into the mark datum (so VegaChart can open it).
      if (uriFieldRaw) out.__uri = row?.[uriFieldRaw];

      return out;
    });
  } else {
    const xField = cols[0] || keys[0];
    const measureFields = (
      cols.length >= 2 ? cols.slice(1) : keys.slice(1)
    ).filter((f) => f !== xField);

    prepared = values.flatMap((row) => {
      const xVal = toTemporalMonth(row[xField]);
      const rowUri = uriFieldRaw ? row?.[uriFieldRaw] : undefined;

      return measureFields.map((mf) => {
        const out = {
          x: xVal,
          y: row[mf],
          series: shortSeries(mf),
        };
        if (uriFieldRaw) out.__uri = rowUri;
        return out;
      });
    });
  }

  const seriesCount = uniqueCount(prepared.map((r) => r.series));
  const showLegend = seriesCount > 1;

  const tooltip = [
    { field: "x", type: "temporal" },
    { field: "series", type: "nominal" },
    { field: "y", type: "quantitative" },
  ];

  if (uriFieldRaw) {
    tooltip.push({ field: "__uri", type: "nominal", title: "URI" });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Line chart from kv_results",
    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriFieldRaw ? "__uri" : null },
    data: { values: prepared },
    mark: "line",
    encoding: {
      x: { field: "x", type: "temporal", title: cols[0] || "Time" },
      y: { field: "y", type: "quantitative", title: "Value" },
      color: showLegend
        ? {
            field: "series",
            type: "nominal",
            title: null,
            legend: { title: null },
          }
        : undefined,
      tooltip,
    },
  };
}
