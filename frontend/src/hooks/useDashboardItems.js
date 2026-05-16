import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getPoller } from "@/utils/poller";
import { shallowEqualArray, setIfChanged } from "@/utils/arrays";

const DISABLE_DASH =
  String(import.meta.env.VITE_CAP_DISABLE_DASHBOARD_POLL ?? "false") === "true";

function asTimeMs(v) {
  if (!v) return null;
  const d = new Date(v);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function sortItems(items, sortOrder) {
  const safe = Array.isArray(items) ? items.slice() : [];

  const key = String(sortOrder || "position");

  // Helpers for "recency" that still work if created_at isn't returned yet:
  // prefer created_at, else fall back to id (monotonic-ish), else position.
  const recencyValue = (it) => {
    const ms = asTimeMs(it?.created_at);
    if (ms != null) return ms;
    const id = Number(it?.id);
    if (Number.isFinite(id)) return id;
    const pos = Number(it?.position);
    if (Number.isFinite(pos)) return pos;
    return 0;
  };

  if (key === "newest") {
    safe.sort((a, b) => recencyValue(b) - recencyValue(a));
    return safe;
  }

  if (key === "oldest") {
    safe.sort((a, b) => recencyValue(a) - recencyValue(b));
    return safe;
  }

  if (key === "title") {
    safe.sort((a, b) => {
      const ta = String(a?.title || "").toLowerCase();
      const tb = String(b?.title || "").toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      // stable-ish tie break
      return (Number(a?.id) || 0) - (Number(b?.id) || 0);
    });
    return safe;
  }

  // default/manual: position then id
  safe.sort((a, b) => {
    const pa = Number(a?.position);
    const pb = Number(b?.position);
    const p1 = Number.isFinite(pa) ? pa : 0;
    const p2 = Number.isFinite(pb) ? pb : 0;
    if (p1 !== p2) return p1 - p2;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
  return safe;
}

export function useDashboardItems({
  dashboards,
  defaultId,
  defaultItems,
  authFetch,
  sortOrder,
}) {
  const [activeId, setActiveId] = useState(null);
  const [items, setItems] = useState(null);

  const itemsPollerRef = useRef(null);
  const itemsAbortRef = useRef(null);

  const stopItemsPoller = useCallback(() => {
    if (itemsAbortRef.current) {
      itemsAbortRef.current.abort();
      itemsAbortRef.current = null;
    }
    if (itemsPollerRef.current?.unsub) {
      itemsPollerRef.current.unsub();
      itemsPollerRef.current = null;
    }
  }, []);

  // When we first know the defaultId, set it as active if nothing is selected
  useEffect(() => {
    if (activeId == null && defaultId != null) {
      setActiveId(defaultId);
    }
  }, [activeId, defaultId]);

  const startItemsPoller = useCallback(
    (dashId) => {
      if (DISABLE_DASH) return;
      stopItemsPoller();
      if (!dashId) return;

      // Include sort in poll key so switching sort doesn't reuse cached payload
      const pollKey = `dashboard-items:${dashId}:${String(
        sortOrder || "position"
      )}`;

      const poller = getPoller(pollKey, {
        interval: 25_000,
        maxInterval: 180_000,
      });

      poller.setFetcher(async () => {
        if (itemsAbortRef.current) itemsAbortRef.current.abort();
        itemsAbortRef.current = new AbortController();

        // Option A (client-side sort): keep URL unchanged
        const res = await authFetch(`/api/v1/dashboard/${dashId}/items`, {
          signal: itemsAbortRef.current.signal,
        });

        // Option B (server-side order later): uncomment when backend supports it
        // const res = await authFetch(
        //   `/api/v1/dashboard/${dashId}/items?order=${encodeURIComponent(
        //     String(sortOrder || "position")
        //   )}`,
        //   { signal: itemsAbortRef.current.signal }
        // );

        if (!res.ok) throw new Error(`items ${res.status}`);
        return res.json();
      });

      const unsub = poller.subscribe((data, err) => {
        if (err) {
          console.warn("Items poll error:", err?.message || err);
          return;
        }
        const safe = Array.isArray(data) ? data : [];
        const sorted = sortItems(safe, sortOrder);
        setIfChanged(setItems, sorted, shallowEqualArray);
      });

      itemsPollerRef.current = { unsub };
    },
    [authFetch, stopItemsPoller, sortOrder]
  );

  // React to activeId changes
  useEffect(() => {
    if (!activeId) {
      stopItemsPoller();
      setIfChanged(setItems, [], shallowEqualArray);
      return;
    }

    // Default dashboard: trust defaultItems, but apply client-side sort
    if (defaultId && activeId === defaultId) {
      stopItemsPoller();

      if (defaultItems == null) {
        setItems((prev) => (prev === null ? prev : null));
      } else {
        const sorted = sortItems(defaultItems, sortOrder);
        setIfChanged(setItems, sorted, shallowEqualArray);
      }
      return;
    }

    // Non-default dashboard: mark items as "loading" before fetch/poll
    setItems(null);

    if (DISABLE_DASH) {
      if (!authFetch) return;

      if (itemsAbortRef.current) itemsAbortRef.current.abort();
      const ac = new AbortController();
      itemsAbortRef.current = ac;

      (async () => {
        try {
          // Option A (client-side sort): keep URL unchanged
          const res = await authFetch(`/api/v1/dashboard/${activeId}/items`, {
            signal: ac.signal,
          });

          // Option B (server-side order later): uncomment when backend supports it
          // const res = await authFetch(
          //   `/api/v1/dashboard/${activeId}/items?order=${encodeURIComponent(
          //     String(sortOrder || "position")
          //   )}`,
          //   { signal: ac.signal }
          // );

          if (!res.ok) throw new Error(`items ${res.status}`);
          const data = await res.json();
          const safe = Array.isArray(data) ? data : [];
          const sorted = sortItems(safe, sortOrder);
          setIfChanged(setItems, sorted, shallowEqualArray);
        } catch (err) {
          if (err?.name === "AbortError") return;
          console.warn("Oneshot items fetch error:", err?.message || err);
          setIfChanged(setItems, [], shallowEqualArray);
        }
      })();

      return;
    }

    startItemsPoller(activeId);
  }, [
    activeId,
    defaultId,
    defaultItems,
    authFetch,
    startItemsPoller,
    stopItemsPoller,
    sortOrder,
  ]);

  // Keep default dashboard in sync if defaultItems changes (and re-sort)
  useEffect(() => {
    if (defaultId && activeId === defaultId) {
      if (defaultItems == null) {
        setItems((prev) => (prev === null ? prev : null));
      } else {
        const sorted = sortItems(defaultItems, sortOrder);
        setIfChanged(setItems, sorted, shallowEqualArray);
      }
    }
  }, [defaultItems, activeId, defaultId, sortOrder]);

  // Cleanup
  useEffect(
    () => () => {
      stopItemsPoller();
    },
    [stopItemsPoller]
  );

  const activeName = useMemo(() => {
    if (!activeId) return "Select dashboard";
    return (
      dashboards.find((d) => d.id === activeId)?.name || "Select dashboard"
    );
  }, [dashboards, activeId]);

  return {
    activeId,
    setActiveId,
    items,
    activeName,
  };
}
