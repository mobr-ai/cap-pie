import React from "react";

function formatAda(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 ₳";
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 6 : 0,
    maximumFractionDigits: 6,
  })} ₳`;
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
}) {
  const onSearchChange = (e) => setBillingSearch(e.target.value);

  const renderSortIcon = (field) => {
    if (billingSortField !== field) return <span className="admin-sort-icon">⇅</span>;
    return (
      <span className="admin-sort-icon">
        {billingSortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
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

  const quotaLabel = (row) => {
    if (row?.premium_active) return t("admin.billingUnlimited");
    const used = Number(row?.free_query_used || 0);
    const limit = Number(row?.free_query_limit || 0);
    const remaining = Number(row?.free_query_remaining || 0);
    return `${used}/${limit} (${remaining} left)`;
  };

  const paymentLabel = (row) => {
    const p = row?.last_payment;
    if (!p) return t("admin.billingNeverPaid");

    const amount = formatAda(p.amount_ada);
    const date = formatDate(p.paid_at || p.created_at);
    return `${p.status || "—"} · ${amount} · ${date}`;
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
        </div>

        <div className="admin-stat-card admin-stat-card--confirmed">
          <div className="admin-stat-label">{t("admin.billingStatsFiltered")}</div>
          <div className="admin-stat-value">
            {billingStats?.filtered_total ?? "—"}
          </div>
        </div>

        <div className="admin-stat-card admin-stat-card--admins">
          <div className="admin-stat-label">{t("admin.billingStatsPremiumShown")}</div>
          <div className="admin-stat-value">
            {billingStats?.shown_premium ?? "—"}
          </div>
        </div>

        <div className="admin-stat-card status-green">
          <div className="admin-stat-label">{t("admin.billingStatsBalanceShown")}</div>
          <div className="admin-stat-value">
            {formatAda(billingStats?.shown_balance_ada || 0)}
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
                  <td colSpan={9}>{t("admin.billingNoRows")}</td>
                </tr>
              )}

              {sortedBillingUsers.map((row) => (
                <tr key={row.user_id} className="admin-user-row">
                  <td>{row.user_id}</td>
                  <td>
                    <span className="admin-user-identity">
                      {row.email || row.username || row.display_name || "—"}
                    </span>
                  </td>
                  <td title={row.wallet_address || ""}>
                    {shorten(row.wallet_address)}
                  </td>
                  <td>{planLabel(row)}</td>
                  <td>{accessLabel(row)}</td>
                  <td>{formatAda(row.balance_ada)}</td>
                  <td>{quotaLabel(row)}</td>
                  <td>{formatDate(row.premium_expires_at)}</td>
                  <td title={row?.last_payment?.tx_hash || ""}>
                    {paymentLabel(row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
