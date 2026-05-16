// src/utils/share/watermark.js

export const WATERMARK_PRESETS = {
  none: { kind: "none" },

  textBottomRight: {
    kind: "text",
    text: "CAP",
    position: "bottom-right",
    opacity: 0.16,
    fontSize: 28,
    padding: 18,
  },

  logoBottomRight: {
    kind: "logo",
    src: "/icons/logo.svg",
    position: "bottom-right",
    opacity: 0.12,
    size: 160,
    padding: 18,
  },

  logoCenterBig: {
    kind: "logo",
    src: "/icons/logo.svg",
    position: "center",
    opacity: 0.08,
    size: 520,
    padding: 0,
  },
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function safeText(s) {
  return String(s || "").trim();
}

let _logoPngDataUrl = null;

/**
 * Convert an image URL (including SVG) to a PNG data URL via canvas.
 * This is the most reliable form to embed into html-to-image across browsers.
 */
async function urlToPngDataUrl(url) {
  const res = await fetch(url, { cache: "force-cache" });
  const blob = await res.blob();

  // Create object URL to load into <img>
  const objUrl = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    const loaded = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("logo_image_load_failed"));
    });

    img.src = objUrl;
    await loaded;

    const w = Math.max(1, img.naturalWidth || img.width || 1);
    const h = Math.max(1, img.naturalHeight || img.height || 1);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no_canvas_ctx");

    ctx.drawImage(img, 0, 0, w, h);

    // toDataURL is broadly supported; keep PNG.
    return canvas.toDataURL("image/png");
  } finally {
    try {
      URL.revokeObjectURL(objUrl);
    } catch {}
  }
}

/**
 * Returns a PNG data URL for the watermark logo, cached.
 */
export async function getWatermarkLogoPngDataUrl(src) {
  const s = src || "/icons/logo.svg";
  if (_logoPngDataUrl && s === "/icons/logo.svg") return _logoPngDataUrl;

  try {
    const png = await urlToPngDataUrl(s);
    if (s === "/icons/logo.svg") _logoPngDataUrl = png;
    return png;
  } catch {
    return null;
  }
}

/**
 * Creates watermark overlay node (text or logo).
 * Logo is embedded as PNG data URL to avoid Firefox SVG issues.
 */
export async function buildWatermarkOverlay(wm) {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.pointerEvents = "none";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.opacity = String(clamp(wm.opacity ?? 0.12, 0.02, 0.4));

  if (wm.kind === "text") {
    const txt = document.createElement("div");
    txt.textContent = safeText(wm.text || "CAP");
    txt.style.fontFamily =
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    txt.style.fontWeight = "800";
    txt.style.color = "#0b1222";
    txt.style.fontSize = `${wm.fontSize || 48}px`;
    txt.style.userSelect = "none";
    overlay.appendChild(txt);
  }

  if (wm.kind === "logo") {
    const img = document.createElement("img");
    const pngDataUrl = await getWatermarkLogoPngDataUrl(
      wm.src || "/icons/logo.svg",
    );

    img.src = pngDataUrl || wm.src || "/icons/logo.svg";
    img.alt = "CAP";
    img.draggable = false;

    // requested attrs
    img.setAttribute("crossorigin", "anonymous");
    img.setAttribute("referrerpolicy", "no-referrer");

    img.style.width = `${wm.size || 320}px`;
    img.style.height = "auto";
    img.style.userSelect = "none";
    overlay.appendChild(img);
  }

  if (wm.position === "bottom-right") {
    overlay.style.alignItems = "flex-end";
    overlay.style.justifyContent = "flex-end";
    overlay.style.padding = `${wm.padding ?? 16}px`;
  } else if (wm.position === "center") {
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
  }

  return overlay;
}
