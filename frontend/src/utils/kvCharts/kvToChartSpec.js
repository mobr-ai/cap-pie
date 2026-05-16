// src/utils/kvCharts/kvToChartSpec.js
import { kvToBarChartSpec } from "./specs/bar.js";
import { kvToPieChartSpec } from "./specs/pie.js";
import { kvToLineChartSpec } from "./specs/line.js";
import { kvToScatterChartSpec } from "./specs/scatter.js";
import { kvToBubbleChartSpec } from "./specs/bubble.js";
import { kvToTreemapSpec } from "./specs/treemap.js";
import { kvToHeatmapSpec } from "./specs/heatmap.js";

export function kvToChartSpec(kv) {
  if (!kv || !kv.result_type) return null;

  switch (kv.result_type) {
    case "bar_chart":
      return kvToBarChartSpec(kv);
    case "pie_chart":
      return kvToPieChartSpec(kv);
    case "line_chart":
      return kvToLineChartSpec(kv);
    case "scatter_chart":
      return kvToScatterChartSpec(kv);
    case "bubble_chart":
      return kvToBubbleChartSpec(kv);
    case "treemap":
      return kvToTreemapSpec(kv);
    case "heatmap":
      return kvToHeatmapSpec(kv);
    default:
      return null;
  }
}
