// src/components/admin/UserStatsSummary.jsx
import React from "react";

export function UserStatsSummary({
  t,
  totalUsers,
  totalAdmins,
  totalConfirmed,
  hasFilter,
  filteredTotal,
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">{t("admin.userSectionTitle")}</h2>
        <p className="admin-section-subtitle">
          {t("admin.userSectionSubtitle")}
        </p>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card--users">
          <div className="admin-stat-label">
            {t("admin.userStatsTotalUsers")}
          </div>
          <div className="admin-stat-value">{totalUsers}</div>
          {hasFilter ? (
            <div className="admin-stat-caption">
              {t("admin.userStatsFiltered", { count: filteredTotal })}
            </div>
          ) : (
            <div className="admin-stat-caption">&nbsp;</div>
          )}
        </div>

        <div className="admin-stat-card admin-stat-card--admins">
          <div className="admin-stat-label">{t("admin.userStatsAdmins")}</div>
          <div className="admin-stat-value">{totalAdmins}</div>
          <div className="admin-stat-caption">
            {t("admin.userStatsAdminsCaption")}
          </div>
        </div>

        <div className="admin-stat-card admin-stat-card--confirmed">
          <div className="admin-stat-label">
            {t("admin.userStatsConfirmed")}
          </div>
          <div className="admin-stat-value">{totalConfirmed}</div>
          <div className="admin-stat-caption">
            {t("admin.userStatsConfirmedCaption")}
          </div>
        </div>
      </div>
    </section>
  );
}
