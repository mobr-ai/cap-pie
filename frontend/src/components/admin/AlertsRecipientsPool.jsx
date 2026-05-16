import React, { useMemo, useState, useEffect } from "react";

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

function parseRecipientsText(text) {
  return uniq(
    String(text || "")
      .split(/\r?\n/g)
      .map((x) => normalizeEmail(x))
      .filter(Boolean),
  );
}

function arraysEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function AlertsRecipientsPool({ t, value, onChange, disabled }) {
  const [quickAdd, setQuickAdd] = useState("");

  const recipients = useMemo(() => uniq(value || []), [value]);

  // Auto-normalize “on save” (i.e., whenever value changes, keep it canonical)
  useEffect(() => {
    const normalized = uniq(value || []);
    if (!arraysEqual(normalized, value || [])) {
      onChange(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalidCount = useMemo(() => {
    return recipients.filter((e) => !EMAIL_RE.test(e)).length;
  }, [recipients]);

  const addRecipient = (raw) => {
    const email = normalizeEmail(raw);
    if (!email) return;
    const next = uniq([...(recipients || []), email]);
    onChange(next);
  };

  const removeRecipient = (email) => {
    const target = normalizeEmail(email);
    onChange(recipients.filter((r) => r !== target));
  };

  const onQuickAddKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addRecipient(quickAdd);
      setQuickAdd("");
    }
  };

  // Auto-normalize on blur: if user typed something, commit it on blur.
  const onQuickAddBlur = () => {
    const raw = quickAdd;
    const email = normalizeEmail(raw);
    if (!email) {
      setQuickAdd("");
      return;
    }
    if (EMAIL_RE.test(email)) addRecipient(email);

    setQuickAdd("");
  };

  const bulkText = useMemo(() => recipients.join("\n"), [recipients]);

  const onBulkChange = (e) => {
    onChange(parseRecipientsText(e.target.value));
  };

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          {t("admin.alertRecipientsPoolTitle")}
        </h2>
        <p className="admin-section-subtitle">
          {t("admin.alertRecipientsPoolSubtitle")}
        </p>
      </div>

      <div className="admin-notify-card">
        <div className="admin-notify-row admin-notify-row--textarea">
          <label className="form-label" htmlFor="alertsRecipientsPoolQuickAdd">
            {t("admin.alertRecipientsPoolLabel")}
          </label>

          <div className="d-flex gap-2 align-items-center">
            <input
              id="alertsRecipientsPoolQuickAdd"
              type="email"
              className="form-control"
              placeholder={t("admin.alertRecipientsPoolPlaceholder")}
              value={quickAdd}
              onChange={(e) => setQuickAdd(e.target.value)}
              onKeyDown={onQuickAddKeyDown}
              onBlur={onQuickAddBlur}
              disabled={disabled}
              autoComplete="off"
            />
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => {
                addRecipient(quickAdd);
                setQuickAdd("");
              }}
              disabled={disabled || !normalizeEmail(quickAdd)}
            >
              {t("admin.add")}
            </button>
          </div>

          {recipients.length > 0 && (
            <div className="mt-2 d-flex flex-wrap gap-2">
              {recipients.map((email) => (
                <span
                  key={email}
                  className="badge rounded-pill"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(148,163,184,0.25)",
                    color: "#e5e7eb",
                    padding: "0.35rem 0.55rem",
                    fontWeight: 500,
                  }}
                >
                  <span style={{ marginRight: "0.45rem" }}>{email}</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => removeRecipient(email)}
                    disabled={disabled}
                    aria-label={`Remove ${email}`}
                    style={{
                      padding: 0,
                      lineHeight: 1,
                      color: "#9ca3af",
                      background: "transparent",
                      border: "none",
                    }}
                    title={t("admin.remove")}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <small className="d-block mt-2">
            {t("admin.alertRecipientsPoolHelp")}
          </small>

          <div className="mt-3">
            <textarea
              className="form-control admin-notify-textarea"
              rows={3}
              value={bulkText}
              onChange={onBulkChange}
              disabled={disabled}
              placeholder={t("admin.alertRecipientsPoolBulkPlaceholder")}
            />
          </div>

          {invalidCount > 0 && (
            <p
              className="admin-status-text admin-status-text--error"
              style={{ marginTop: "0.5rem", marginBottom: 0 }}
            >
              {t("admin.notifyRecipientsInvalid", { count: invalidCount })}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
