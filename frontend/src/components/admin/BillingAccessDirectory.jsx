import { formatBillingAmountFromMajor } from "../../billing/currency";
import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBan,
  faCoins,
  faCrown,
  faRedoAlt,
} from "@fortawesome/free-solid-svg-icons";

function formatAda(value) {
  return formatBillingAmountFromMajor(value, { currency: "lovelace" });
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function shorten(value, head = 10, tail = 6) {
  const s = String(value || "");
  if (!s) return "—";
  if (s.length <= head + tail + 3) return s;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

function userLabel(row) {
  return row?.email || row?.username || row?.display_name || `#${row?.user_id || ""}`;
}

function BillingActionModal({
  t,
  action,
  row,
  onClose,
  grantPremium,
  revokePremium,
  resetFreeQuota,
  adjustBalance,
}) {
  const [days, setDays] = useState("30");
  const [amountAda, setAmountAda] = useState("1");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const config = useMemo(() => {
    if (action === "grantPremium") {
      return {
        title: t("admin.billingActionGrantPremium"),
        body: t("admin.billingGrantPremiumModalBody"),
        confirm: t("admin.billingConfirmGrantPremium"),
        variant: "success",
      };
    }

    if (action === "revokePremium") {
      return {
        title: t("admin.billingActionRevokePremium"),
        body: t("admin.billingRevokePremiumModalBody"),
        confirm: t("admin.billingConfirmAction"),
        variant: "warning",
      };
    }

    if (action === "resetQuota") {
      return {
        title: t("admin.billingActionResetQuota"),
        body: t("admin.billingResetQuotaModalBody"),
        confirm: t("admin.billingConfirmAction"),
        variant: "info",
      };
    }

    return {
      title: t("admin.billingActionAdjustBalance"),
      body: t("admin.billingAdjustBalanceModalBody"),
      confirm: t("admin.billingConfirmAction"),
      variant: "light",
    };
  }, [action, t]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !submitting) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  if (!action || !row) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);

    let ok = false;

    if (action === "grantPremium") {
      const safeDays = Number.parseInt(days, 10);
      if (!Number.isFinite(safeDays) || safeDays < 1) {
        setSubmitting(false);
        return;
      }
      ok = await grantPremium(row, { days: safeDays, note });
    } else if (action === "revokePremium") {
      ok = await revokePremium(row, { note });
    } else if (action === "resetQuota") {
      ok = await resetFreeQuota(row, { note });
    } else if (action === "adjustBalance") {
      const ada = Number.parseFloat(String(amountAda || "").replace(",", "."));
      if (!Number.isFinite(ada) || ada === 0) {
        setSubmitting(false);
        return;
      }
      ok = await adjustBalance(row, { amountAda: ada, note });
    }

    setSubmitting(false);

    if (ok) onClose();
  };

  return (
    <div className="uq-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form
        className="uq-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-action-title"
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="uq-modal-header">
          <h3 id="billing-action-title">{config.title}</h3>
          <button
            type="button"
            className="uq-modal-close"
            aria-label={t("common.close")}
            disabled={submitting}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="uq-tabpanel">
          <div className="uq-modal-section">
            <label>{t("admin.billingSelectedUser")}</label>
            <div className="uq-modal-query">
              {userLabel(row)}
              <br />
              #{row.user_id}
            </div>
          </div>

          <div className="uq-modal-section mt-3">
            <label>{t("admin.billingActionDetails")}</label>
            <div className="uq-modal-query">{config.body}</div>
          </div>

          {action === "grantPremium" && (
            <div className="uq-modal-section mt-3">
              <label htmlFor="billing-premium-days">
                {t("admin.billingPremiumDaysLabel")}
              </label>
              <input
                id="billing-premium-days"
                className="form-control"
                type="number"
                min="1"
                max="3650"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {action === "adjustBalance" && (
            <div className="uq-modal-section mt-3">
              <label htmlFor="billing-balance-amount">
                {t("admin.billingBalanceAdaLabel")}
              </label>
              <input
                id="billing-balance-amount"
                className="form-control"
                type="number"
                step="0.000001"
                value={amountAda}
                onChange={(e) => setAmountAda(e.target.value)}
                autoFocus
              />
              <div className="admin-section-subtitle mt-2">
                {t("admin.billingBalanceAdaHelp")}
              </div>
            </div>
          )}

          <div className="uq-modal-section mt-3">
            <label htmlFor="billing-action-note">
              {t("admin.billingNoteLabel")}
            </label>
            <textarea
              id="billing-action-note"
              className="form-control"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("admin.billingNotePlaceholder")}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline-secondary"
            disabled={submitting}
            onClick={onClose}
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className={`btn btn-${config.variant}`}
            disabled={submitting}
          >
            {submitting ? t("admin.billingSubmitting") : config.confirm}
          </button>
        </div>
      </form>
    </div>
  );
}

export function BillingAccessDirectory({
  t,
  billingStats,
  billingLoading,
  billingError,
  billingSearch,
  setBillingSearch,
  sortedBillingUsers,
  billingSortField,
  billingSortDirection,
  handleBillingSort,
  grantPremium,
  revokePremium,
  resetFreeQuota,
  adjustBalance,
}) {
  const [modalState, setModalState] = useState({ action: null, row: null });

  const onSearchChange = (e) => setBillingSearch(e.target.value);

  const renderSortIcon = (field) => {
    if (billingSortField !== field) return <span className="admin-sort-icon">⇅</span>;
    return (
      <span className="admin-sort-icon">
        {billingSortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const openAction = (action, row) => {
    setModalState({ action, row });
  };

  const closeAction = () => {
    setModalState({ action: null, row: null });
  };

  const accessLabel = (row) => {
    if (row?.access_mode === "premium") return t("admin.billingAccessPremium");
    if (row?.access_mode === "blocked") return t("admin.billingAccessBlocked");
    return t("admin.billingAccessFree");
  };

  const planLabel = (row) => {
    if (row?.premium_active) return t("admin.billingPlanPremium");
    return t("admin.billingPlanFree");
  };

  const paymentStatusLabel = (status) => {
    const normalized = String(status || "").trim().toLowerCase();
    if (!normalized) return "—";

    const key = `admin.billingPaymentStatus.${normalized}`;
    const translated = t(key);
    return translated === key ? status : translated;
  };

  const quotaLabel = (row) => {
    if (row?.premium_active) return t("admin.billingUnlimited");
    const used = Number(row?.free_query_used || 0);
    const limit = Number(row?.free_query_limit || 0);
    const remaining = Number(row?.free_query_remaining || 0);

    return t("admin.billingQuotaUsage", {
      used,
      limit,
      remaining,
    });
  };

  const paymentLabel = (row) => {
    const p = row?.last_payment;
    if (!p) return t("admin.billingNeverPaid");

    const amount = formatAda(p.amount_ada);
    const date = formatDate(p.paid_at || p.created_at);
    return `${paymentStatusLabel(p.status)} · ${amount} · ${date}`;
  };

  return (
    <section className="admin-section admin-section--table">
      <div className="admin-section-header admin-section-header--compact">
        <h2 className="admin-section-title">{t("admin.billingSectionTitle")}</h2>
        <p className="admin-section-subtitle">
          {t("admin.billingSectionSubtitle")}
        </p>
      </div>

      <div className="admin-stat-grid admin-section">
        <div className="admin-stat-card admin-stat-card--users">
          <div className="admin-stat-label">{t("admin.billingStatsTotal")}</div>
          <div className="admin-stat-value">
            {billingStats?.total_users ?? "—"}
          </div>
          <div
            className="admin-stat-caption"
            style={{
              visibility: billingSearch.trim().length > 0 ? "visible" : "hidden",
            }}
          >
            {t("admin.billingStatsFilteredCaption", {
              count: billingStats?.filtered_total ?? 0,
            })}
          </div>
        </div>

        <div className="admin-stat-card status-red">
          <div className="admin-stat-label">
            {t("admin.billingStatsBlockedShown")}
          </div>
          <div className="admin-stat-value">
            {billingStats?.shown_blocked ?? "—"}
          </div>
          <div className="admin-stat-caption">
            {t("admin.billingStatsBlockedShownCaption")}
          </div>
        </div>

        <div className="admin-stat-card admin-stat-card--admins">
          <div className="admin-stat-label">
            {t("admin.billingStatsPremiumShown")}
          </div>
          <div className="admin-stat-value">
            {billingStats?.shown_premium ?? "—"}
          </div>
          <div className="admin-stat-caption">
            {t("admin.billingStatsPremiumShownCaption")}
          </div>
        </div>

        <div className="admin-stat-card status-green">
          <div className="admin-stat-label">
            {t("admin.billingStatsBalanceShown")}
          </div>
          <div className="admin-stat-value">
            {formatAda(billingStats?.shown_balance_ada || 0)}
          </div>
          <div className="admin-stat-caption">
            {t("admin.billingStatsBalanceShownCaption")}
          </div>
        </div>
      </div>

      <div className="admin-search-wrapper">
        <input
          type="text"
          className="form-control admin-search-input"
          placeholder={t("admin.billingSearchPlaceholder")}
          value={billingSearch}
          onChange={onSearchChange}
        />
      </div>

      {billingLoading && (
        <p className="admin-status-text">{t("admin.billingLoading")}</p>
      )}

      {billingError && (
        <p className="admin-status-text admin-status-text--error">
          {billingError}
        </p>
      )}

      {!billingLoading && !billingError && (
        <div className="admin-table-wrapper table-responsive">
          <table className="table table-sm table-dark table-striped align-middle admin-users-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="admin-users-actions-col admin-users-actions-col--head"
                >
                  {t("admin.colActions")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("user_id")}
                >
                  <span>{t("admin.colId")}</span>
                  {renderSortIcon("user_id")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("email")}
                >
                  <span>{t("admin.billingColUser")}</span>
                  {renderSortIcon("email")}
                </th>
                <th scope="col">{t("admin.billingColWallet")}</th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("premium_active")}
                >
                  <span>{t("admin.billingColPlan")}</span>
                  {renderSortIcon("premium_active")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("access_mode")}
                >
                  <span>{t("admin.billingColAccess")}</span>
                  {renderSortIcon("access_mode")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("balance_ada")}
                >
                  <span>{t("admin.billingColBalance")}</span>
                  {renderSortIcon("balance_ada")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("free_query_remaining")}
                >
                  <span>{t("admin.billingColFreeQuota")}</span>
                  {renderSortIcon("free_query_remaining")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("premium_expires_at")}
                >
                  <span>{t("admin.billingColPremiumUntil")}</span>
                  {renderSortIcon("premium_expires_at")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleBillingSort("last_payment_at")}
                >
                  <span>{t("admin.billingColLastPayment")}</span>
                  {renderSortIcon("last_payment_at")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedBillingUsers.length === 0 && (
                <tr>
                  <td colSpan={10}>{t("admin.billingNoRows")}</td>
                </tr>
              )}

              {sortedBillingUsers.map((row) => (
                <tr key={row.user_id} className="admin-user-row">
                  <td className="admin-users-actions-col admin-users-actions-cell">
                    <div className="admin-user-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success admin-user-action-btn"
                        title={t("admin.billingActionGrantPremium")}
                        onClick={() => openAction("grantPremium", row)}
                      >
                        <FontAwesomeIcon icon={faCrown} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-warning admin-user-action-btn"
                        title={t("admin.billingActionRevokePremium")}
                        disabled={!row.premium_active}
                        onClick={() => openAction("revokePremium", row)}
                      >
                        <FontAwesomeIcon icon={faBan} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-info admin-user-action-btn"
                        title={t("admin.billingActionResetQuota")}
                        onClick={() => openAction("resetQuota", row)}
                      >
                        <FontAwesomeIcon icon={faRedoAlt} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-light admin-user-action-btn"
                        title={t("admin.billingActionAdjustBalance")}
                        onClick={() => openAction("adjustBalance", row)}
                      >
                        <FontAwesomeIcon icon={faCoins} />
                      </button>
                    </div>
                  </td>
                  <td>{row.user_id}</td>
                  <td>
                    <span className="admin-user-identity">{userLabel(row)}</span>
                  </td>
                  <td title={row.wallet_address || ""}>{shorten(row.wallet_address)}</td>
                  <td>{planLabel(row)}</td>
                  <td>{accessLabel(row)}</td>
                  <td>{formatAda(row.balance_ada)}</td>
                  <td>{quotaLabel(row)}</td>
                  <td>{formatDate(row.premium_expires_at)}</td>
                  <td title={row?.last_payment?.tx_hash || ""}>{paymentLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BillingActionModal
        t={t}
        action={modalState.action}
        row={modalState.row}
        onClose={closeAction}
        grantPremium={grantPremium}
        revokePremium={revokePremium}
        resetFreeQuota={resetFreeQuota}
        adjustBalance={adjustBalance}
      />
    </section>
  );
}
