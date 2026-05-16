// src/hooks/useAdminMetrics.js
import { useEffect, useMemo, useRef, useState } from "react";

export function useAdminMetrics(authFetch, enabled = true, { days = 30 } = {}) {
  const [report, setReport] = useState(null);
  const [recentQueries, setRecentQueries] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Keep latest authFetch without retriggering the main effect
  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  // Use a stable key to refetch when "days" changes (optional)
  const windowKey = useMemo(() => `days:${Number(days || 0)}`, [days]);

  useEffect(() => {
    if (!enabled) return;
    if (!authFetchRef.current) return;

    let cancelled = false;
    const ctrl = new AbortController();

    async function run() {
      setIsLoading(true);
      setError("");

      try {
        const r1 = await authFetchRef.current("/api/v1/metrics/report", {
          method: "GET",
          signal: ctrl.signal,
        });
        if (!r1.ok) {
          const data = await r1.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${r1.status}`);
        }

        const r2 = await authFetchRef.current(
          "/api/v1/metrics/queries?limit=25",
          {
            method: "GET",
            signal: ctrl.signal,
          }
        );
        if (!r2.ok) {
          const data = await r2.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${r2.status}`);
        }

        const data1 = await r1.json();
        const data2 = await r2.json();

        if (cancelled) return;
        setReport(data1);
        setRecentQueries(data2);
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [enabled, windowKey]);

  return { report, recentQueries, isLoading, error };
}
