// src/pages/AdminPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthRequest } from "@/hooks/useAuthRequest";

import { useAdminSystemMetrics } from "@/hooks/useAdminSystemMetrics";
import { useAdminUsers } from "@/hooks/useAdminUsers";
import { useAdminWaitlist } from "@/hooks/useAdminWaitlist";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useAdminMetrics } from "@/hooks/useAdminMetrics";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";

import { AdminTabs } from "@/components/admin/AdminTabs";
import { SystemOverview } from "@/components/admin/SystemOverview";
import { SystemDetails } from "@/components/admin/SystemDetails";
import { WaitlistStatsSummary } from "@/components/admin/WaitlistStatsSummary";
import { UserStatsSummary } from "@/components/admin/UserStatsSummary";
import { UserDirectory } from "@/components/admin/UserDirectory";
import { WaitlistDirectory } from "@/components/admin/WaitlistDirectory";
import { NewUserAlertsPanel } from "@/components/admin/NewUserAlertsPanel";
import { WaitlistAlertsPanel } from "@/components/admin/WaitlistAlertsPanel";
import { UserConfirmedAlertsPanel } from "@/components/admin/UserConfirmedAlertsPanel";
import { MetricsOverview } from "@/components/admin/MetricsOverview";
import { AlertsRecipientsPool } from "@/components/admin/AlertsRecipientsPool";
import QueryDetailsModal from "@/components/admin/QueryDetailsModal";

import "@/styles/AdminPage.css";

function uniqEmails(list) {
  const out = [];
  const seen = new Set();
  for (const x of list || []) {
    const v = String(x || "")
      .trim()
      .toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
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

export default function AdminPage() {
  const { session, showToast } = useOutletContext() || {};
  const { t } = useTranslation();
  const { authFetch } = useAuthRequest({ session, showToast });

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedQuery, setSelectedQuery] = useState(null);

  const system = useAdminSystemMetrics(authFetch);
  const users = useAdminUsers(authFetch, showToast, t);
  const waitlist = useAdminWaitlist(authFetch, showToast, t, {
    refreshUsers: users.reloadUsers,
  });
  const notifications = useAdminNotifications(authFetch, showToast, t);
  const metrics = useAdminMetrics(authFetch, activeTab === "metrics");

  const tabs = [
    { key: "overview" },
    { key: "users" },
    { key: "metrics" },
    { key: "system" },
    { key: "alerts" },
  ];

  const [recipientPool, setRecipientPool] = useState(() => {
    try {
      const raw = localStorage.getItem("cap.admin.alertRecipientsPool");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? uniqEmails(parsed) : [];
    } catch {
      return [];
    }
  });

  // Persist pool
  useEffect(() => {
    try {
      localStorage.setItem(
        "cap.admin.alertRecipientsPool",
        JSON.stringify(uniqEmails(recipientPool)),
      );
    } catch {}
  }, [recipientPool]);

  // Seed pool from configs WITHOUT depending on `notifications` object identity
  const newUserRecipients =
    notifications?.newUser?.notifyConfig?.recipients || [];
  const waitlistRecipients =
    notifications?.waitlist?.notifyConfig?.recipients || [];
  const userConfirmedRecipients =
    notifications?.userConfirmed?.notifyConfig?.recipients || [];

  const seededFromConfigs = useMemo(() => {
    return uniqEmails([
      ...newUserRecipients,
      ...waitlistRecipients,
      ...userConfirmedRecipients,
    ]);
  }, [newUserRecipients, waitlistRecipients, userConfirmedRecipients]);

  useEffect(() => {
    if (!seededFromConfigs.length) return;

    setRecipientPool((prev) => {
      const prevArr = Array.isArray(prev) ? prev : [];
      const next = uniqEmails([...prevArr, ...seededFromConfigs]);
      return arraysEqual(next, prevArr) ? prevArr : next;
    });
  }, [seededFromConfigs]);

  // Sync tab → URL
  const changeTab = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const swipeHandlers = useSwipeTabs({
    activeTab,
    tabs,
    onChange: changeTab,
    swipeMinPx: 80,
  });

  // Guard (backend still enforces admin)
  if (!session || !session.is_admin) {
    return (
      <div className="AdminPage container">
        <div className="AdminPage-inner">
          <h1 className="admin-title">{t("admin.accessDeniedTitle")}</h1>
          <p className="admin-subtitle">{t("admin.accessDeniedText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="AdminPage container" {...swipeHandlers}>
      <div className="AdminPage-inner">
        <header className="admin-header">
          <h1 className="admin-title">{t("admin.title")}</h1>
          <p className="admin-subtitle">{t("admin.subtitle")}</p>
        </header>

        <AdminTabs activeTab={activeTab} onChange={changeTab} t={t} />

        {activeTab === "overview" && (
          <>
            <SystemOverview t={t} {...system} />
            <UserStatsSummary t={t} {...users} />
            <WaitlistStatsSummary t={t} {...waitlist} />
          </>
        )}

        {activeTab === "users" && (
          <>
            <UserStatsSummary t={t} {...users} />
            <WaitlistStatsSummary t={t} {...waitlist} />
            <div data-swipe-tabs-disabled="true">
              <UserDirectory t={t} showToast={showToast} {...users} />
              <WaitlistDirectory t={t} showToast={showToast} {...waitlist} />
            </div>
          </>
        )}

        {activeTab === "metrics" && (
          <>
            <MetricsOverview
              t={t}
              {...metrics}
              onOpenQuery={(q) => setSelectedQuery(q)}
            />
          </>
        )}

        {activeTab === "system" && <SystemDetails t={t} {...system} />}

        {activeTab === "alerts" && (
          <>
            <AlertsRecipientsPool
              t={t}
              value={recipientPool}
              onChange={setRecipientPool}
              disabled={false}
            />

            <NewUserAlertsPanel
              t={t}
              {...notifications.newUser}
              recipientPool={recipientPool}
              setRecipientPool={setRecipientPool}
            />

            <WaitlistAlertsPanel
              t={t}
              {...notifications.waitlist}
              recipientPool={recipientPool}
              setRecipientPool={setRecipientPool}
            />

            <UserConfirmedAlertsPanel
              t={t}
              {...notifications.userConfirmed}
              recipientPool={recipientPool}
              setRecipientPool={setRecipientPool}
            />
          </>
        )}
      </div>
      {selectedQuery && (
        <QueryDetailsModal
          t={t}
          queryId={selectedQuery.id}
          initialData={selectedQuery}
          onClose={() => setSelectedQuery(null)}
        />
      )}
    </div>
  );
}
