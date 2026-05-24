import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

export function useAdminBillingAccess(authFetch, showToast, t, enabled = true) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [sortField, setSortField] = useState("user_id");
  const [sortDirection, setSortDirection] = useState("asc");

  const authFetchRef = useRef(authFetch);
  const showToastRef = useRef(showToast);
  const tRef = useRef(t);
  const requestIdRef = useRef(0);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const fetchBillingUsers = useCallback(async ({ searchText = "", signal } = {}) => {
    const af = authFetchRef.current;
    if (!af) return;

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      const s = String(searchText || "").trim();
      if (s) params.set("search", s);
      params.set("limit", "50");
      params.set("offset", "0");

      const res = await af(`/api/v1/admin/billing/users?${params.toString()}`, {
        method: "GET",
        signal,
      });

      if (signal?.aborted || requestId !== requestIdRef.current) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();

      if (signal?.aborted || requestId !== requestIdRef.current) return;

      setItems(Array.isArray(data?.items) ? data.items : []);
      setStats(data?.stats || null);
    } catch (err) {
      if (isAbortLikeError(err) || signal?.aborted || requestId !== requestIdRef.current) {
        return;
      }

      console.error(err);
      const msg = err?.message || "Failed to load billing access users";
      setError(msg);

      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) toast(`${tr("admin.billingLoadError")}: ${msg}`, "danger");
    } finally {
      if (!signal?.aborted && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || !authFetch) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchBillingUsers({ searchText: search, signal: controller.signal });
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, authFetch, search, fetchBillingUsers]);

  const reloadBillingUsers = useCallback(async () => {
    const controller = new AbortController();
    await fetchBillingUsers({ searchText: search, signal: controller.signal });
  }, [fetchBillingUsers, search]);

  const handleBillingSort = (field) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("asc");
      return field;
    });
  };

  const sortedItems = useMemo(() => {
    const arr = [...items];

    arr.sort((a, b) => {
      let aVal = a?.[sortField];
      let bVal = b?.[sortField];

      if (sortField === "last_payment_status") {
        aVal = a?.last_payment?.status || "";
        bVal = b?.last_payment?.status || "";
      }

      if (sortField === "last_payment_at") {
        aVal = a?.last_payment?.paid_at || a?.last_payment?.created_at || "";
        bVal = b?.last_payment?.paid_at || b?.last_payment?.created_at || "";
      }

      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";

      if (typeof aVal === "boolean") aVal = aVal ? 1 : 0;
      if (typeof bVal === "boolean") bVal = bVal ? 1 : 0;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      if (aStr < bStr) return sortDirection === "asc" ? -1 : 1;
      if (aStr > bStr) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    return arr;
  }, [items, sortField, sortDirection]);

  return {
    billingUsers: items,
    billingStats: stats,
    billingLoading: loading,
    billingError: error,
    billingSearch: search,
    setBillingSearch: setSearch,
    billingSortField: sortField,
    billingSortDirection: sortDirection,
    handleBillingSort,
    sortedBillingUsers: sortedItems,
    reloadBillingUsers,
  };
}
