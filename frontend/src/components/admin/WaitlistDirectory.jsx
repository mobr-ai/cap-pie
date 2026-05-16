import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserPlus,
  faUserCheck,
  faTrash,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

export function WaitlistDirectory({
  t,
  items = [],
  loading = false,
  error = null,
  search = "",
  setSearch,
  createUserFromWaitlist,
  deleteWaitlistEntry,
}) {
  const [processingEmail, setProcessingEmail] = useState(null);

  const hasFilter = !!(search && search.trim());

  const rows = useMemo(() => {
    return Array.isArray(items) ? items : [];
  }, [items]);

  const handleCreateUser = async (email, confirm = false) => {
    if (!createUserFromWaitlist) return;
    try {
      setProcessingEmail(email);
      await createUserFromWaitlist(email, confirm);
    } finally {
      setProcessingEmail(null);
    }
  };

  const handleDelete = async (email) => {
    if (!deleteWaitlistEntry) return;

    const confirmed = window.confirm(
      t("admin.confirmDeleteWaitlist", { email }),
    );
    if (!confirmed) return;

    try {
      setProcessingEmail(email);
      await deleteWaitlistEntry(email);
    } finally {
      setProcessingEmail(null);
    }
  };

  return (
    <section className="AdminUserDirectory">
      <header className="admin-section-header">
        <h2 className="admin-section-title">{t("admin.waitlistTitle")}</h2>
        <p className="admin-section-subtitle">{t("admin.waitlistSubtitle")}</p>
      </header>

      {/* Match UserDirectory layout: full-width input */}
      <div className="admin-search-wrapper">
        <input
          type="text"
          className="form-control admin-search-input"
          placeholder={t("admin.waitlistSearchPlaceholder")}
          value={search}
          onChange={(e) => setSearch && setSearch(e.target.value)}
        />
      </div>
      <div className="admin-table-wrapper table-responsive">
        <table className="table table-sm table-dark table-striped align-middle admin-users-table">
          <thead>
            <tr>
              <th>{t("admin.colActions")}</th>
              <th>{t("admin.colEmail")}</th>
              <th>{t("admin.colRef")}</th>
              <th>{t("admin.colLanguage")}</th>
              <th>{t("admin.colCreatedAt")}</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="admin-table-loading">
                  <FontAwesomeIcon icon={faSpinner} spin /> {t("admin.loading")}
                </td>
              </tr>
            )}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="admin-table-empty">
                  {hasFilter
                    ? t("admin.noWaitlistResults")
                    : t("admin.waitlistEmpty")}
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((item) => {
                const email = item.email;
                const isProcessing = processingEmail === email;

                return (
                  <tr key={email}>
                    <td className="admin-users-actions-col admin-users-actions-cell">
                      <div className="admin-user-actions">
                        <button
                          className="btn btn-sm btn-outline-secondary admin-user-action-btn"
                          title={t("admin.createUser")}
                          disabled={isProcessing}
                          onClick={() => handleCreateUser(email, false)}
                        >
                          <FontAwesomeIcon icon={faUserPlus} />
                        </button>

                        <button
                          className="btn btn-sm btn-outline-secondary admin-user-action-btn"
                          title={t("admin.createAndConfirmUser")}
                          disabled={isProcessing}
                          onClick={() => handleCreateUser(email, true)}
                        >
                          <FontAwesomeIcon icon={faUserCheck} />
                        </button>

                        <button
                          className="btn btn-sm btn-outline-danger admin-user-action-btn"
                          title={t("admin.deleteWaitlistEntry")}
                          disabled={isProcessing}
                          onClick={() => handleDelete(email)}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>

                    <td className="mono">{email}</td>
                    <td className="mono">{item.ref || "—"}</td>
                    <td>{item.language || "—"}</td>
                    <td className="mono">{item.created_at || "—"}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>

        {/* Optional inline error (won’t show keys) */}
        {!loading && error ? (
          <div className="admin-inline-error">{String(error)}</div>
        ) : null}
      </div>
    </section>
  );
}
