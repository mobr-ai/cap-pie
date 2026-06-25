// src/hooks/useAdminBetaProgram.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STATUS_OPTIONS = [
  "new",
  "reviewing",
  "invited",
  "accepted",
  "rejected",
  "archived",
];

const FILTER_DEBOUNCE_MS = 450;
const POLL_INTERVAL_MS = 45_000;
const NOTIFICATION_AUTOSAVE_MS = 700;

function normalizeRecipients(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeRecipientsText(list) {
  return normalizeRecipients(list).join("\n");
}

function parseRecipientsText(raw) {
  return normalizeRecipients(String(raw || "").split(/\r?\n/g));
}

function makeEmptyNotification() {
  return {
    notifyConfig: { enabled: false, recipients: [] },
    notifyRecipientsText: "",
    notifyLoading: true,
    notifySaving: false,
    notifyError: null,
    notificationsTesting: false,
    notifyLoaded: false,
    notifyDirty: false,
  };
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function isDocumentVisible() {
  if (typeof document === "undefined") return true;
  return document.visibilityState !== "hidden";
}

function notificationPayload(state) {
  return {
    enabled: !!state?.notifyConfig?.enabled,
    recipients: normalizeRecipients(state?.notifyConfig?.recipients || []),
  };
}

function applyNotificationResponse(setter, data) {
  const recipients = normalizeRecipients(data?.recipients || []);
  setter((p) => ({
    ...p,
    notifySaving: false,
    notifyLoading: false,
    notifyLoaded: true,
    notifyDirty: false,
    notifyError: null,
    notifyConfig: { enabled: !!data?.enabled, recipients },
    notifyRecipientsText: normalizeRecipientsText(recipients),
  }));
}

export function useAdminBetaProgram(authFetch, showToast, t, enabled = true) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const debouncedSearch = useDebouncedValue(search, FILTER_DEBOUNCE_MS);
  const debouncedStatus = useDebouncedValue(status, FILTER_DEBOUNCE_MS);

  const [registrations, setRegistrations] = useState(null);
  const [latestQueries, setLatestQueries] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const [betaNotifications, setBetaNotifications] = useState(() =>
    makeEmptyNotification(),
  );
  const [queryNotifications, setQueryNotifications] = useState(() =>
    makeEmptyNotification(),
  );

  const authReady = !!authFetch && enabled;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadRegistrations = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!authReady) return;
      if (!force && !isDocumentVisible()) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        params.set("limit", "100");
        params.set("offset", "0");
        if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
        if (debouncedStatus) params.set("status", debouncedStatus);

        const [r1, r2] = await Promise.all([
          authFetch(`/api/v1/admin/beta/registrations?${params.toString()}`),
          authFetch("/api/v1/admin/beta/queries?limit=25"),
        ]);

        if (!r1.ok) {
          const data = await r1.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${r1.status}`);
        }
        if (!r2.ok) {
          const data = await r2.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${r2.status}`);
        }

        const [registrationsData, queriesData] = await Promise.all([
          r1.json(),
          r2.json(),
        ]);

        if (!mountedRef.current) return;
        setRegistrations(registrationsData);
        setLatestQueries(queriesData);
      } catch (err) {
        console.error(err);
        if (!mountedRef.current) return;
        setError(String(err?.message || err));
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [authFetch, authReady, debouncedSearch, debouncedStatus],
  );

  useEffect(() => {
    if (!authReady) return;
    loadRegistrations({ silent: !!registrations });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, debouncedSearch, debouncedStatus, loadRegistrations]);

  useEffect(() => {
    if (!authReady) return;

    const interval = window.setInterval(() => {
      loadRegistrations({ silent: true });
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (isDocumentVisible()) loadRegistrations({ silent: true, force: true });
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authReady, loadRegistrations]);

  const loadNotification = useCallback(
    async (kind) => {
      if (!authReady) return;

      const setter =
        kind === "beta_registration" ? setBetaNotifications : setQueryNotifications;

      setter((p) => ({ ...p, notifyLoading: true, notifyError: null }));

      try {
        const res = await authFetch(`/api/v1/admin/notifications/${kind}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }
        applyNotificationResponse(setter, await res.json());
      } catch (err) {
        console.error(err);
        setter((p) => ({
          ...p,
          notifyLoading: false,
          notifyLoaded: true,
          notifyError: String(err?.message || err),
        }));
      }
    },
    [authFetch, authReady],
  );

  useEffect(() => {
    if (!authReady) return;
    loadNotification("beta_registration");
    loadNotification("query");
  }, [authReady, loadNotification]);

  const saveNotification = useCallback(
    async (kind, overridePayload = null, { silent = false } = {}) => {
      if (!authFetch) return false;
      const setter =
        kind === "beta_registration" ? setBetaNotifications : setQueryNotifications;
      const current =
        kind === "beta_registration" ? betaNotifications : queryNotifications;
      const payload = overridePayload || notificationPayload(current);

      setter((p) => ({ ...p, notifySaving: true, notifyError: null }));

      try {
        const res = await authFetch(`/api/v1/admin/notifications/${kind}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }
        applyNotificationResponse(setter, await res.json());
        if (!silent) showToast && showToast(t("admin.notifySaveSuccess"), "success");
        return true;
      } catch (err) {
        console.error(err);
        setter((p) => ({
          ...p,
          notifySaving: false,
          notifyError: String(err?.message || err),
        }));
        if (!silent) showToast && showToast(t("admin.notifySaveError"), "danger");
        return false;
      }
    },
    [authFetch, betaNotifications, queryNotifications, showToast, t],
  );

  const autoSaveNotification = useCallback(
    (kind, state) => {
      if (!authReady || !state.notifyLoaded || !state.notifyDirty) return undefined;
      const payload = notificationPayload(state);
      const timer = window.setTimeout(() => {
        saveNotification(kind, payload, { silent: true });
      }, NOTIFICATION_AUTOSAVE_MS);
      return () => window.clearTimeout(timer);
    },
    [authReady, saveNotification],
  );

  useEffect(
    () => autoSaveNotification("beta_registration", betaNotifications),
    [autoSaveNotification, betaNotifications],
  );

  useEffect(
    () => autoSaveNotification("query", queryNotifications),
    [autoSaveNotification, queryNotifications],
  );

  const testNotification = useCallback(
    async (kind) => {
      if (!authFetch) return;
      const setter =
        kind === "beta_registration" ? setBetaNotifications : setQueryNotifications;
      const current =
        kind === "beta_registration" ? betaNotifications : queryNotifications;
      const recipients = normalizeRecipients(current.notifyConfig?.recipients || []);

      if (!recipients.length) {
        showToast && showToast(t("admin.betaProgram.selectRecipientsFirst"), "warning");
        return;
      }

      setter((p) => ({ ...p, notificationsTesting: true }));

      try {
        const res = await authFetch(`/api/v1/admin/notifications/${kind}/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        showToast && showToast(t("admin.notificationsTestOk"), "success");
      } catch (err) {
        console.error(err);
        showToast && showToast(t("admin.notificationsTestError"), "danger");
      } finally {
        setter((p) => ({ ...p, notificationsTesting: false }));
      }
    },
    [authFetch, betaNotifications, queryNotifications, showToast, t],
  );

  const setNotificationEnabled = useCallback((kind, nextEnabled) => {
    const setter = kind === "beta_registration" ? setBetaNotifications : setQueryNotifications;
    setter((p) => ({
      ...p,
      notifyDirty: true,
      notifyConfig: { ...p.notifyConfig, enabled: !!nextEnabled },
    }));
  }, []);

  const setNotificationRecipientsText = useCallback((kind, raw) => {
    const setter = kind === "beta_registration" ? setBetaNotifications : setQueryNotifications;
    setter((p) => ({
      ...p,
      notifyDirty: true,
      notifyRecipientsText: raw,
      notifyConfig: {
        ...p.notifyConfig,
        recipients: parseRecipientsText(raw),
      },
    }));
  }, []);

  const updateRegistration = useCallback(
    async (id, payload, options = {}) => {
      if (!authFetch || !id) return null;
      const { silent = false } = options;

      try {
        const res = await authFetch(`/api/v1/admin/beta/registrations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);

        setRegistrations((prev) => {
          if (!prev?.items) return prev;
          return {
            ...prev,
            items: prev.items.map((item) => (item.id === id ? data : item)),
          };
        });

        if (!silent) showToast && showToast(t("admin.betaProgram.updateSuccess"), "success");
        return data;
      } catch (err) {
        console.error(err);
        if (!silent) {
          showToast &&
            showToast(err?.message || t("admin.betaProgram.updateError"), "danger");
        }
        throw err;
      }
    },
    [authFetch, showToast, t],
  );

  const inviteRegistration = useCallback(
    async (id) => {
      if (!authFetch || !id) return null;
      try {
        const res = await authFetch(`/api/v1/admin/beta/registrations/${id}/invite`, {
          method: "POST",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        setRegistrations((prev) => {
          if (!prev?.items) return prev;
          return {
            ...prev,
            items: prev.items.map((item) => (item.id === id ? data : item)),
          };
        });
        showToast && showToast(t("admin.betaProgram.inviteSuccess"), "success");
        return data;
      } catch (err) {
        console.error(err);
        showToast && showToast(err?.message || t("admin.betaProgram.inviteError"), "danger");
        return null;
      }
    },
    [authFetch, showToast, t],
  );

  const deleteRegistration = useCallback(
    async (id) => {
      if (!authFetch || !id) return false;
      try {
        const res = await authFetch(`/api/v1/admin/beta/registrations/${id}`, {
          method: "DELETE",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
        setRegistrations((prev) => {
          if (!prev?.items) return prev;
          return {
            ...prev,
            items: prev.items.filter((item) => item.id !== id),
            stats: {
              ...(prev.stats || {}),
              filtered_total: Math.max(0, Number(prev.stats?.filtered_total || 1) - 1),
              total: Math.max(0, Number(prev.stats?.total || 1) - 1),
            },
          };
        });
        showToast && showToast(t("admin.betaProgram.removeSuccess"), "success");
        return true;
      } catch (err) {
        console.error(err);
        showToast && showToast(err?.message || t("admin.betaProgram.removeError"), "danger");
        return false;
      }
    },
    [authFetch, showToast, t],
  );

  const betaNotify = useMemo(
    () => ({
      ...betaNotifications,
      setNotifyEnabled: (v) => setNotificationEnabled("beta_registration", v),
      setNotifyText: (v) => setNotificationRecipientsText("beta_registration", v),
      saveNotify: () => saveNotification("beta_registration"),
      testNotify: () => testNotification("beta_registration"),
    }),
    [
      betaNotifications,
      saveNotification,
      setNotificationEnabled,
      setNotificationRecipientsText,
      testNotification,
    ],
  );

  const queryNotify = useMemo(
    () => ({
      ...queryNotifications,
      setNotifyEnabled: (v) => setNotificationEnabled("query", v),
      setNotifyText: (v) => setNotificationRecipientsText("query", v),
      saveNotify: () => saveNotification("query"),
      testNotify: () => testNotification("query"),
    }),
    [
      queryNotifications,
      saveNotification,
      setNotificationEnabled,
      setNotificationRecipientsText,
      testNotification,
    ],
  );

  return {
    search,
    setSearch,
    status,
    setStatus,
    statusOptions: STATUS_OPTIONS,
    registrations,
    latestQueries,
    isLoading,
    isRefreshing,
    error,
    reload: () => loadRegistrations({ silent: true, force: true }),
    updateRegistration,
    inviteRegistration,
    deleteRegistration,
    betaNotify,
    queryNotify,
  };
}
