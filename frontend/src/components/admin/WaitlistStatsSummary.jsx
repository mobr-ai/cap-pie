// src/components/admin/WaitlistStatsSummary.jsx
import React from "react";

export function WaitlistStatsSummary({
  t,
  totalWaitlist,
  waitlistWithRef,
  waitlistLanguages,
  hasWaitlistFilter,
  waitlistFilteredTotal,
}) {
  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <h2 className="admin-section-title">
          {t("admin.waitlistSectionTitle")}
        </h2>
        <p className="admin-section-subtitle">
          {t("admin.waitlistSectionSubtitle")}
        </p>
      </div>

      <div className="admin-stat-grid">
        <div className="admin-stat-card admin-stat-card--waitlist">
          <div className="admin-stat-label">
            {t("admin.waitlistStatsTotal")}
          </div>
          <div className="admin-stat-value">{totalWaitlist}</div>

          {hasWaitlistFilter ? (
            <div className="admin-stat-caption">
              {t("admin.waitlistStatsFiltered", {
                count: waitlistFilteredTotal,
              })}
            </div>
          ) : (
            <div className="admin-stat-caption">&nbsp;</div>
          )}
        </div>

        <div className="admin-stat-card admin-stat-card--waitlistRef">
          <div className="admin-stat-label">
            {t("admin.waitlistStatsWithRef")}
          </div>
          <div className="admin-stat-value">{waitlistWithRef}</div>
          <div className="admin-stat-caption">
            {t("admin.waitlistStatsWithRefCaption")}
          </div>
        </div>

        <div className="admin-stat-card admin-stat-card--waitlistLang">
          <div className="admin-stat-label">
            {t("admin.waitlistStatsLanguages")}
          </div>
          <div className="admin-stat-value">{waitlistLanguages}</div>
          <div className="admin-stat-caption">
            {t("admin.waitlistStatsLanguagesCaption")}
          </div>
        </div>
      </div>
    </section>
  );
}
