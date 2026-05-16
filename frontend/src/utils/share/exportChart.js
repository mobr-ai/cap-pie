// src/utils/share/exportChart.js
import { buildShareCardNode } from "./shareCard";
import { exportNodeToPngDataUrl } from "./sandboxExport";
import { WATERMARK_PRESETS } from "./watermark";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function safeText(s) {
  return String(s || "").trim();
}

export async function exportChartAsPngDataUrl({
  vegaView,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  targetWidth = 1600,
} = {}) {
  if (!vegaView) return null;

  let dataUrl = null;

  try {
    let w = Number(vegaView.width?.() || 0);

    if (!w || w < 10) {
      w = 800;
      try {
        vegaView.width(w);
        vegaView.resize();
        await vegaView.runAsync();
      } catch {}
    }

    const scale = targetWidth / w;
    const clampScale = clamp(scale, 1, 4);

    dataUrl = await vegaView.toImageURL("png", clampScale);
  } catch {
    dataUrl = null;
  }

  if (!dataUrl) return null;

  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = safeText(title) || "chart";
  img.draggable = false;
  img.style.display = "block";
  img.style.maxWidth = "100%";
  img.style.height = "auto";
  img.style.background = "#ffffff";

  const wrap = document.createElement("div");
  wrap.style.display = "block";
  wrap.style.width = "100%";
  wrap.style.maxWidth = "100%";
  wrap.style.boxSizing = "border-box";
  wrap.style.background = "#ffffff";
  wrap.appendChild(img);

  const card = await buildShareCardNode({
    contentNode: wrap,
    title,
    subtitle,
    titleBar,
    watermark,
  });

  return exportNodeToPngDataUrl(card, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    sandboxWidth: 1200,
  });
}
