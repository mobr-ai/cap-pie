// src/components/dashboard/DashboardGrid.jsx
import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import DashboardWidget from "@/components/dashboard/DashboardWidget";

export default function DashboardGrid({
  items,
  activeId,
  hasDashboards,
  onDelete,
  onRename,
  onUpdateItem,
  onShare,
  onGoToConversation,
  onExpand,
  isLoading,
  order, // sortOrder from DashboardPage
}) {
  const { t } = useTranslation();

  const safeItems = Array.isArray(items) ? items : [];

  const isStillLoading =
    isLoading || items === null || typeof items === "undefined";

  // Empty state: only when a dashboard is active and exists
  const showEmptyState = activeId && hasDashboards && safeItems.length === 0;

  // Map<itemId, HTMLElement>
  const nodeMapRef = useRef(new Map());

  // Keep visual order in a REF (not state) to avoid re-render churn during swaps.
  const visualOrderRef = useRef([]);

  // Grid element ref (avoid document.querySelector)
  const gridRef = useRef(null);

  // Debounce / scheduling refs
  const raf1Ref = useRef(0);
  const raf2Ref = useRef(0);
  const debounceTimerRef = useRef(0);

  const itemIdsSignature = useMemo(() => {
    return safeItems
      .map((it) => it?.id)
      .filter(Boolean)
      .join(",");
  }, [safeItems]);

  function computeVisualOrderFromNodes(nodes) {
    const ROW_EPS = 16; // px tolerance to group same-row items

    const measured = nodes
      .map((el) => {
        if (!el) return null;

        const rawId = el.dataset.itemId;
        const id = Number(rawId);
        if (!rawId || Number.isNaN(id)) return null;

        const r = el.getBoundingClientRect();
        return { id, top: r.top, left: r.left };
      })
      .filter(Boolean);

    measured.sort((a, b) => {
      const dy = a.top - b.top;
      if (Math.abs(dy) > ROW_EPS) return dy;
      return a.left - b.left;
    });

    return measured.map((m) => m.id);
  }

  function arraysEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  const publishVisualOrder = (next) => {
    // Avoid noisy re-emits
    if (arraysEqual(visualOrderRef.current, next)) return;

    visualOrderRef.current = next;

    // Broadcast so other components can use visual order without prop threading.
    window.__capDashboardVisualOrder = next;
    window.dispatchEvent(
      new CustomEvent("cap:dashboard-visual-order", { detail: next })
    );
  };

  const recomputeVisualOrder = () => {
    const nodes = Array.from(nodeMapRef.current.values());
    const next = computeVisualOrderFromNodes(nodes);
    publishVisualOrder(next);
  };

  const scheduleRecompute = (mode = "raf") => {
    // mode:
    // - "raf" for paint-settle
    // - "debounce" for resize/observer storms

    if (raf1Ref.current) window.cancelAnimationFrame(raf1Ref.current);
    if (raf2Ref.current) window.cancelAnimationFrame(raf2Ref.current);
    raf1Ref.current = 0;
    raf2Ref.current = 0;

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = 0;

    if (mode === "debounce") {
      debounceTimerRef.current = window.setTimeout(() => {
        raf1Ref.current = window.requestAnimationFrame(() => {
          raf2Ref.current = window.requestAnimationFrame(() => {
            recomputeVisualOrder();
          });
        });
      }, 180);
      return;
    }

    // default: raf settle
    raf1Ref.current = window.requestAnimationFrame(() => {
      raf2Ref.current = window.requestAnimationFrame(() => {
        recomputeVisualOrder();
      });
    });
  };

  // Recompute after render when items change (dense layout settles after paint)
  useEffect(() => {
    if (isStillLoading) return;

    scheduleRecompute("raf");

    return () => {
      if (raf1Ref.current) window.cancelAnimationFrame(raf1Ref.current);
      if (raf2Ref.current) window.cancelAnimationFrame(raf2Ref.current);
      raf1Ref.current = 0;
      raf2Ref.current = 0;

      if (debounceTimerRef.current)
        window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStillLoading, itemIdsSignature, order]);

  // Recompute on resize + grid size changes (debounced; no React setState)
  useEffect(() => {
    if (isStillLoading) return;

    const onResize = () => {
      scheduleRecompute("debounce");
    };

    window.addEventListener("resize", onResize);

    let ro = null;
    const gridEl = gridRef.current;

    if (gridEl && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => onResize());
      ro.observe(gridEl);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStillLoading]);

  if (isStillLoading) return null;

  return (
    <div className="dashboard-grid" ref={gridRef}>
      {safeItems.map((item) => {
        return (
          <DashboardWidget
            key={item.id}
            item={item}
            outerRef={(el) => {
              if (!item?.id) return;
              if (el) nodeMapRef.current.set(item.id, el);
              else nodeMapRef.current.delete(item.id);
            }}
            outerAttrs={{ "data-item-id": item.id }}
            onDelete={onDelete}
            onRename={onRename}
            onUpdateItem={onUpdateItem}
            onShare={onShare}
            onGoToConversation={onGoToConversation}
            onExpand={onExpand}
            order={order}
          />
        );
      })}

      {showEmptyState && <p>{t("dashboard.noWidgetsYet")}</p>}
    </div>
  );
}
