// src/utils/kvCharts/specs/pie.js
import { safeColumns } from "../helpers.js";
import { detectUriField } from "../linking.js";

export function kvToPieChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);

  const sample = values[0] || {};
  const keys = Object.keys(sample);

  const catField =
    keys.find((k) => k.toLowerCase().includes("category")) || keys[0];

  const valFieldCandidate =
    keys.find((k) => k.toLowerCase().includes("value")) ||
    keys.find((k) => k.toLowerCase().includes("amount"));

  const valField = valFieldCandidate || keys[1] || keys[0];

  const uriFieldRaw = detectUriField(kv);

  const hasRowLabels = cols.length === values.length;

  const prepared = hasRowLabels
    ? values.map((row, i) => {
        const out = {
          ...row,
          __label: cols[i] || row?.[catField] || `slice_${i}`,
        };
        if (uriFieldRaw) out.__uri = row?.[uriFieldRaw];
        return out;
      })
    : values.map((row) => {
        const out = { ...row };
        if (uriFieldRaw) out.__uri = row?.[uriFieldRaw];
        return out;
      });

  const labelField = hasRowLabels ? "__label" : catField;

  const tooltip = [
    { field: labelField, type: "nominal", title: cols?.[0] || "Category" },
    { field: valField, type: "quantitative", title: cols?.[1] || "Value" },
  ];

  if (uriFieldRaw) {
    tooltip.push({ field: "__uri", type: "nominal", title: "URI" });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Pie chart from kv_results",

    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriFieldRaw ? "__uri" : null },

    data: { values: prepared },
    mark: "arc",
    encoding: {
      theta: { field: valField, type: "quantitative" },
      color: {
        field: labelField,
        type: "nominal",
        legend: { title: null },
      },
      tooltip,
    },
    view: { stroke: null },
  };
}
