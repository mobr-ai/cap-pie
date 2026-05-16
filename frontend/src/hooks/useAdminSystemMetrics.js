// src/hooks/useAdminSystemMetrics.js
import { useEffect, useState } from "react";

export function useAdminSystemMetrics(authFetch) {
  const [systemMetrics, setSystemMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stable boolean flag – true once we have an authFetch
  const authReady = !!authFetch;

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;
    let intervalId;

    async function loadSystemMetrics(isInitial = false) {
      if (cancelled) return;
      if (isInitial) setLoading(true);
      setError(null);

      try {
        const res = await authFetch("/api/v1/admin/system/metrics", {
          method: "GET",
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (!cancelled) setSystemMetrics(data);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError(err.message || "Failed to load system metrics");
        }
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    }

    // initial fetch
    loadSystemMetrics(true);
    // then every 5s
    intervalId = setInterval(() => loadSystemMetrics(false), 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
    // only re-run when auth becomes ready (false -> true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  return { systemMetrics, systemLoading: loading, systemError: error };
}
