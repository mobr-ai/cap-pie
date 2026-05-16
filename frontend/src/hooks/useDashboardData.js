// src/hooks/useDashboardData.js
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getPoller } from "@/utils/poller";
import { shallowEqualArray, setIfChanged } from "@/utils/arrays";

export default function useDashboardData(authFetch) {
  const DISABLE_DASH =
    String(import.meta.env.VITE_CAP_DISABLE_DASHBOARD_POLL ?? "false") ===
    "true";

  const [dashboard, setDashboard] = useState([]);
  const [defaultId, setDefaultId] = useState(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const acDashRef = useRef(null);
  const acItemsRef = useRef(null);

  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const pollDash = useMemo(
    () =>
      getPoller("dashboards", {
        interval: 30_000,
        maxInterval: 300_000,
      }),
    []
  );

  const getItemsPoller = useCallback(
    (id) =>
      getPoller(`dashboard-items:${id}`, {
        interval: 25_000,
        maxInterval: 180_000,
      }),
    []
  );
  const itemsPollerRef = useRef(null);

  // ---------------------------
  // Apply item update locally (instant UI)
  // ---------------------------
  const applyDashboardItemUpdate = useCallback((updated) => {
    if (!updated || updated.id == null) return;

    setItems((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;

      const idx = prev.findIndex((x) => String(x?.id) === String(updated.id));
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = { ...next[idx], ...updated };

      // keep list stable and "manual order" consistent
      next.sort((a, b) => {
        const ap = Number(a?.position ?? 0);
        const bp = Number(b?.position ?? 0);
        if (ap !== bp) return ap - bp;
        return Number(a?.id ?? 0) - Number(b?.id ?? 0);
      });

      return next;
    });
  }, []);

  // ---------------------------
  // dashboards list
  // ---------------------------
  useEffect(() => {
    if (!authFetchRef.current) return;

    if (DISABLE_DASH) {
      const ac = new AbortController();
      acDashRef.current = ac;

      (async () => {
        try {
          const res = await authFetchRef.current("/api/v1/dashboard", {
            signal: ac.signal,
          });
          if (!res.ok) throw new Error(`dashboards ${res.status}`);
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setError(null);
          setIfChanged(setDashboard, list, shallowEqualArray);

          const preferred = list.find((d) => d.is_default) || list[0] || null;
          const nextId = preferred?.id ?? null;
          setDefaultId(nextId);
        } catch (err) {
          if (err?.name === "AbortError") return;
          setError(err);
        }
      })();

      return () => {
        ac.abort();
      };
    }

    // polling mode
    pollDash.setFetcher(async () => {
      if (acDashRef.current) acDashRef.current.abort();
      acDashRef.current = new AbortController();
      const res = await authFetchRef.current("/api/v1/dashboard", {
        signal: acDashRef.current.signal,
      });
      if (!res.ok) throw new Error(`dashboards ${res.status}`);
      return res.json();
    });

    const unsub = pollDash.subscribe((data, err) => {
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      const list = Array.isArray(data) ? data : [];
      setIfChanged(setDashboard, list, shallowEqualArray);

      const preferred = list.find((d) => d.is_default) || list[0] || null;
      const nextId = preferred?.id ?? null;
      setDefaultId((prev) => (prev == null ? nextId : prev));
    });

    return () => {
      if (acDashRef.current) acDashRef.current.abort();
      unsub();
    };
  }, [DISABLE_DASH, pollDash]);

  // ---------------------------
  // default dashboard items
  // ---------------------------
  useEffect(() => {
    if (!authFetchRef.current || !defaultId) return () => {};

    if (DISABLE_DASH) {
      const ac = new AbortController();
      acItemsRef.current = ac;

      (async () => {
        try {
          const res = await authFetchRef.current(
            `/api/v1/dashboard/${defaultId}/items`,
            { signal: ac.signal }
          );
          if (!res.ok) throw new Error(`items ${res.status}`);
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setError(null);
          setIfChanged(setItems, list, shallowEqualArray);
        } catch (err) {
          if (err?.name === "AbortError") return;
          setError(err);
        }
      })();

      return () => {
        ac.abort();
      };
    }

    if (acItemsRef.current) acItemsRef.current.abort();
    if (itemsPollerRef.current?.unsub) {
      itemsPollerRef.current.unsub();
      itemsPollerRef.current = null;
    }

    const poller = getItemsPoller(defaultId);

    poller.setFetcher(async () => {
      if (acItemsRef.current) acItemsRef.current.abort();
      acItemsRef.current = new AbortController();
      const res = await authFetchRef.current(
        `/api/v1/dashboard/${defaultId}/items`,
        { signal: acItemsRef.current.signal }
      );
      if (!res.ok) throw new Error(`items ${res.status}`);
      return res.json();
    });

    const unsub = poller.subscribe((data, err) => {
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      const list = Array.isArray(data) ? data : [];
      setIfChanged(setItems, list, shallowEqualArray);
    });

    itemsPollerRef.current = { unsub };

    return () => {
      if (acItemsRef.current) acItemsRef.current.abort();
      unsub();
    };
  }, [DISABLE_DASH, defaultId, getItemsPoller]);

  const refresh = useCallback(() => {
    if (DISABLE_DASH) {
      if (!authFetchRef.current) return;

      // refresh dashboards
      authFetchRef
        .current("/api/v1/dashboard")
        .then((res) => {
          if (!res.ok) throw new Error(`dashboards ${res.status}`);
          return res.json();
        })
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          setError(null);
          setIfChanged(setDashboard, list, shallowEqualArray);
          const preferred = list.find((d) => d.is_default) || list[0] || null;
          const nextId = preferred?.id ?? null;
          setDefaultId(nextId);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setError(err);
        });

      // refresh default items
      if (defaultId) {
        authFetchRef
          .current(`/api/v1/dashboard/${defaultId}/items`)
          .then((res) => {
            if (!res.ok) throw new Error(`items ${res.status}`);
            return res.json();
          })
          .then((data) => {
            const list = Array.isArray(data) ? data : [];
            setError(null);
            setIfChanged(setItems, list, shallowEqualArray);
          })
          .catch((err) => {
            if (err?.name === "AbortError") return;
            setError(err);
          });
      }

      return;
    }

    // polling mode
    pollDash.forceRefresh();
    if (defaultId) getItemsPoller(defaultId).forceRefresh();
  }, [DISABLE_DASH, pollDash, defaultId, getItemsPoller]);

  // NOTE: items here are always "default dashboard items"
  return {
    dashboard,
    defaultId,
    items,
    error,
    refresh,
    applyDashboardItemUpdate,
  };
}
