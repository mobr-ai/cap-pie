// src/utils/kvCharts/specs/treemap.js
import { safeColumns } from "../helpers.js";
import { detectUriField } from "../linking.js";

export function kvToTreemapSpec(kv) {
  const values = kv?.data?.values || [];
  if (!values.length) return null;

  const cols = safeColumns(kv);
  const nameTitle = cols[0] || "Name";
  const valueTitle = cols[1] || "Value";

  // URL detection from original input rows
  const uriFieldRaw = detectUriField(kv);

  const prepared = [
    { id: "__root__", parent: null, name: "root", value: 0 },
    ...values.map((r, i) => {
      const name = String(r?.name ?? `item_${i}`);
      const node = {
        id: name,
        parent: "__root__",
        name,
        value: Number(r?.value ?? 0),
      };

      // Carry URL into leaf datum so VegaChart.jsx can open it.
      if (uriFieldRaw) node.__uri = r?.[uriFieldRaw];

      return node;
    }),
  ];

  // Tooltip signal:
  // Keep the original tooltip object, but optionally extend it with URI when present.
  // We must build this as a Vega expression string.
  const tooltipSignal = uriFieldRaw
    ? `merge({ "${nameTitle}": datum.label, "${valueTitle}": format(datum.value, ",.0f") }, { "URI": datum.__uri })`
    : `{ "${nameTitle}": datum.label, "${valueTitle}": format(datum.value, ",.0f") }`;

  return {
    $schema: "https://vega.github.io/schema/vega/v6.json",
    description: "Treemap from kv_results",

    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriFieldRaw ? "__uri" : null },

    autosize: { type: "fit", contains: "padding" },
    padding: 8,
    width: 820,
    height: 360,

    signals: [
      { name: "layout", value: "binary" },
      { name: "aspectRatio", value: 1.6 },
      { name: "showLabels", value: true },
    ],

    data: [
      {
        name: "tree",
        values: prepared,
        transform: [
          { type: "stratify", key: "id", parentKey: "parent" },
          {
            type: "treemap",
            field: "value",
            sort: { field: "value", order: "descending" },
            round: true,
            method: { signal: "layout" },
            ratio: { signal: "aspectRatio" },
            size: [{ signal: "width" }, { signal: "height" }],
          },
          { type: "formula", as: "label", expr: "datum.name" },
          { type: "formula", as: "__isLeaf", expr: "!datum.children" },
          {
            type: "formula",
            as: "__short",
            expr: "length(datum.label) > 16 ? substring(datum.label, 0, 8) + '…' + substring(datum.label, length(datum.label)-6, length(datum.label)) : datum.label",
          },
          {
            type: "formula",
            as: "__showText",
            expr: "showLabels && datum.__isLeaf && (datum.x1-datum.x0) > 90 && (datum.y1-datum.y0) > 26",
          },
        ],
      },
      {
        name: "leaves",
        source: "tree",
        transform: [{ type: "filter", expr: "datum.__isLeaf" }],
      },
    ],

    scales: [
      {
        name: "color",
        type: "ordinal",
        domain: { data: "leaves", field: "label" },
        range: { scheme: "category20c" },
      },
      {
        name: "stroke",
        type: "ordinal",
        domain: [0, 1],
        range: ["rgba(255,255,255,0.35)", "rgba(255,255,255,0.85)"],
      },
    ],

    marks: [
      {
        type: "rect",
        from: { data: "leaves" },
        encode: {
          enter: {
            stroke: { value: "rgba(255,255,255,0.35)" },
            cornerRadius: { value: 6 },
          },
          update: {
            x: { field: "x0" },
            y: { field: "y0" },
            x2: { field: "x1" },
            y2: { field: "y1" },
            fill: { scale: "color", field: "label" },
            fillOpacity: { value: 0.92 },
            tooltip: { signal: tooltipSignal },
          },
          hover: {
            stroke: { value: "rgba(255,255,255,0.9)" },
            strokeWidth: { value: 2 },
            fillOpacity: { value: 1.0 },
          },
        },
      },
      {
        type: "text",
        from: { data: "leaves" },
        encode: {
          enter: {
            font: {
              value: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            },
            fontSize: { value: 12 },
            fill: { value: "rgba(15, 23, 42, 0.92)" },
            align: { value: "left" },
            baseline: { value: "top" },
          },
          update: {
            x: { field: "x0", offset: 10 },
            y: { field: "y0", offset: 10 },
            text: { field: "__short" },
            opacity: { signal: "datum.__showText ? 1 : 0" },
          },
        },
      },
      {
        type: "text",
        from: { data: "leaves" },
        encode: {
          enter: {
            font: {
              value: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
            },
            fontSize: { value: 11 },
            fill: { value: "rgba(15, 23, 42, 0.70)" },
            align: { value: "left" },
            baseline: { value: "top" },
          },
          update: {
            x: { field: "x0", offset: 10 },
            y: { field: "y0", offset: 28 },
            text: { signal: `format(datum.value, ',.0f')` },
            opacity: { signal: "datum.__showText ? 1 : 0" },
          },
        },
      },
    ],

    legends: [],
    axes: [],
    encode: {},
  };
}
