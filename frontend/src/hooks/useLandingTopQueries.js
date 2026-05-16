// src/hooks/useLandingTopQueries.js
import { useEffect, useState } from "react";

export function useLandingTopQueries({
  authFetchRef,
  initialTopQueries = [],
  limit = 5,
  refreshMs = 5 * 60 * 1000,
} = {}) {
  const [topQueries, setTopQueries] = useState(initialTopQueries);

  useEffect(() => {
    let cancelled = false;

    async function loadTop() {
      const fetchFn = authFetchRef?.current;
      if (!fetchFn || cancelled) return;

      try {
        const res = await fetchFn(`/api/v1/nl/queries/top?limit=${limit}`);
        if (!res?.ok || cancelled) return;

        const data = await res.json();
        if (cancelled) return;

        const list = data?.top_queries || data?.topQueries || data || [];
        if (Array.isArray(list) && list.length && !cancelled) {
          const normalized = list.map((item) =>
            typeof item === "string" ? { query: item } : item
          );
          setTopQueries(normalized);
        }
      } catch {
        // silent (same behavior as before)
      }
    }

    loadTop();

    const intervalId = setInterval(loadTop, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [authFetchRef, limit, refreshMs]);

  return { topQueries, setTopQueries };
}
