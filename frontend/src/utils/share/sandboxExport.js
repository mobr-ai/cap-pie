// src/utils/share/sandboxExport.js
import { toPng } from "html-to-image";

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(r));
}

async function waitFonts() {
  try {
    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch {
    // ignore
  }
}

async function waitImages(root) {
  try {
    const imgs = Array.from(root?.querySelectorAll?.("img") || []);
    if (!imgs.length) return;

    await Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve) => {
            // Already loaded
            if (img.complete && img.naturalWidth > 0) return resolve();

            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          }),
      ),
    );
  } catch {
    // ignore
  }
}

function isFirefoxFontEmbedError(e) {
  const msg = String(e?.message || e || "");
  const stack = String(e?.stack || "");
  // Matches your exact failure + common html-to-image font embed stack markers
  return (
    msg.toLowerCase().includes("font is undefined") ||
    stack.includes("embed-webfonts") ||
    stack.includes("normalizeFontFamily") ||
    stack.includes("embedWebFonts")
  );
}

export async function exportNodeToPngDataUrl(
  node,
  { pixelRatio = 2, backgroundColor = "#ffffff", sandboxWidth = 1200 } = {},
) {
  const sandbox = document.createElement("div");
  sandbox.style.position = "fixed";
  sandbox.style.left = "-100000px";
  sandbox.style.top = "0";
  sandbox.style.zIndex = "-1";
  sandbox.style.padding = "0";
  sandbox.style.margin = "0";
  sandbox.style.background = "transparent";
  sandbox.style.width = `${sandboxWidth}px`;
  sandbox.style.maxWidth = `${sandboxWidth}px`;
  sandbox.style.boxSizing = "border-box";
  sandbox.style.display = "block";

  document.body.appendChild(sandbox);
  sandbox.appendChild(node);

  try {
    // Let layout settle, then wait for fonts + images (Firefox is stricter here)
    await nextFrame();
    await nextFrame();
    await waitFonts();
    await waitImages(node);
    await nextFrame();

    const rect = node.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);

    const baseOpts = {
      cacheBust: true,
      pixelRatio,
      backgroundColor,
      width,
      height,
      style: {
        transform: "scale(1)",
        transformOrigin: "top left",
      },
    };

    try {
      return await toPng(node, baseOpts);
    } catch (e) {
      // Firefox-only: html-to-image webfont embedder can crash on some computed font values.
      // Retry with fonts disabled (options are ignored by the lib if unsupported).
      if (!isFirefoxFontEmbedError(e)) throw e;

      return await toPng(node, {
        ...baseOpts,
        skipFonts: true,
        fontEmbedCSS: "",
      });
    }
  } finally {
    sandbox.remove();
  }
}
