// src/utils/share/exportElement.js
import { buildShareCardNode } from "./shareCard";
import { exportNodeToPngDataUrl } from "./sandboxExport";
import { WATERMARK_PRESETS } from "./watermark";
import { forceExpandForExport } from "./tableNormalize";

export async function exportElementAsPngDataUrl({
  element,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
  pixelRatio = 2,
} = {}) {
  if (!element) return null;

  const sandboxWidthPx = 1200;
  const clone = element.cloneNode(true);

  forceExpandForExport(clone, sandboxWidthPx);

  clone.querySelectorAll("a").forEach((a) => {
    a.style.color = "#2563eb";
    a.style.textDecoration = "underline";
  });

  if (clone.classList?.contains("kv-table")) {
    clone.querySelectorAll("thead th").forEach((th) => {
      th.style.background = "#0b1222";
      th.style.color = "#ffffff";
    });
  } else {
    clone.querySelectorAll(".kv-table thead th").forEach((th) => {
      th.style.background = "#0b1222";
      th.style.color = "#ffffff";
    });
  }

  const card = await buildShareCardNode({
    contentNode: clone,
    title,
    subtitle,
    titleBar,
    watermark,
  });

  return exportNodeToPngDataUrl(card, {
    pixelRatio,
    backgroundColor: "#ffffff",
    sandboxWidth: sandboxWidthPx,
  });
}
