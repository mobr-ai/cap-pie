import React from "react";

function formatAda(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0 ₳";
  return `${n.toLocaleString(undefined, {
    minimumFractionDigits: n > 0 && n < 1 ? 6 : 0,
    maximumFractionDigits: 6,
  })} ₳`;
}

function formatQuota(used, limit) {
  const u = Number(used || 0);
  const l = Number(limit || 0);
  if (!Number.isFinite(u) || !Number.isFinite(l) || l <= 0) return String(u || 0);
  return `${u}/${l}`;
}

export function BillingOverviewSummary({
  t,
  billingOverview,
  billingOverviewLoading,
  billingOverviewError,
}) {
  const data = billingOverview || {};

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          {t("admin.billingOverviewTitle")}
        </h2>
        <p className="admin-section-subtitle">
          {t("admin.billingOverviewSubtitle")}
        </p>
      </div>

      {billingOverviewLoading && (
        <p className="admin-status-text">
          {t("admin.billingOverviewLoading")}
        </p>
      )}

      {billingOverviewError && (
        <p className="admin-status-text admin-status-text--error">
          {billingOverviewError}
        </p>
      )}

      {!billingOverviewLoading && !billingOverviewError && (
        <div className="admin-stat-grid">
          <div className="admin-stat-card admin-stat-card--confirmed">
            <div className="admin-stat-label">
              {t("admin.billingOverviewPremiumUsers")}
            </div>
            <div className="admin-stat-value">
              {data.premium_users ?? 0}
            </div>
            <div className="admin-stat-caption">
              {t("admin.billingOverviewPremiumUsersCaption")}
            </div>
          </div>

          <div className="admin-stat-card status-red">
            <div className="admin-stat-label">
              {t("admin.billingOverviewBlockedUsers")}
            </div>
            <div className="admin-stat-value">
              {data.blocked_users ?? 0}
            </div>
            <div className="admin-stat-caption">
              {t("admin.billingOverviewBlockedUsersCaption")}
            </div>
          </div>

          <div className="admin-stat-card status-green">
            <div className="admin-stat-label">
              {t("admin.billingOverviewTotalBalance")}
            </div>
            <div className="admin-stat-value">
              {formatAda(data.total_balance_ada)}
            </div>
            <div className="admin-stat-caption">
              {t("admin.billingOverviewTotalBalanceCaption")}
            </div>
          </div>

          <div className="admin-stat-card admin-stat-card--admins">
            <div className="admin-stat-label">
              {t("admin.billingOverviewFreeQuotaUsed")}
            </div>
            <div className="admin-stat-value">
              {formatQuota(
                data.free_query_used,
                data.free_query_limit_estimated || data.free_query_limit_recorded,
              )}
            </div>
            <div className="admin-stat-caption">
              {t("admin.billingOverviewFreeQuotaUsedCaption")}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
