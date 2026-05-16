// src/utils/kvCharts/specs/heatmap.js
import { safeColumns } from "../helpers.js";
import { detectUriField } from "../linking.js";

export function kvToHeatmapSpec(kv) {
  const values = Array.isArray(kv?.data?.values) ? kv.data.values : [];
  if (!values.length) return null;

  const cols = safeColumns(kv);

  const sample = values.find((r) => r && typeof r === "object") || {};
  const keys = Object.keys(sample);

  const getVal = (row, k) =>
    row && typeof row === "object" ? row[k] : undefined;

  const looksNumeric = (v) => {
    if (v == null) return false;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return false;
      const n = Number(s);
      return Number.isFinite(n);
    }
    return false;
  };

  const looksDate = (v) => {
    if (typeof v !== "string") return false;
    const s = v.trim();
    if (!s) return false;
    if (/^\d{1,2}$/.test(s)) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
    const t = Date.parse(s);
    return Number.isFinite(t);
  };

  const inferMeasureField = () => {
    if (keys.includes("value")) {
      const ok = values
        .slice(0, 50)
        .some((r) => looksNumeric(getVal(r, "value")));
      if (ok) return "value";
    }

    let best = null;
    let bestScore = -1;

    for (const k of keys) {
      let score = 0;
      const window = values.slice(0, 80);
      for (const r of window) {
        if (looksNumeric(getVal(r, k))) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }

    return best || keys[2] || keys[0] || "value";
  };

  const inferDimFields = (measureField) => {
    if (
      keys.includes("x") &&
      keys.includes("y") &&
      measureField !== "x" &&
      measureField !== "y"
    ) {
      return { xField: "x", yField: "y" };
    }

    const dimKeys = keys.filter((k) => k !== measureField);

    const scoreKey = (k) => {
      const s = new Set();
      const window = values.slice(0, 200);
      for (const r of window) s.add(String(getVal(r, k)));
      return s.size;
    };

    dimKeys.sort((a, b) => scoreKey(b) - scoreKey(a));

    const xField = dimKeys[0] || keys[0] || "x";
    const yField = dimKeys[1] || dimKeys[0] || keys[1] || "y";
    return { xField, yField };
  };

  const vField = inferMeasureField();
  const { xField, yField } = inferDimFields(vField);

  const xTitle = cols[0] || xField || "X";
  const yTitle = cols[1] || yField || "Y";
  const vTitle = cols[2] || vField || "Value";

  const sampleWindow = values.slice(0, 120);
  const xLooksDate = sampleWindow.some((r) => looksDate(getVal(r, xField)));
  const yLooksNumeric = sampleWindow.some((r) =>
    looksNumeric(getVal(r, yField)),
  );

  const xHasTime =
    xLooksDate &&
    sampleWindow.some((r) => {
      const v = getVal(r, xField);
      return typeof v === "string" && /T|\d{2}:\d{2}/.test(v);
    });

  const xTimeUnit = xLooksDate
    ? xHasTime
      ? "yearmonthdatehours"
      : "yearmonthdate"
    : undefined;

  const ySort = yLooksNumeric
    ? { field: "__y_num", order: "ascending" }
    : "ascending";

  const validExpr = `isValid(datum['${xField}']) && isValid(datum['${yField}']) && isValid(datum['${vField}'])`;

  const transforms = [
    { filter: validExpr },
    ...(xLooksDate
      ? [{ calculate: `toDate(datum['${xField}'])`, as: "__x_dt" }]
      : []),
    ...(yLooksNumeric
      ? [{ calculate: `toNumber(datum['${yField}'])`, as: "__y_num" }]
      : []),
    ...(vField
      ? [{ calculate: `toNumber(datum['${vField}'])`, as: "__v_num" }]
      : []),
  ];

  const colorField = "__v_num";

  // URL clicking contract
  const uriField = detectUriField(kv);

  const tooltip = [
    xLooksDate
      ? { field: "__x_dt", type: "temporal", title: xTitle }
      : { field: xField, type: "ordinal", title: xTitle },
    { field: yField, type: "ordinal", title: yTitle },
    { field: colorField, type: "quantitative", title: vTitle },
  ];

  if (uriField) {
    tooltip.push({ field: uriField, type: "nominal", title: "URI" });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    width: "container",
    height: 320,

    // Contract used by VegaChart.jsx for new-tab navigation + mark-only pointer cursor
    usermeta: { uriField: uriField || null },

    data: { values },
    transform: transforms,
    mark: { type: "rect" },
    encoding: {
      x: xLooksDate
        ? {
            field: "__x_dt",
            type: "temporal",
            title: xTitle,
            timeUnit: xTimeUnit,
            axis: { labelAngle: 0 },
          }
        : {
            field: xField,
            type: "ordinal",
            title: xTitle,
            axis: { labelAngle: 0 },
          },
      y: {
        field: yField,
        type: "ordinal",
        title: yTitle,
        sort: ySort,
      },
      color: {
        field: colorField,
        type: "quantitative",
        title: vTitle,
        scale: { zero: false, nice: true },
        legend: { type: "gradient" },
      },
      tooltip,
    },
  };
}
