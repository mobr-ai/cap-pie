import { useEffect, useState } from "react";

function normalizeRecipientsText(list) {
  return Array.isArray(list) ? list.join("\n") : "";
}

function parseRecipientsText(raw) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export function useAdminNotifications(authFetch, showToast, t) {
  const authReady = !!authFetch;

  // ======================================================
  // NEW USER NOTIFICATIONS
  // ======================================================

  const [newUserConfig, setNewUserConfig] = useState({
    enabled: false,
    recipients: [],
  });
  const [newUserRecipientsText, setNewUserRecipientsText] = useState("");
  const [newUserLoading, setNewUserLoading] = useState(true);
  const [newUserSaving, setNewUserSaving] = useState(false);
  const [newUserError, setNewUserError] = useState(null);
  const [newUserTesting, setNewUserTesting] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function load() {
      setNewUserLoading(true);
      setNewUserError(null);

      try {
        const res = await authFetch("/api/v1/admin/notifications/new_user");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        const recipients = Array.isArray(data.recipients)
          ? data.recipients
          : [];

        setNewUserConfig({ enabled: !!data.enabled, recipients });
        setNewUserRecipientsText(normalizeRecipientsText(recipients));
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setNewUserError(err.message || "Failed to load notification config");
        }
      } finally {
        if (!cancelled) setNewUserLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  const setNewUserEnabled = (enabled) =>
    setNewUserConfig((p) => ({ ...p, enabled }));

  const setNewUserText = (raw) => {
    setNewUserRecipientsText(raw);
    setNewUserConfig((p) => ({
      ...p,
      recipients: parseRecipientsText(raw),
    }));
  };

  const saveNewUser = async () => {
    setNewUserSaving(true);
    setNewUserError(null);

    try {
      const res = await authFetch("/api/v1/admin/notifications/new_user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUserConfig),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];

      setNewUserConfig({ enabled: !!data.enabled, recipients });
      setNewUserRecipientsText(normalizeRecipientsText(recipients));

      showToast && showToast(t("admin.notifySaveSuccess"), "success");
    } catch (err) {
      console.error(err);
      setNewUserError(err.message || "Failed to save notification config");
      showToast && showToast(t("admin.notifySaveError"), "danger");
    } finally {
      setNewUserSaving(false);
    }
  };

  const testNewUser = async () => {
    if (!authFetch) return;

    try {
      setNewUserTesting(true);
      const res = await authFetch("/api/v1/admin/notifications/new_user/test", {
        method: "POST",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast &&
          showToast(
            data?.detail || t("admin.notificationsTestError"),
            "danger",
          );
        return;
      }

      showToast && showToast(t("admin.notificationsTestOk"), "success");
    } catch (err) {
      console.error(err);
      showToast && showToast(t("admin.notificationsTestError"), "danger");
    } finally {
      setNewUserTesting(false);
    }
  };

  // ======================================================
  // WAITLIST NOTIFICATIONS
  // ======================================================

  const [waitlistConfig, setWaitlistConfig] = useState({
    enabled: false,
    recipients: [],
  });
  const [waitlistRecipientsText, setWaitlistRecipientsText] = useState("");
  const [waitlistLoading, setWaitlistLoading] = useState(true);
  const [waitlistSaving, setWaitlistSaving] = useState(false);
  const [waitlistError, setWaitlistError] = useState(null);
  const [waitlistTesting, setWaitlistTesting] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function load() {
      setWaitlistLoading(true);
      setWaitlistError(null);

      try {
        const res = await authFetch("/api/v1/admin/notifications/waitlist");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        const recipients = Array.isArray(data.recipients)
          ? data.recipients
          : [];

        setWaitlistConfig({ enabled: !!data.enabled, recipients });
        setWaitlistRecipientsText(normalizeRecipientsText(recipients));
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setWaitlistError(err.message || "Failed to load waitlist config");
        }
      } finally {
        if (!cancelled) setWaitlistLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  const setWaitlistEnabled = (enabled) =>
    setWaitlistConfig((p) => ({ ...p, enabled }));

  const setWaitlistText = (raw) => {
    setWaitlistRecipientsText(raw);
    setWaitlistConfig((p) => ({
      ...p,
      recipients: parseRecipientsText(raw),
    }));
  };

  const saveWaitlist = async () => {
    setWaitlistSaving(true);
    setWaitlistError(null);

    try {
      const res = await authFetch("/api/v1/admin/notifications/waitlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waitlistConfig),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];

      setWaitlistConfig({ enabled: !!data.enabled, recipients });
      setWaitlistRecipientsText(normalizeRecipientsText(recipients));

      showToast && showToast(t("admin.notifySaveSuccess"), "success");
    } catch (err) {
      console.error(err);
      setWaitlistError(err.message || "Failed to save waitlist config");
      showToast && showToast(t("admin.notifySaveError"), "danger");
    } finally {
      setWaitlistSaving(false);
    }
  };

  const testWaitlist = async () => {
    if (!authFetch) return;

    try {
      setWaitlistTesting(true);
      const res = await authFetch("/api/v1/admin/notifications/waitlist/test", {
        method: "POST",
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast &&
          showToast(
            data?.detail || t("admin.waitlistNotificationsTestError"),
            "danger",
          );
        return;
      }

      showToast && showToast(t("admin.waitlistNotificationsTestOk"), "success");
    } catch (err) {
      console.error(err);
      showToast &&
        showToast(t("admin.waitlistNotificationsTestError"), "danger");
    } finally {
      setWaitlistTesting(false);
    }
  };

  // ======================================================
  // USER CONFIRMED NOTIFICATIONS (NEW)
  // ======================================================

  const [userConfirmedConfig, setUserConfirmedConfig] = useState({
    enabled: false,
    recipients: [],
  });
  const [userConfirmedRecipientsText, setUserConfirmedRecipientsText] =
    useState("");
  const [userConfirmedLoading, setUserConfirmedLoading] = useState(true);
  const [userConfirmedSaving, setUserConfirmedSaving] = useState(false);
  const [userConfirmedError, setUserConfirmedError] = useState(null);
  const [userConfirmedTesting, setUserConfirmedTesting] = useState(false);

  useEffect(() => {
    if (!authReady) return;

    let cancelled = false;

    async function load() {
      setUserConfirmedLoading(true);
      setUserConfirmedError(null);

      try {
        const res = await authFetch(
          "/api/v1/admin/notifications/user_confirmed",
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        const recipients = Array.isArray(data.recipients)
          ? data.recipients
          : [];

        setUserConfirmedConfig({ enabled: !!data.enabled, recipients });
        setUserConfirmedRecipientsText(normalizeRecipientsText(recipients));
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setUserConfirmedError(
            err.message || "Failed to load user-confirmed config",
          );
        }
      } finally {
        if (!cancelled) setUserConfirmedLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  const setUserConfirmedEnabled = (enabled) =>
    setUserConfirmedConfig((p) => ({ ...p, enabled }));

  const setUserConfirmedText = (raw) => {
    setUserConfirmedRecipientsText(raw);
    setUserConfirmedConfig((p) => ({
      ...p,
      recipients: parseRecipientsText(raw),
    }));
  };

  const saveUserConfirmed = async () => {
    setUserConfirmedSaving(true);
    setUserConfirmedError(null);

    try {
      const res = await authFetch(
        "/api/v1/admin/notifications/user_confirmed",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(userConfirmedConfig),
        },
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const recipients = Array.isArray(data.recipients) ? data.recipients : [];

      setUserConfirmedConfig({ enabled: !!data.enabled, recipients });
      setUserConfirmedRecipientsText(normalizeRecipientsText(recipients));

      showToast && showToast(t("admin.notifySaveSuccess"), "success");
    } catch (err) {
      console.error(err);
      setUserConfirmedError(
        err.message || "Failed to save user-confirmed config",
      );
      showToast && showToast(t("admin.notifySaveError"), "danger");
    } finally {
      setUserConfirmedSaving(false);
    }
  };

  const testUserConfirmed = async () => {
    if (!authFetch) return;

    try {
      setUserConfirmedTesting(true);
      const res = await authFetch(
        "/api/v1/admin/notifications/user_confirmed/test",
        { method: "POST" },
      );

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showToast &&
          showToast(
            data?.detail || t("admin.notificationsTestError"),
            "danger",
          );
        return;
      }

      showToast && showToast(t("admin.notificationsTestOk"), "success");
    } catch (err) {
      console.error(err);
      showToast && showToast(t("admin.notificationsTestError"), "danger");
    } finally {
      setUserConfirmedTesting(false);
    }
  };

  // ======================================================
  // Public API
  // ======================================================

  return {
    newUser: {
      notifyConfig: newUserConfig,
      notifyRecipientsText: newUserRecipientsText,
      notifyLoading: newUserLoading,
      notifySaving: newUserSaving,
      notifyError: newUserError,
      notificationsTesting: newUserTesting,
      setNotifyEnabled: setNewUserEnabled,
      setNotifyText: setNewUserText,
      saveNotify: saveNewUser,
      testNotify: testNewUser,
    },

    waitlist: {
      notifyConfig: waitlistConfig,
      notifyRecipientsText: waitlistRecipientsText,
      notifyLoading: waitlistLoading,
      notifySaving: waitlistSaving,
      notifyError: waitlistError,
      notificationsTesting: waitlistTesting,
      setNotifyEnabled: setWaitlistEnabled,
      setNotifyText: setWaitlistText,
      saveNotify: saveWaitlist,
      testNotify: testWaitlist,
    },

    userConfirmed: {
      notifyConfig: userConfirmedConfig,
      notifyRecipientsText: userConfirmedRecipientsText,
      notifyLoading: userConfirmedLoading,
      notifySaving: userConfirmedSaving,
      notifyError: userConfirmedError,
      notificationsTesting: userConfirmedTesting,
      setNotifyEnabled: setUserConfirmedEnabled,
      setNotifyText: setUserConfirmedText,
      saveNotify: saveUserConfirmed,
      testNotify: testUserConfirmed,
    },
  };
}
