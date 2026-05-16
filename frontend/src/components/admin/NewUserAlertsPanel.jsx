import React, { useMemo, useState, useId } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function normalizeEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

function uniq(list) {
  const out = [];
  const seen = new Set();
  for (const x of list || []) {
    const v = normalizeEmail(x);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function parseRecipients(text) {
  return uniq(
    String(text || "")
      .split(/\r?\n/g)
      .map((x) => normalizeEmail(x))
      .filter(Boolean),
  );
}

function formatRecipients(list) {
  return uniq(list).join("\n");
}

export function NewUserAlertsPanel({
  t,
  notifyConfig,
  notifyRecipientsText,
  notifyLoading,
  notifySaving,
  notifyError,
  notificationsTesting,
  setNotifyEnabled,
  setNotifyText,
  saveNotify,
  testNotify,

  // NEW: shared pool
  recipientPool,
  setRecipientPool,
}) {
  const uid = typeof useId === "function" ? useId() : "new-user-alerts";
  const enabledId = `adminNotifyEnabled-${uid}`;

  const busy = !!(notifyLoading || notifySaving);

  const selected = useMemo(
    () => parseRecipients(notifyRecipientsText),
    [notifyRecipientsText],
  );

  const pool = useMemo(() => uniq(recipientPool || []), [recipientPool]);

  const [addEmail, setAddEmail] = useState("");

  const handleToggle = (e) => setNotifyEnabled(e.target.checked);

  const toggleRecipient = (email) => {
    const v = normalizeEmail(email);
    const has = selected.includes(v);
    const next = has ? selected.filter((x) => x !== v) : uniq([...selected, v]);
    setNotifyText(formatRecipients(next));
  };

  const addToPoolAndSelect = () => {
    const email = normalizeEmail(addEmail);
    if (!email || !EMAIL_RE.test(email)) return;

    const nextPool = uniq([...pool, email]);
    setRecipientPool(nextPool);

    const nextSelected = uniq([...selected, email]);
    setNotifyText(formatRecipients(nextSelected));
    setAddEmail("");
  };

  const onAddKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addToPoolAndSelect();
    }
  };

  const invalidSelectedCount = useMemo(() => {
    return selected.filter((e) => !EMAIL_RE.test(e)).length;
  }, [selected]);

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">{t("admin.notifySectionTitle")}</h2>
        <p className="admin-section-subtitle">
          {t("admin.notifySectionSubtitle")}
        </p>
      </div>

      <div className="admin-notify-card">
        <div className="admin-notify-row">
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              id={enabledId}
              checked={!!notifyConfig?.enabled}
              onChange={handleToggle}
              disabled={busy}
            />
            <label className="form-check-label" htmlFor={enabledId}>
              {t("admin.notifyToggleLabel")}
            </label>
          </div>
        </div>

        <div className="admin-notify-row admin-notify-row--textarea">
          <label className="form-label">
            {t("admin.notifyRecipientsLabel")}
          </label>

          {/* Add to pool */}
          <div className="d-flex gap-2 align-items-center">
            <input
              type="email"
              className="form-control"
              placeholder={t("admin.alertRecipientsPoolPlaceholder")}
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              onKeyDown={onAddKeyDown}
              disabled={busy}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={addToPoolAndSelect}
              disabled={busy || !EMAIL_RE.test(normalizeEmail(addEmail))}
            >
              {t("admin.add")}
            </button>
          </div>

          {/* Multi-select list (pool) */}
          <div className="mt-3">
            {pool.length === 0 ? (
              <small className="d-block">
                {t("admin.alertRecipientsPoolEmpty")}
              </small>
            ) : (
              <div className="d-flex flex-column gap-2">
                {pool.map((email) => {
                  const checked = selected.includes(email);
                  return (
                    <label
                      key={email}
                      className="d-flex align-items-center gap-2"
                      style={{ userSelect: "none" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(email)}
                        disabled={busy}
                      />
                      <span style={{ color: "#e5e7eb" }}>{email}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <small className="d-block mt-2">
            {t("admin.notifyRecipientsHelp")}
          </small>

          {invalidSelectedCount > 0 && (
            <p
              className="admin-status-text admin-status-text--error"
              style={{ marginTop: "0.5rem", marginBottom: 0 }}
            >
              {t("admin.notifyRecipientsInvalid", {
                count: invalidSelectedCount,
              })}
            </p>
          )}
        </div>

        {notifyError && (
          <p className="admin-status-text admin-status-text--error mt-2">
            {notifyError}
          </p>
        )}

        <div className="admin-notify-footer">
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={testNotify}
            disabled={busy || notificationsTesting}
          >
            {notificationsTesting
              ? t("admin.notificationsTesting")
              : t("admin.notificationsSendTest")}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={saveNotify}
            disabled={busy}
          >
            {notifySaving
              ? t("admin.notifySaving")
              : t("admin.notifySaveButton")}
          </button>
        </div>
      </div>
    </section>
  );
}
