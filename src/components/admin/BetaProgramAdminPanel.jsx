// src/components/admin/BetaProgramAdminPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faEnvelope,
  faRotateRight,
  faSpinner,
  faTrash,
  faUserCheck,
} from "@fortawesome/free-solid-svg-icons";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const REGISTRATION_AUTOSAVE_MS = 850;

function normalizeEmail(s) {
  return String(s || "").trim().toLowerCase();
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

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function fmtMs(v) {
  const n = Number(v || 0);
  if (!n) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

function BillingStyleToggle({ checked, disabled, onChange, t }) {
  return (
    <label className="billing-notification-toggle admin-beta-billing-toggle">
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="billing-notification-toggle-track" aria-hidden="true">
        <span className="billing-notification-toggle-thumb" />
      </span>
      <span className="billing-notification-toggle-label">
        {checked ? t("admin.on") : t("admin.off")}
      </span>
    </label>
  );
}

function NotificationCard({
  t,
  title,
  subtitle,
  state,
  recipientPool,
  setRecipientPool,
}) {
  const busy = !!(state.notifyLoading || state.notifySaving);
  const selected = useMemo(
    () => parseRecipients(state.notifyRecipientsText),
    [state.notifyRecipientsText],
  );
  const pool = useMemo(() => uniq(recipientPool || []), [recipientPool]);
  const [addEmail, setAddEmail] = useState("");

  const addToPoolAndSelect = () => {
    const email = normalizeEmail(addEmail);
    if (!email || !EMAIL_RE.test(email)) return;
    const nextPool = uniq([...pool, email]);
    setRecipientPool(nextPool);
    state.setNotifyText(formatRecipients(uniq([...selected, email])));
    setAddEmail("");
  };

  const toggleRecipient = (email) => {
    const v = normalizeEmail(email);
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : uniq([...selected, v]);
    state.setNotifyText(formatRecipients(next));
  };

  return (
    <div className="admin-beta-notify-card">
      <div className="admin-beta-notify-head">
        <div>
          <div className="admin-beta-notify-title">{title}</div>
          <div className="admin-beta-notify-subtitle">{subtitle}</div>
        </div>
        <BillingStyleToggle
          checked={!!state.notifyConfig?.enabled}
          disabled={busy}
          onChange={state.setNotifyEnabled}
          t={t}
        />
      </div>

      <div className="admin-beta-recipient-adder">
        <input
          type="email"
          className="form-control form-control-sm"
          placeholder={t("admin.alertRecipientsPoolPlaceholder")}
          value={addEmail}
          onChange={(e) => setAddEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addToPoolAndSelect();
            }
          }}
          disabled={busy}
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

      <div className="admin-beta-recipient-list">
        {pool.length === 0 ? (
          <small>{t("admin.alertRecipientsPoolEmpty")}</small>
        ) : (
          pool.map((email) => (
            <label key={email} className="admin-beta-recipient-row">
              <input
                type="checkbox"
                checked={selected.includes(email)}
                onChange={() => toggleRecipient(email)}
                disabled={busy}
              />
              <span>{email}</span>
            </label>
          ))
        )}
      </div>

      {state.notifyError ? (
        <p className="admin-status-text admin-status-text--error mt-2">
          {state.notifyError}
        </p>
      ) : null}

      <div className="admin-beta-notify-actions">
        <span className="admin-beta-autosave-hint">
          {state.notifySaving
            ? t("admin.betaProgram.saving")
            : t("admin.betaProgram.autoSaved")}
        </span>
        <button
          className="btn btn-sm btn-outline-secondary"
          onClick={state.testNotify}
          disabled={busy || state.notificationsTesting || selected.length === 0}
          title={
            selected.length === 0
              ? t("admin.betaProgram.selectRecipientsFirst")
              : undefined
          }
        >
          {state.notificationsTesting
            ? t("admin.notificationsTesting")
            : t("admin.notificationsSendTest")}
        </button>
      </div>
    </div>
  );
}

function RegistrationRow({
  t,
  item,
  statusOptions,
  onSave,
  onInvite,
  onRemove,
}) {
  const [status, setStatus] = useState(item.status || "new");
  const [notes, setNotes] = useState(item.admin_notes || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [actionBusy, setActionBusy] = useState("");
  const initializedRef = useRef(false);

  useEffect(() => {
    setStatus(item.status || "new");
    setNotes(item.admin_notes || "");
    initializedRef.current = false;
  }, [item.id, item.status, item.admin_notes]);

  useEffect(() => {
    const dirty =
      status !== (item.status || "new") || notes !== (item.admin_notes || "");

    if (!initializedRef.current) {
      initializedRef.current = true;
      return undefined;
    }
    if (!dirty) return undefined;

    const timer = window.setTimeout(async () => {
      setSaving(true);
      setSaveError("");
      try {
        await onSave(item.id, { status, admin_notes: notes }, { silent: true });
      } catch (err) {
        setSaveError(String(err?.message || err));
      } finally {
        setSaving(false);
      }
    }, REGISTRATION_AUTOSAVE_MS);

    return () => window.clearTimeout(timer);
  }, [item.id, item.status, item.admin_notes, notes, onSave, status]);

  const runAction = async (key, fn) => {
    if (actionBusy) return;

    setActionBusy(key);
    setSaveError("");

    try {
      await fn();
    } catch (err) {
      setSaveError(String(err?.message || err));
    } finally {
      setActionBusy("");
    }
  };

  const markStatus = (nextStatus) => {
    runAction(nextStatus, async () => {
      setStatus(nextStatus);
      await onSave(
        item.id,
        { status: nextStatus, admin_notes: notes },
        { silent: true },
      );
    });
  };

  const invite = () => {
    runAction("invite", () => onInvite(item.id));
  };

  const remove = () => {
    if (!window.confirm(t("admin.betaProgram.removeConfirm", { email: item.email }))) {
      return;
    }

    runAction("remove", () => onRemove(item.id));
  };

  const icon = (key, faIcon) => (
    <FontAwesomeIcon
      icon={actionBusy === key ? faSpinner : faIcon}
      spin={actionBusy === key}
    />
  );

  return (
    <tr>
      <td className="admin-users-actions-col admin-users-actions-cell admin-beta-actions-cell">
        <div className="admin-user-actions admin-beta-row-icon-actions">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary admin-user-action-btn"
            title={t("admin.betaProgram.invite")}
            aria-label={t("admin.betaProgram.invite")}
            disabled={!!actionBusy}
            onClick={invite}
          >
            {icon("invite", faEnvelope)}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary admin-user-action-btn"
            title={t("admin.betaProgram.markReviewing")}
            aria-label={t("admin.betaProgram.markReviewing")}
            disabled={!!actionBusy || status === "reviewing"}
            onClick={() => markStatus("reviewing")}
          >
            {icon("reviewing", faRotateRight)}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary admin-user-action-btn"
            title={t("admin.betaProgram.markAccepted")}
            aria-label={t("admin.betaProgram.markAccepted")}
            disabled={!!actionBusy || status === "accepted"}
            onClick={() => markStatus("accepted")}
          >
            {icon("accepted", faUserCheck)}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-danger admin-user-action-btn"
            title={t("admin.betaProgram.remove")}
            aria-label={t("admin.betaProgram.remove")}
            disabled={!!actionBusy}
            onClick={remove}
          >
            {icon("remove", faTrash)}
          </button>
        </div>
      </td>

      <td>
        <div className="admin-beta-primary">{item.email}</div>
        <div className="admin-beta-muted">{item.full_name || "—"}</div>
      </td>
      <td>
        <div>{item.role || "—"}</div>
        <div className="admin-beta-muted">{item.organization || "—"}</div>
      </td>
      <td className="admin-beta-usecase">{item.use_case || "—"}</td>
      <td>
        {item.user_id ? (
          <>
            <div className="admin-beta-primary">#{item.user_id}</div>
            <div className="admin-beta-muted">
              {item.username || item.user_email || "linked"}
            </div>
          </>
        ) : (
          <span className="admin-beta-muted">{t("admin.betaProgram.noAccount")}</span>
        )}
      </td>
      <td>
        <div>{item.query_count || 0}</div>
        <div className="admin-beta-muted">{fmtDate(item.last_query_at)}</div>
      </td>
      <td>
        <select
          className="form-select form-select-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={saving || !!actionBusy}
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {t(`admin.betaProgram.status.${s}`)}
            </option>
          ))}
        </select>
        <textarea
          className="form-control form-control-sm admin-beta-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("admin.betaProgram.notesPlaceholder")}
          rows={2}
          disabled={saving || !!actionBusy}
        />
        <div className="admin-beta-row-status">
          {saving ? t("admin.betaProgram.saving") : t("admin.betaProgram.autoSaved")}
          {saveError ? <span className="admin-status-text--error"> · {saveError}</span> : null}
        </div>
      </td>
      <td>
        <div>{item.source || "—"}</div>
        <div className="admin-beta-muted">{fmtDate(item.created_at)}</div>
      </td>
    </tr>
  );
}


export function BetaProgramAdminPanel({
  t,
  betaProgram,
  recipientPool,
  setRecipientPool,
  onOpenQuery,
}) {
  const stats = betaProgram.registrations?.stats || {};
  const byStatus = stats.by_status || {};
  const items = betaProgram.registrations?.items || [];
  const latestQueries = betaProgram.latestQueries?.queries || [];

  const cards = [
    {
      key: "total",
      label: t("admin.betaProgram.totalRegistrations"),
      value: stats.total ?? "—",
      caption: `${t("admin.betaProgram.filtered")}: ${stats.filtered_total ?? "—"}`,
    },
    {
      key: "new",
      label: t("admin.betaProgram.newReviewing"),
      value: `${byStatus.new || 0} / ${byStatus.reviewing || 0}`,
      caption: t("admin.betaProgram.newReviewingCaption"),
    },
    {
      key: "linked",
      label: t("admin.betaProgram.linkedUsers"),
      value: stats.linked_users ?? "—",
      caption: `${t("admin.betaProgram.withActivity")}: ${stats.with_activity ?? 0}`,
    },
    {
      key: "queries",
      label: t("admin.betaProgram.betaQueries"),
      value: stats.query_total ?? "—",
      caption: t("admin.betaProgram.betaQueriesCaption"),
    },
  ];

  return (
    <>
      <section className="admin-section admin-beta-hero-section">
        <div className="admin-section-header">
          <div>
            <div className="admin-section-title">{t("admin.betaProgram.title")}</div>
            <div className="admin-section-subtitle">
              {t("admin.betaProgram.subtitle")}
            </div>
          </div>
          {betaProgram.isRefreshing ? (
            <span className="admin-beta-refresh-pulse" aria-label={t("admin.loading")} />
          ) : null}
        </div>

        {betaProgram.error ? (
          <div className="admin-stat-error">{betaProgram.error}</div>
        ) : null}

        <div className="admin-stat-grid">
          {cards.map((c) => (
            <div key={c.key} className="admin-stat-card admin-beta-stat-card">
              <div className="admin-stat-label">{c.label}</div>
              <div className="admin-stat-value">
                {betaProgram.isLoading ? "…" : c.value}
              </div>
              <div className="admin-stat-caption">
                {betaProgram.isLoading ? "" : c.caption}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-section admin-section--table admin-beta-table-section">
        <div className="admin-section-header admin-section-header--compact">
          <div>
            <div className="admin-section-title">
              {t("admin.betaProgram.registrationsTitle")}
            </div>
            <div className="admin-section-subtitle">
              {t("admin.betaProgram.registrationsSubtitle")}
            </div>
          </div>
        </div>

        <div className="admin-beta-filters">
          <input
            className="form-control form-control-sm"
            value={betaProgram.search}
            onChange={(e) => betaProgram.setSearch(e.target.value)}
            placeholder={t("admin.betaProgram.searchPlaceholder")}
          />
          <select
            className="form-select form-select-sm"
            value={betaProgram.status}
            onChange={(e) => betaProgram.setStatus(e.target.value)}
          >
            <option value="">{t("admin.betaProgram.allStatuses")}</option>
            {betaProgram.statusOptions.map((s) => (
              <option key={s} value={s}>
                {t(`admin.betaProgram.status.${s}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-table-wrapper admin-beta-table-wrapper">
          <table className="table table-sm table-dark table-striped align-middle admin-users-table admin-beta-table admin-beta-registration-table">
            <thead>
              <tr>
                <th className="admin-users-actions-col">{t("admin.colActions")}</th>
                <th>{t("admin.betaProgram.person")}</th>
                <th>{t("admin.betaProgram.profile")}</th>
                <th>{t("admin.betaProgram.useCase")}</th>
                <th>{t("admin.betaProgram.account")}</th>
                <th>{t("admin.betaProgram.activity")}</th>
                <th>{t("admin.betaProgram.statusAndNotes")}</th>
                <th>{t("admin.betaProgram.source")}</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item) => (
                  <RegistrationRow
                    key={item.id}
                    t={t}
                    item={item}
                    statusOptions={betaProgram.statusOptions}
                    onSave={betaProgram.updateRegistration}
                    onInvite={betaProgram.inviteRegistration}
                    onRemove={betaProgram.deleteRegistration}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={8}>{t("admin.betaProgram.noRegistrations")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section admin-section--table admin-beta-table-section">
        <div className="admin-section-header admin-section-header--compact">
          <div>
            <div className="admin-section-title">
              {t("admin.betaProgram.latestQueriesTitle")}
            </div>
            <div className="admin-section-subtitle">
              {t("admin.betaProgram.latestQueriesSubtitle")}
            </div>
          </div>
        </div>

        <div className="admin-table-wrapper admin-beta-table-wrapper">
          <table className="table table-sm table-dark table-striped align-middle admin-users-table admin-beta-query-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>{t("admin.betaProgram.person")}</th>
                <th>{t("admin.betaProgram.query")}</th>
                <th>{t("admin.betaProgram.language")}</th>
                <th>{t("admin.betaProgram.ok")}</th>
                <th>{t("admin.betaProgram.totalLatency")}</th>
                <th>{t("admin.betaProgram.createdAt")}</th>
              </tr>
            </thead>
            <tbody>
              {latestQueries.length ? (
                latestQueries.map((q) => (
                  <tr
                    key={q.id}
                    className={onOpenQuery ? "admin-recentq-row" : ""}
                    onClick={() => onOpenQuery?.(q)}
                    style={{ cursor: onOpenQuery ? "pointer" : "default" }}
                  >
                    <td>{q.id}</td>
                    <td>
                      <div className="admin-beta-primary">
                        {q.beta_email || q.user_email || "—"}
                      </div>
                      <div className="admin-beta-muted">
                        {q.beta_name || q.username || "—"}
                      </div>
                    </td>
                    <td className="admin-beta-query-cell">{q.nl_query}</td>
                    <td>{q.language || "—"}</td>
                    <td>{q.succeeded ? t("admin.yes") : t("admin.no")}</td>
                    <td>{fmtMs(q.total_latency_ms)}</td>
                    <td>{fmtDate(q.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>{t("admin.betaProgram.noQueries")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-section admin-beta-notifications-section">
        <div className="admin-section-header">
          <div>
            <div className="admin-section-title">
              {t("admin.betaProgram.notificationsTitle")}
            </div>
            <div className="admin-section-subtitle">
              {t("admin.betaProgram.notificationsSubtitle")}
            </div>
          </div>
        </div>

        <div className="admin-beta-notify-grid">
          <NotificationCard
            t={t}
            title={t("admin.betaProgram.betaRegistrationNotifications")}
            subtitle={t("admin.betaProgram.betaRegistrationNotificationsHelp")}
            state={betaProgram.betaNotify}
            recipientPool={recipientPool}
            setRecipientPool={setRecipientPool}
          />
          <NotificationCard
            t={t}
            title={t("admin.betaProgram.queryNotifications")}
            subtitle={t("admin.betaProgram.queryNotificationsHelp")}
            state={betaProgram.queryNotify}
            recipientPool={recipientPool}
            setRecipientPool={setRecipientPool}
          />
        </div>
      </section>
    </>
  );
}
