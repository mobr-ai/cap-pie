// src/utils/share/shareCard.js
import { WATERMARK_PRESETS, buildWatermarkOverlay } from "./watermark";

function safeText(s) {
  return String(s || "").trim();
}

export async function buildShareCardNode({
  contentNode,
  title,
  subtitle,
  titleBar = true,
  watermark = WATERMARK_PRESETS.logoCenterBig,
}) {
  const outer = document.createElement("div");
  outer.setAttribute("data-cap-sharecard", "1");

  outer.style.display = "block";
  outer.style.width = "100%";
  outer.style.boxSizing = "border-box";
  outer.style.borderRadius = "26px";
  outer.style.overflow = "hidden";
  outer.style.background = "#ffffff";
  outer.style.border = "1px solid rgba(2, 6, 23, 0.18)";
  outer.style.boxShadow = "0 14px 45px rgba(0,0,0,0.20)";

  if (titleBar) {
    const head = document.createElement("div");
    head.style.background = "#3f4756";
    head.style.color = "#ffffff";
    head.style.padding = "18px 20px";
    head.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    head.style.display = "flex";
    head.style.flexDirection = "column";
    head.style.gap = "6px";

    const t = document.createElement("div");
    t.textContent = safeText(title);
    t.style.fontSize = "22px";
    t.style.fontWeight = "700";
    t.style.lineHeight = "1.15";
    t.style.letterSpacing = "0.2px";

    const sub = document.createElement("div");
    sub.textContent = safeText(subtitle);
    sub.style.fontSize = "14px";
    sub.style.opacity = "0.92";
    sub.style.lineHeight = "1.2";

    head.appendChild(t);
    if (safeText(subtitle)) head.appendChild(sub);
    outer.appendChild(head);
  }

  const body = document.createElement("div");
  body.style.position = "relative";
  body.style.background = "#ffffff";
  body.style.padding = "18px";
  body.style.display = "block";
  body.style.width = "100%";
  body.style.boxSizing = "border-box";

  const contentWrap = document.createElement("div");
  contentWrap.style.display = "block";
  contentWrap.style.width = "100%";
  contentWrap.style.maxWidth = "100%";
  contentWrap.style.boxSizing = "border-box";
  contentWrap.style.background = "#ffffff";
  contentWrap.style.color = "#0f172a";

  contentWrap.appendChild(contentNode);
  body.appendChild(contentWrap);

  const wm = watermark || WATERMARK_PRESETS.none;
  if (wm.kind !== "none") {
    const overlay = await buildWatermarkOverlay(wm);
    body.appendChild(overlay);
  }

  outer.appendChild(body);
  return outer;
}
