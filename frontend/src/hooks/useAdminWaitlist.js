// src/hooks/useAdminWaitlist.js
import { useEffect, useMemo, useState } from "react";

/**
 * Backwards-compatible signature:
 *   useAdminWaitlist(authFetch, showToast, t)
 * New (Option A):
 *   useAdminWaitlist(authFetch, showToast, t, { refreshUsers })
 * or:
 *   useAdminWaitlist(authFetch, showToast, t, refreshUsersFn)
 */
export function useAdminWaitlist(authFetch, showToast, t, optsOrFn) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");

  const authReady = !!authFetch;

  const refreshUsers =
    typeof optsOrFn === "function"
      ? optsOrFn
      : typeof optsOrFn === "object" && optsOrFn
        ? optsOrFn.refreshUsers
        : null;

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        params.set("limit", "50");
        params.set("offset", "0");

        const res = await authFetch(
          `/api/v1/admin/wait_list/?${params.toString()}`,
          { method: "GET" },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        setItems(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          const msg = err?.message || "Failed to load waitlist";
          setError(msg);
          showToast &&
            showToast(`${t("admin.toastLoadError")}: ${msg}`, "danger");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, search]);

  const createUserFromWaitlist = async (email, confirm = false) => {
    if (!authFetch) return;

    try {
      const res = await authFetch(
        `/api/v1/admin/wait_list/${encodeURIComponent(email)}/create_user`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm }),
        },
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || t("admin.toastActionError");
        showToast && showToast(msg, "danger");
        return;
      }

      showToast &&
        showToast(
          confirm
            ? t("admin.toastWaitlistUserCreatedConfirmed")
            : t("admin.toastWaitlistUserCreated"),
          "success",
        );

      // Remove from waitlist immediately (current working behavior)
      setItems((prev) => prev.filter((i) => i.email !== email));

      // Option A: refresh user directory after success
      if (typeof refreshUsers === "function") {
        try {
          await refreshUsers();
        } catch (e) {
          // Don’t break the flow; just log.
          console.warn(
            "[admin] refreshUsers failed after waitlist promotion:",
            e,
          );
        }
      }
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(`${t("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  const deleteWaitlistEntry = async (email) => {
    if (!authFetch) return;

    try {
      const res = await authFetch(
        `/api/v1/admin/wait_list/${encodeURIComponent(email)}`,
        { method: "DELETE" },
      );

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const msg = data?.detail || t("admin.toastActionError");
        showToast && showToast(msg, "danger");
        return;
      }

      setItems((prev) => prev.filter((i) => i.email !== email));
      showToast && showToast(t("admin.toastWaitlistDeleted"), "success");
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(`${t("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  // ----------------------------
  // Derived stats (UI cards)
  // ----------------------------
  const hasWaitlistFilter = search.trim().length > 0;

  const stats = useMemo(() => {
    const totalWaitlist = items.length;

    const waitlistWithRef = items.reduce((acc, it) => {
      const hasRef = typeof it?.ref === "string" && it.ref.trim().length > 0;
      return acc + (hasRef ? 1 : 0);
    }, 0);

    const langSet = new Set();
    for (const it of items) {
      const lang = (it?.language || "").trim();
      if (lang) langSet.add(lang);
    }
    const waitlistLanguages = langSet.size;

    return { totalWaitlist, waitlistWithRef, waitlistLanguages };
  }, [items]);

  // NOTE: when filtered, backend returns a filtered list; we surface that as "filtered count"
  const waitlistFilteredTotal = items.length;

  return {
    items,
    loading,
    error,
    search,
    setSearch,
    createUserFromWaitlist,
    deleteWaitlistEntry,

    // stats for WaitlistStatsSummary
    totalWaitlist: stats.totalWaitlist,
    waitlistWithRef: stats.waitlistWithRef,
    waitlistLanguages: stats.waitlistLanguages,
    hasWaitlistFilter,
    waitlistFilteredTotal,
  };
}
