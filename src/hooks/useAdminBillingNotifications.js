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

export function useAdminBillingNotifications(authFetch, showToast, t, enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const [savingEventCode, setSavingEventCode] = useState(null);

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

  const reloadBillingNotifications = useCallback(async ({ signal } = {}) => {
    const af = authFetchRef.current;
    if (!af) return;

    setLoading(true);
    setError(null);

    try {
      const res = await af("/api/v1/admin/billing/notification-settings", {
        method: "GET",
        signal,
      });

      if (signal?.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data?.detail?.code || data?.detail || `HTTP ${res.status}`;
        throw new Error(String(detail));
      }

      const data = await res.json();
      if (signal?.aborted) return;

      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (isAbortLikeError(err) || signal?.aborted) return;

      console.error(err);
      const msg = err?.message || "Failed to load billing notification settings";
      setError(msg);

      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) toast(`${tr("admin.billingNotificationsLoadError")}: ${msg}`, "danger");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || !authFetch) return;

    const controller = new AbortController();
    reloadBillingNotifications({ signal: controller.signal });

    return () => controller.abort();
  }, [enabled, authFetch, reloadBillingNotifications]);

  const updateBillingNotificationSetting = useCallback(
    async (eventCode, enabledValue) => {
      const af = authFetchRef.current;
      const toast = showToastRef.current;
      const tr = tRef.current;
      const code = String(eventCode || "").trim();

      if (!af || !code) return false;

      setSavingEventCode(code);
      setError(null);

      const previousItems = items;
      setItems((prev) =>
        prev.map((row) =>
          row.event_code === code ? { ...row, enabled: Boolean(enabledValue) } : row
        )
      );

      try {
        const res = await af(
          `/api/v1/admin/billing/notification-settings/${encodeURIComponent(code)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: Boolean(enabledValue) }),
          }
        );

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const detail = data?.detail?.code || data?.detail || tr("admin.toastActionError");
          throw new Error(String(detail));
        }

        const updated = data?.item || data;
        if (updated?.event_code) {
          setItems((prev) =>
            prev.map((row) => (row.event_code === updated.event_code ? updated : row))
          );
        } else {
          await reloadBillingNotifications();
        }

        toast && toast(tr("admin.billingNotificationsSaved"), "success");
        return true;
      } catch (err) {
        console.error(err);
        setItems(previousItems);
        const msg = err?.message || tr("admin.toastActionError");
        setError(msg);
        toast && toast(`${tr("admin.billingNotificationsSaveError")}: ${msg}`, "danger");
        return false;
      } finally {
        setSavingEventCode(null);
      }
    },
    [items, reloadBillingNotifications]
  );

  return {
    billingNotificationSettings: items,
    billingNotificationsLoading: loading,
    billingNotificationsError: error,
    billingNotificationsSavingEventCode: savingEventCode,
    reloadBillingNotifications,
    updateBillingNotificationSetting,
  };
}
