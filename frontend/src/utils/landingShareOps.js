// src/utils/landingShareOps.js
import {
  exportChartAsPngDataUrl,
  exportElementAsPngDataUrl,
  WATERMARK_PRESETS,
} from "@/utils/shareWidgetImage";

function buildTitle({ message, sourceQuery }) {
  const titleBase = message?.type === "table" ? "Table" : "Chart";
  if (message?.title) return message.title;

  if (sourceQuery) return `${titleBase}: ${String(sourceQuery).slice(0, 80)}`;

  return `${titleBase} ${new Date().toLocaleTimeString()}`;
}

function findSourceQuery(messages, messageId) {
  const idx = (messages || []).findIndex((m) => m?.id === messageId);
  if (idx <= 0) return "";

  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]?.type === "user") return messages[i]?.content || "";
  }
  return "";
}

/**
 * Render Vega / Vega-Lite spec offscreen and return a View.
 * Hardened for Firefox: forces layout + explicit width/height + resize.
 */
async function renderVegaOffscreenToView(vegaOrVegaLiteSpec) {
  const mod = await import("vega-embed");
  const vegaEmbed = mod?.default || mod;

  const W = 1200;
  const H = 700;

  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "-10000px";
  host.style.width = `${W}px`;
  host.style.height = `${H}px`;
  host.style.pointerEvents = "none";
  host.style.opacity = "0";
  document.body.appendChild(host);

  const res = await vegaEmbed(host, vegaOrVegaLiteSpec, {
    actions: false,
    renderer: "canvas",
  });

  const view = res?.view;
  if (!view) {
    try {
      host.remove();
    } catch {}
    throw new Error("offscreen_view_missing");
  }

  // Firefox: ensure layout is committed before Vega computes bounds
  try {
    host.getBoundingClientRect();
  } catch {}

  // Firefox: make view size deterministic
  try {
    view.width(W);
    view.height(H);
    view.resize();
  } catch {}

  await view.runAsync();
  return { view, host };
}

/**
 * Build share payload for ShareModal from an artifact message.
 * Returns:
 *  - { title, imageDataUrl, hashtags, message }
 *  - or { error: "share_failed", ... } on failure
 */
export async function createSharePayloadForArtifact({
  message,
  messages,
  conversationTitle,
  tableElByMsgIdRef,
}) {
  try {
    if (!message) throw new Error("missing_message");

    const sourceQuery = findSourceQuery(messages || [], message.id);
    const title = buildTitle({ message, sourceQuery });
    const subtitle = conversationTitle ? String(conversationTitle) : "";

    // Always request logo watermark (Firefox logo reliability depends on shareWidgetImage.js SVG handling)
    const watermarkPreset = WATERMARK_PRESETS.logoCenterBig;

    let imageDataUrl = null;

    if (message.type === "chart" && message.vegaSpec) {
      const { view, host } = await renderVegaOffscreenToView(message.vegaSpec);

      try {
        imageDataUrl = await exportChartAsPngDataUrl({
          vegaView: view,
          title,
          subtitle,
          titleBar: true,
          watermark: watermarkPreset,
          targetWidth: 1600,
        });
      } finally {
        try {
          view.finalize?.();
        } catch {}
        try {
          host.remove();
        } catch {}
      }

      if (!imageDataUrl) throw new Error("chart_export_failed");
    } else if (message.type === "table" && message.kv) {
      const el = tableElByMsgIdRef?.current?.get(message.id) || null;
      if (!el) throw new Error("table_ref_missing");

      imageDataUrl = await exportElementAsPngDataUrl({
        element: el,
        title,
        subtitle,
        titleBar: true,
        watermark: watermarkPreset,
        pixelRatio: 2,
      });

      if (!imageDataUrl) throw new Error("table_export_failed");
    } else {
      throw new Error("unsupported_message_type");
    }

    return {
      title,
      imageDataUrl,
      hashtags: ["CAP", "Cardano", "Analytics"],
      message: sourceQuery || "",
    };
  } catch (err) {
    // Keep it visible; Firefox failures can be silent otherwise.
    // eslint-disable-next-line no-console
    console.error("[landingShareOps] share export failed:", err);

    return {
      title: "CAP",
      imageDataUrl: null,
      hashtags: ["CAP", "Cardano", "Analytics"],
      message: "",
      error: "share_failed",
    };
  }
}
