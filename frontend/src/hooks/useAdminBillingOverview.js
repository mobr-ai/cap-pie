import { useCallback, useEffect, useRef, useState } from "react";

function isAbortLikeError(err) {
  const name = String(err?.name || "").toLowerCase();
  const message = String(err?.message || "").toLowerCase();

  return (
    name === "aborterror" ||
    message.includes("aborted") ||
    message.includes("abort") ||
    message.includes("signal is aborted")
  );
}

export function useAdminBillingOverview(authFetch, enabled = true) {
  const [billingOverview, setBillingOverview] = useState(null);
  const [billingOverviewLoading, setBillingOverviewLoading] = useState(Boolean(enabled));
  const [billingOverviewError, setBillingOverviewError] = useState(null);

  const authFetchRef = useRef(authFetch);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const reloadBillingOverview = useCallback(async ({ signal } = {}) => {
    const af = authFetchRef.current;
    if (!af) return;

    setBillingOverviewLoading(true);
    setBillingOverviewError(null);

    try {
      const res = await af("/api/v1/admin/billing/overview", {
        method: "GET",
        signal,
      });

      if (signal?.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (signal?.aborted) return;

      setBillingOverview(data || null);
    } catch (err) {
      if (isAbortLikeError(err) || signal?.aborted) return;

      console.error(err);
      setBillingOverviewError(err?.message || "Failed to load billing overview");
    } finally {
      if (!signal?.aborted) {
        setBillingOverviewLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !authFetch) return;

    const controller = new AbortController();
    reloadBillingOverview({ signal: controller.signal });

    return () => controller.abort();
  }, [enabled, authFetch, reloadBillingOverview]);

  return {
    billingOverview,
    billingOverviewLoading,
    billingOverviewError,
    reloadBillingOverview,
  };
}
