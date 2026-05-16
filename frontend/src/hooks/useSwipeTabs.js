// src/hooks/useSwipeTabs.js
import { useCallback, useRef } from "react";

const isFormishTarget = (el) => {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  // Allow opting out via data attribute
  if (el.closest?.("[data-swipe-tabs-disabled='true']")) return true;
  return false;
};

export function useSwipeTabs({
  activeTab,
  tabs,
  onChange,
  swipeMinPx = 70,
  tapMovePx = 10,
}) {
  const swipeRef = useRef({
    down: false,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    pointerId: null,
    cancel: false,
  });

  const indexOf = useCallback(
    (key) => tabs.findIndex((t) => t.key === key),
    [tabs]
  );

  const goDelta = useCallback(
    (delta) => {
      const idx = indexOf(activeTab);
      if (idx < 0) return;
      const next = tabs[idx + delta];
      if (!next) return;
      onChange(next.key);
    },
    [activeTab, indexOf, onChange, tabs]
  );

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === "mouse") return;

    const target = e.target;
    const cancel = isFormishTarget(target);

    swipeRef.current = {
      down: true,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      dy: 0,
      pointerId: e.pointerId,
      cancel,
    };
  }, []);

  const onPointerMove = useCallback((e) => {
    const s = swipeRef.current;
    if (!s.down) return;
    if (s.pointerId !== null && e.pointerId !== s.pointerId) return;
    s.dx = e.clientX - s.x0;
    s.dy = e.clientY - s.y0;
  }, []);

  const onPointerUp = useCallback(() => {
    const s = swipeRef.current;
    if (!s.down) return;
    s.down = false;

    if (s.cancel) return;

    const absX = Math.abs(s.dx);
    const absY = Math.abs(s.dy);

    // ignore tiny movements
    if (absX < tapMovePx && absY < tapMovePx) return;

    // require mostly horizontal swipe
    if (absX < swipeMinPx) return;
    if (absY > absX * 0.7) return;

    if (s.dx < 0) goDelta(+1); // swipe left -> next tab
    else goDelta(-1); // swipe right -> prev tab
  }, [goDelta, swipeMinPx, tapMovePx]);

  const onPointerCancel = useCallback(() => {
    swipeRef.current.down = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
