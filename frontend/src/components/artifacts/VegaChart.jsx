import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import vegaEmbed from "vega-embed";

function clamp(n, min, max) {
  if (typeof n !== "number" || Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function isUrlLike(v) {
  if (v === undefined || v === null) return false;
  const s = String(v).trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

function pickFirstUrlFromDatum(datum, preferredField = null) {
  if (!datum || typeof datum !== "object") return null;

  if (preferredField && isUrlLike(datum[preferredField])) {
    return String(datum[preferredField]).trim();
  }
  for (const k of Object.keys(datum)) {
    if (isUrlLike(datum[k])) return String(datum[k]).trim();
  }
  return null;
}

// Recursively strip any Vega-Lite href encoding to prevent in-place navigation.
// This guarantees "new tab only" behavior across Brave/Firefox.
function stripHrefEverywhere(node) {
  if (!node || typeof node !== "object") return;

  if (node.encoding && typeof node.encoding === "object") {
    if (node.encoding.href) delete node.encoding.href;
  }

  // Common nested places
  const nestedKeys = [
    "layer",
    "hconcat",
    "vconcat",
    "concat",
    "spec",
    "facet",
    "repeat",
  ];
  for (const k of nestedKeys) {
    const v = node[k];
    if (Array.isArray(v)) {
      for (const child of v) stripHrefEverywhere(child);
    } else if (v && typeof v === "object") {
      stripHrefEverywhere(v);
    }
  }
}

function normalizeSpec(spec, { targetW, targetH, slotW, slotH } = {}) {
  if (!spec || typeof spec !== "object") return spec;

  const schema = String(spec.$schema || "");

  // Deep clone so we can safely modify nested encodings.
  // (Structured clone would be nicer but not always available.)
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(spec));
  } catch {
    copy = { ...spec };
  }

  if (schema.includes("vega-lite")) {
    // Strip href everywhere so Vega never navigates in-place.
    stripHrefEverywhere(copy);

    const autosize =
      copy.autosize && typeof copy.autosize === "object" ? copy.autosize : {};
    const slotIsMeasurable = (slotW || 0) >= 40 && (slotH || 0) >= 40;

    delete copy.width;
    delete copy.height;

    if (slotIsMeasurable) {
      copy.width = "container";
      copy.height = "container";
    } else {
      copy.width = targetW;
      copy.height = targetH;
    }

    copy.autosize = {
      type: "fit",
      contains: "padding",
      resize: true,
      ...autosize,
    };

    return copy;
  }

  if (schema.includes("vega/v")) {
    copy.width = targetW;
    copy.height = targetH;
    copy.padding = 2.5;
    copy.autosize = "none";
    return copy;
  }

  return copy;
}

function getSlotEl(containerEl) {
  if (!containerEl) return null;

  const explicit =
    containerEl.closest?.(".vega-chart-slot") ||
    containerEl.querySelector?.(".vega-chart-slot");
  if (explicit) return explicit;

  const modalInner = containerEl.closest?.(".dashboard-widget-modal-inner");
  if (modalInner) return modalInner;

  const widgetCapture = containerEl.closest?.(".dashboard-widget-capture");
  if (widgetCapture) return widgetCapture;

  return containerEl.parentElement || containerEl;
}

function getSlotSize(containerEl) {
  const slotEl = getSlotEl(containerEl);
  if (!slotEl) return { w: 0, h: 0 };
  return { w: slotEl.clientWidth || 0, h: slotEl.clientHeight || 0 };
}

function detachHandlers(view) {
  if (!view || !view.__capLinkHandlers) return;
  const { click, move, out } = view.__capLinkHandlers;

  try {
    if (click) view.removeEventListener?.("click", click);
    if (move) view.removeEventListener?.("mousemove", move);
    if (out) view.removeEventListener?.("mouseout", out);
  } catch {
    // ignore
  }

  view.__capLinkHandlers = null;
}

function attachHandlers(view, rawSpec, hostEl) {
  if (!view || !hostEl) return;

  detachHandlers(view);

  const preferredUriField = rawSpec?.usermeta?.uriField || null;
  const canvasEl = hostEl.querySelector("canvas");

  const setCanvasCursor = (value) => {
    if (!canvasEl) return;
    canvasEl.style.cursor = value || "";
  };

  const click = (event, item) => {
    try {
      const datum = item?.datum;
      const url = pickFirstUrlFromDatum(datum, preferredUriField);

      // If not clicking a URL-bearing mark, allow normal bubbling
      // (dashboard widget click should open modal).
      if (!url) return;

      const domEvt = event?.event || event;
      domEvt?.preventDefault?.();
      domEvt?.stopPropagation?.();
      domEvt?.stopImmediatePropagation?.();

      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  };

  const move = (event, item) => {
    try {
      const datum = item?.datum;
      const url = pickFirstUrlFromDatum(datum, preferredUriField);
      setCanvasCursor(url ? "pointer" : "");
    } catch {
      setCanvasCursor("");
    }
  };

  const out = () => setCanvasCursor("");

  try {
    view.addEventListener?.("click", click);
    view.addEventListener?.("mousemove", move);
    view.addEventListener?.("mouseout", out);
    view.__capLinkHandlers = { click, move, out };
  } catch {
    // ignore
  }
}

export default function VegaChart({
  spec,
  className = "",
  style = {},
  onError,
  onRendered,
  onViewReady,
  embedOptions = {},
}) {
  const containerRef = useRef(null);
  const embedRef = useRef(null);
  const rafRef = useRef(null);
  const lastSizeRef = useRef({ w: 0, h: 0 });
  const lastSpecKeyRef = useRef("");
  const [renderError, setRenderError] = useState(null);

  const specKey = useMemo(() => {
    try {
      return JSON.stringify({
        s: spec?.$schema || "",
        d: spec?.description || "",
        t: spec?.title || "",
        u: spec?.usermeta ? Object.keys(spec.usermeta) : [],
        e: spec?.encoding ? Object.keys(spec.encoding) : [],
        l: Array.isArray(spec?.layer) ? spec.layer.length : 0,
      });
    } catch {
      return String(Date.now());
    }
  }, [spec]);

  const inModal = useMemo(() => {
    const el = containerRef.current;
    return Boolean(el?.closest?.(".dashboard-widget-modal"));
  }, [specKey]);

  const computeTargetDims = (slotW, slotH) => {
    const measurableW = typeof slotW === "number" && slotW >= 40;
    const measurableH = typeof slotH === "number" && slotH >= 40;

    const isNarrow = measurableW && slotW < 520;

    const fallbackW = isNarrow ? 340 : 520;
    const fallbackH = inModal ? 420 : isNarrow ? 220 : 300;

    const w = measurableW ? slotW : fallbackW;
    const h = measurableH ? slotH : fallbackH;

    const maxW = inModal ? 1400 : 1100;
    const maxH = inModal ? 900 : 700;

    const minW = 240;
    const minH = inModal ? 320 : 180;

    return { safeW: clamp(w, minW, maxW), safeH: clamp(h, minH, maxH) };
  };

  const destroyEmbed = async () => {
    try {
      if (embedRef.current?.view) {
        try {
          detachHandlers(embedRef.current.view);
        } catch {}
        embedRef.current.view.finalize();
      }
    } catch {}
    embedRef.current = null;
  };

  const runEmbed = async ({ force = false } = {}) => {
    const el = containerRef.current;
    if (!el) return;

    if (!spec || typeof spec !== "object") {
      const err = new Error("Invalid Vega spec");
      setRenderError(err);
      onError?.(err);
      return;
    }

    const { w: slotW, h: slotH } = getSlotSize(el);
    const { safeW, safeH } = computeTargetDims(slotW, slotH);

    const sameSpecKey = lastSpecKeyRef.current === specKey;
    const sizeEps = inModal ? 2 : 8;
    const sameSize =
      Math.abs(lastSizeRef.current.w - safeW) < sizeEps &&
      Math.abs(lastSizeRef.current.h - safeH) < sizeEps;

    if (!force && sameSize && sameSpecKey && embedRef.current?.view) return;

    lastSizeRef.current = { w: safeW, h: safeH };
    lastSpecKeyRef.current = specKey;

    setRenderError(null);

    if (embedRef.current?.view && sameSpecKey) {
      try {
        const v = embedRef.current.view;
        v.width?.(safeW);
        v.height?.(safeH);
        v.resize?.();
        await v.runAsync?.();
        onRendered?.(embedRef.current);
        onViewReady?.(embedRef.current.view);
        return;
      } catch {
        // fall through
      }
    }

    const normalizedSpec = normalizeSpec(spec, {
      targetW: safeW,
      targetH: safeH,
      slotW,
      slotH,
    });

    if (embedRef.current?.view) {
      try {
        detachHandlers(embedRef.current.view);
      } catch {}
      try {
        embedRef.current.view.finalize();
      } catch {}
      embedRef.current = null;
    }

    el.innerHTML = "";

    try {
      const opts = {
        actions: false,
        renderer: "canvas",
        ...embedOptions,
      };

      const result = await vegaEmbed(el, normalizedSpec, opts);
      embedRef.current = result;

      attachHandlers(result.view, spec, el);

      try {
        result.view.resize?.();
        await result.view.runAsync?.();
      } catch {}

      onRendered?.(result);
      onViewReady?.(result.view);
    } catch (err) {
      setRenderError(err);
      onError?.(err);
    }
  };

  const schedule = ({ force = false } = {}) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      runEmbed({ force }).catch(() => {});
    });
  };

  useLayoutEffect(() => {
    schedule({ force: true });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const slotEl = getSlotEl(el);
    if (!slotEl) return;

    const ro = new ResizeObserver(() => schedule({ force: false }));
    ro.observe(slotEl);
    if (slotEl !== el) ro.observe(el);

    return () => {
      try {
        ro.disconnect();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  useEffect(() => {
    const onWinResize = () => schedule({ force: false });

    window.addEventListener("resize", onWinResize, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onWinResize, { passive: true });
      vv.addEventListener("scroll", onWinResize, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", onWinResize);
      if (vv) {
        vv.removeEventListener("resize", onWinResize);
        vv.removeEventListener("scroll", onWinResize);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey]);

  useEffect(() => {
    return () => {
      destroyEmbed().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`vega-chart-container ${className}`.trim()} style={style}>
      {renderError ? (
        <div className="vega-chart-error">
          Unable to render chart visualization. Please refer to the textual
          explanation.
        </div>
      ) : null}
      <div ref={containerRef} className="vega-chart-embed" />
    </div>
  );
}
