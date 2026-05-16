// src/hooks/useAdminUsers.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useAdminUsers(authFetch, showToast, t) {
  const [users, setUsers] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState(null);
  const [search, setSearch] = useState("");

  const [sortField, setSortField] = useState("user_id");
  const [sortDirection, setSortDirection] = useState("asc");

  const authReady = !!authFetch;

  // Avoid unstable callback deps causing fetch loops
  const authFetchRef = useRef(authFetch);
  const showToastRef = useRef(showToast);
  const tRef = useRef(t);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const isUserAnonymized = (user) => {
    const uname = typeof user?.username === "string" ? user.username : "";
    const hasDeletedPrefix =
      uname.startsWith("deleted_") || uname.startsWith("deleted_user_");
    return !user?.email && hasDeletedPrefix;
  };

  // ---- Core fetch function (stable; does NOT depend on t/showToast/search) ----
  const fetchUsers = useCallback(async ({ searchText = "", signal } = {}) => {
    const af = authFetchRef.current;
    if (!af) return;

    setUsersLoading(true);
    setUsersError(null);

    try {
      const params = new URLSearchParams();
      const s = (searchText || "").trim();
      if (s) params.set("search", s);
      params.set("limit", "50");
      params.set("offset", "0");

      const res = await af(`/api/v1/admin/users/?${params.toString()}`, {
        method: "GET",
        signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setUsers(Array.isArray(data?.items) ? data.items : []);
      setUserStats(data?.stats || null);
    } catch (err) {
      // Ignore aborts (expected during rapid changes/unmount)
      if (err?.name === "AbortError") return;

      console.error(err);
      const msg = err?.message || "Failed to load users";
      setUsersError(msg);

      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) toast(`${tr("admin.toastLoadError")}: ${msg}`, "danger");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ---- Debounced search -> fetch ----
  useEffect(() => {
    if (!authReady) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetchUsers({ searchText: search, signal: controller.signal });
    }, 200);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [authReady, search, fetchUsers]);

  // Exposed reload for buttons/actions (no storms)
  const reloadUsers = useCallback(async () => {
    const controller = new AbortController();
    await fetchUsers({ searchText: search, signal: controller.signal });
  }, [fetchUsers, search]);

  // ---- Sorting ----
  const handleSort = (field) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDirection("asc");
      return field;
    });
  };

  const sortedUsers = useMemo(() => {
    const arr = [...users];
    arr.sort((a, b) => {
      let aVal = a?.[sortField];
      let bVal = b?.[sortField];

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
  }, [users, sortField, sortDirection]);

  // ---- Actions ----
  const toggleAdmin = async (user) => {
    const af = authFetchRef.current;
    const toast = showToastRef.current;
    const tr = tRef.current;
    if (!af) return;

    const targetFlag = !user.is_admin;

    try {
      const res = await af(`/api/v1/admin/users/${user.user_id}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_admin: targetFlag }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast && toast(data?.detail || tr("admin.toastActionError"), "danger");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? data : u))
      );
      toast &&
        toast(
          targetFlag
            ? tr("admin.toastPromotedAdmin")
            : tr("admin.toastDemotedAdmin"),
          "success"
        );
      await reloadUsers(); // keep stats consistent (safe, single call)
    } catch (err) {
      console.error(err);
      toast &&
        toast(`${tr("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  const toggleConfirmed = async (user) => {
    const af = authFetchRef.current;
    const toast = showToastRef.current;
    const tr = tRef.current;
    if (!af) return;

    const targetFlag = !user.is_confirmed;

    try {
      const res = await af(`/api/v1/admin/users/${user.user_id}/confirmed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_confirmed: targetFlag }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast && toast(data?.detail || tr("admin.toastActionError"), "danger");
        return;
      }

      setUsers((prev) =>
        prev.map((u) => (u.user_id === user.user_id ? data : u))
      );
      toast &&
        toast(
          targetFlag
            ? tr("admin.toastMarkedConfirmed")
            : tr("admin.toastMarkedUnconfirmed"),
          "success"
        );
      await reloadUsers();
    } catch (err) {
      console.error(err);
      toast &&
        toast(`${tr("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  const deleteUser = async (user) => {
    const af = authFetchRef.current;
    const toast = showToastRef.current;
    const tr = tRef.current;
    if (!af) return;

    const anonymized = isUserAnonymized(user);

    const confirmed = window.confirm(
      anonymized
        ? tr("admin.confirmDeleteUserAnonymized", {
            email: user.username || user.user_id,
          })
        : tr("admin.confirmDeleteUserOnce", {
            email: user.email || user.username || user.user_id,
          })
    );
    if (!confirmed) return;

    try {
      const res = await af(`/api/v1/admin/users/${user.user_id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const detail = data?.detail || tr("admin.toastActionError");
        toast && toast(detail, "danger");
        return;
      }

      if (data?.status === "anonymized") {
        toast && toast(tr("admin.toastUserAnonymized"), "success");
        // backend returns only status + user_id, so we must reload list/stats
        await reloadUsers();
        return;
      }

      if (data?.status === "deleted") {
        toast && toast(tr("admin.toastDeletedUser"), "success");
        // Optimistic remove + reload for stats
        setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
        await reloadUsers();
        return;
      }

      // Fallback
      toast && toast(tr("admin.toastDeletedUser"), "success");
      setUsers((prev) => prev.filter((u) => u.user_id !== user.user_id));
      await reloadUsers();
    } catch (err) {
      console.error(err);
      toast &&
        toast(`${tr("admin.toastActionError")}: ${err.message}`, "danger");
    }
  };

  const totalUsers = userStats?.total_users ?? users.length;
  const totalAdmins = userStats?.total_admins ?? 0;
  const totalConfirmed = userStats?.total_confirmed ?? 0;
  const filteredTotal = userStats?.filtered_total ?? users.length;
  const hasFilter = search.trim().length > 0;

  return {
    users,
    userStats,
    usersLoading,
    usersError,
    search,
    setSearch,
    sortField,
    sortDirection,
    handleSort,
    sortedUsers,
    totalUsers,
    totalAdmins,
    totalConfirmed,
    filteredTotal,
    hasFilter,
    isUserAnonymized,
    toggleAdmin,
    toggleConfirmed,
    deleteUser,
    reloadUsers,
    setUsers,
    setUserStats,
  };
}
