// src/utils/kvCharts/specs/bubble.js
import { safeColumns } from "../helpers.js";
import { detectUriField } from "../linking.js";

function getColumnsDict(kv) {
  const m = kv?.metadata || {};
  // Support multiple possible shapes used across CAP/DFCT pipelines.
  return (
    m.columns || m.columns_dict || m.metadata_columns || m.columnsDict || {}
  );
}

function getRoleFields(kv) {
  // Optional: support a "roles/encoding/fields" map like:
  // { x: "epoch_no", y: "tps", size: "avg_fee", label: "proposal", uri: "uri" }
  const m = kv?.metadata || {};
  return m.roles || m.encoding || m.fields || {};
}

function hasField(values, field) {
  if (!field) return false;
  for (const v of values) {
    const x = v?.[field];
    if (x !== undefined && x !== null && String(x) !== "") return true;
  }
  return false;
}

function guessLabelField(values, exclude = new Set()) {
  if (!values?.length) return null;
  const keys = Object.keys(values[0] || {});

  // Prefer string-like fields first.
  for (const k of keys) {
    if (exclude.has(k)) continue;
    const v = values[0]?.[k];
    if (typeof v === "string") return k;
  }

  // Otherwise pick the first non-excluded key.
  for (const k of keys) {
    if (!exclude.has(k)) return k;
  }
  return null;
}

export function kvToBubbleChartSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const columnsDict = getColumnsDict(kv);
  const roleFields = getRoleFields(kv);

  // Default internal fields (your pipeline often emits x/y/size already).
  const xField = roleFields.x || kv?.metadata?.xField || "x";
  const yField = roleFields.y || kv?.metadata?.yField || "y";
  const sizeField = roleFields.size || kv?.metadata?.sizeField || "size";

  // Shared URI detection (consistent across all chart types).
  const uriField = detectUriField(kv);

  // Label field: prefer metadata hints, then common names, else infer.
  const labelFieldFromMeta =
    roleFields.label ||
    kv?.metadata?.labelField ||
    (hasField(values, "label") ? "label" : null);

  const excludeForGuess = new Set(
    [xField, yField, sizeField, uriField].filter(Boolean),
  );
  const labelField =
    (labelFieldFromMeta && hasField(values, labelFieldFromMeta)
      ? labelFieldFromMeta
      : null) || guessLabelField(values, excludeForGuess);

  // Titles: prefer metadata columns dict (field -> display label), else safeColumns, else fallback.
  const xTitle = columnsDict?.[xField] || cols[0] || "X";
  const yTitle = columnsDict?.[yField] || cols[1] || "Y";
  const sizeTitle = columnsDict?.[sizeField] || cols[2] || "Size";
  const labelTitle =
    (labelField && (columnsDict?.[labelField] || cols[3])) || "Label";
  const uriTitle =
    (uriField &&
      (columnsDict?.[uriField] ||
        columnsDict?.uri ||
        columnsDict?.URI ||
        cols[4])) ||
    "URI";

  // Build tooltip dynamically (avoid undefined fields).
  const tooltip = [];

  if (labelField && hasField(values, labelField)) {
    // Display a shortened label for readability, plus the full label.
    tooltip.push({
      field: "__shortLabel2",
      type: "nominal",
      title: labelTitle,
    });
    tooltip.push({ field: labelField, type: "nominal", title: labelTitle });
  }

  if (uriField && hasField(values, uriField)) {
    tooltip.push({ field: uriField, type: "nominal", title: uriTitle });
  }

  if (hasField(values, xField))
    tooltip.push({ field: xField, type: "quantitative", title: xTitle });
  if (hasField(values, yField))
    tooltip.push({ field: yField, type: "quantitative", title: yTitle });
  if (hasField(values, sizeField))
    tooltip.push({ field: sizeField, type: "quantitative", title: sizeTitle });

  const baseEncoding = {
    x: {
      field: xField,
      type: "quantitative",
      title: xTitle,
      scale: { zero: false },
    },
    y: {
      field: yField,
      type: "quantitative",
      title: yTitle,
      scale: { zero: false },
    },
    size: {
      field: sizeField,
      type: "quantitative",
      title: sizeTitle,
      scale: { type: "sqrt", range: [40, 1800] },
      legend: { orient: "right" },
    },
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    description: "Bubble chart from kv_results",

    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriField || null },

    data: { values },

    width: "container",
    height: 320,
    autosize: { type: "fit", contains: "padding" },

    config: {
      view: { stroke: null },
      axis: {
        grid: true,
        gridOpacity: 0.12,
        domain: false,
        tickSize: 4,
        labelFontSize: 11,
        titleFontSize: 12,
        labelPadding: 6,
        titlePadding: 10,
      },
      legend: {
        labelFontSize: 11,
        titleFontSize: 12,
        symbolStrokeWidth: 1,
      },
    },

    transform: [
      {
        calculate: labelField
          ? `isValid(datum.${labelField}) ? replace(datum.${labelField}, '^.*[/#]', '') : ''`
          : `''`,
        as: "__shortLabel",
      },
      {
        calculate: `length(datum.__shortLabel) > 28 ? substring(datum.__shortLabel, 0, 26) + '…' : datum.__shortLabel`,
        as: "__shortLabel2",
      },
    ],

    layer: [
      // Soft back layer for depth.
      {
        mark: {
          type: "point",
          filled: true,
          opacity: 0.18,
          stroke: "white",
          strokeWidth: 2,
        },
        encoding: {
          ...baseEncoding,
        },
      },

      // Main interactive layer with tooltip and color.
      {
        mark: {
          type: "point",
          filled: true,
          opacity: 0.72,
          stroke: "rgba(0,0,0,0.28)",
          strokeWidth: 1,
        },
        encoding: {
          ...baseEncoding,
          color: {
            field: sizeField,
            type: "quantitative",
            title: sizeTitle,
            legend: null,
          },
          tooltip,
        },
      },
    ],
  };
}
