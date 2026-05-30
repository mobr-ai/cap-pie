import React, { useMemo } from "react";

const EVENT_ORDER = [
  "payment_session_created",
  "payment_confirmed",
  "payment_failed",
  "balance_credited",
  "premium_activated",
  "premium_extended",
  "support_contribution_confirmed",
  "auto_renew_enabled",
  "auto_renew_disabled",
  "auto_renew_succeeded",
  "auto_renew_failed",
  "admin_premium_granted",
  "admin_premium_revoked",
  "admin_balance_adjusted",
];

const EVENT_GROUPS = {
  payment_session_created: "payment",
  payment_confirmed: "payment",
  payment_failed: "payment",
  balance_credited: "payment",
  premium_activated: "premium",
  premium_extended: "premium",
  support_contribution_confirmed: "support",
  auto_renew_enabled: "autoRenewal",
  auto_renew_disabled: "autoRenewal",
  auto_renew_succeeded: "autoRenewal",
  auto_renew_failed: "autoRenewal",
  admin_premium_granted: "adminActions",
  admin_premium_revoked: "adminActions",
  admin_balance_adjusted: "adminActions",
};

function eventTitle(t, eventCode) {
  const key = `admin.billingNotificationEvents.${eventCode}.title`;
  const value = t(key);
  return value === key ? eventCode : value;
}

function eventDescription(t, eventCode, fallback) {
  const key = `admin.billingNotificationEvents.${eventCode}.description`;
  const value = t(key);
  return value === key ? fallback || eventCode : value;
}

function groupLabel(t, group) {
  const key = `admin.billingNotificationGroups.${group}`;
  const value = t(key);
  return value === key ? group : value;
}

export function BillingNotificationSettings({
  t,
  billingNotificationSettings,
  billingNotificationsLoading,
  billingNotificationsError,
  billingNotificationsSavingEventCode,
  updateBillingNotificationSetting,
}) {
  const rows = useMemo(() => {
    const list = Array.isArray(billingNotificationSettings)
      ? billingNotificationSettings
      : [];
    const order = new Map(EVENT_ORDER.map((code, index) => [code, index]));

    return [...list].sort((a, b) => {
      const aOrder = order.has(a.event_code) ? order.get(a.event_code) : 999;
      const bOrder = order.has(b.event_code) ? order.get(b.event_code) : 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.event_code || "").localeCompare(String(b.event_code || ""));
    });
  }, [billingNotificationSettings]);

  return (
    <section className="admin-section billing-notification-settings">
      <div className="admin-section-header admin-section-header--compact billing-notification-header">
        <div>
          <h2 className="admin-section-title">
            {t("admin.billingNotificationsTitle")}
          </h2>
          <p className="admin-section-subtitle">
            {t("admin.billingNotificationsSubtitle")}
          </p>
        </div>
      </div>

      {billingNotificationsLoading && (
        <p className="admin-status-text">
          {t("admin.billingNotificationsLoading")}
        </p>
      )}

      {billingNotificationsError && (
        <p className="admin-status-text admin-status-text--error">
          {billingNotificationsError}
        </p>
      )}

      {!billingNotificationsLoading && rows.length === 0 && !billingNotificationsError && (
        <p className="admin-status-text">
          {t("admin.billingNotificationsEmpty")}
        </p>
      )}

      {!billingNotificationsLoading && rows.length > 0 && (
        <div className="billing-notification-list" role="list">
          {rows.map((row) => {
            const group = EVENT_GROUPS[row.event_code] || "other";
            const saving = billingNotificationsSavingEventCode === row.event_code;
            const inputId = `billing-notification-${row.event_code}`;

            return (
              <div
                key={`${row.event_code}:${row.audience}:${row.channel}`}
                className={
                  row.enabled
                    ? "billing-notification-row billing-notification-row--enabled"
                    : "billing-notification-row"
                }
                role="listitem"
              >
                <div className="billing-notification-row-meta">
                  <span className="billing-notification-row-kicker">
                    {groupLabel(t, group)} · {String(row.channel || "email").toUpperCase()}
                  </span>
                  <strong className="billing-notification-row-title">
                    {eventTitle(t, row.event_code)}
                  </strong>
                </div>

                <p className="billing-notification-row-description">
                  {eventDescription(t, row.event_code, row.description)}
                </p>

                <label className="billing-notification-toggle" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={Boolean(row.enabled)}
                    disabled={saving}
                    onChange={(e) =>
                      updateBillingNotificationSetting(row.event_code, e.target.checked)
                    }
                  />
                  <span className="billing-notification-toggle-track" aria-hidden="true">
                    <span className="billing-notification-toggle-thumb" />
                  </span>
                  <span className="billing-notification-toggle-label">
                    {row.enabled
                      ? t("admin.billingNotificationsOn")
                      : t("admin.billingNotificationsOff")}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
