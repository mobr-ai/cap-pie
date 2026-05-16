// src/utils/kvCharts/specs/bar.js
import { safeColumns } from "../helpers.js";
import { detectUriField } from "../linking.js";

function getColumnsDict(kv) {
  const m = kv?.metadata || {};
  return (
    m.columns || m.columns_dict || m.metadata_columns || m.columnsDict || {}
  );
}

function hasField(values, field) {
  if (!field) return false;
  for (const v of values) {
    const x = v?.[field];
    if (x !== undefined && x !== null && String(x) !== "") return true;
  }
  return false;
}

export function kvToBarChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const columnsDict = getColumnsDict(kv);

  const sample = values[0] || {};
  const keys = Object.keys(sample);

  // Preserve existing heuristic behavior
  const xField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];

  const yFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("amount")) ||
    keys.find((k) => k.toLowerCase().includes("value"));

  const yField = yFieldCandidate || keys[1] || keys[0];

  // Titles: prefer metadata columns dict, then safeColumns, then fallback to field name
  const xTitle = columnsDict?.[xField] || cols[0] || xField || "X";
  const yTitle = columnsDict?.[yField] || cols[1] || yField || "Y";

  // URL clicking contract (used by VegaChart.jsx)
  const uriField = detectUriField(kv);

  // Keep existing tooltip rows; optionally add URI row if present
  const tooltip = [];

  if (xField && hasField(values, xField)) {
    tooltip.push({ field: xField, type: "ordinal", title: xTitle });
  }

  if (yField && hasField(values, yField)) {
    tooltip.push({ field: yField, type: "quantitative", title: yTitle });
  }

  if (uriField && hasField(values, uriField)) {
    const uriTitle =
      columnsDict?.[uriField] || columnsDict?.uri || columnsDict?.URI || "URI";
    tooltip.push({ field: uriField, type: "nominal", title: uriTitle });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bar chart from kv_results",

    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriField || null },

    data: { values },
    mark: "bar",
    encoding: {
      x: { field: xField, type: "ordinal", title: xTitle },
      y: { field: yField, type: "quantitative", title: yTitle },
      tooltip,
    },
  };
}
