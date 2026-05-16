// src/components/admin/UserDirectory.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserShield,
  faUserCheck,
  faTrashAlt,
  faUserSlash,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";

export function UserDirectory({
  t,
  search,
  setSearch,
  usersLoading,
  usersError,
  sortedUsers,
  sortField,
  sortDirection,
  handleSort,
  toggleAdmin,
  toggleConfirmed,
  deleteUser,
  isUserAnonymized,
}) {
  const navigate = useNavigate();
  const onSearchChange = (e) => setSearch(e.target.value);

  const renderSortIcon = (field) => {
    if (sortField !== field) return <span className="admin-sort-icon">⇅</span>;
    return (
      <span className="admin-sort-icon">
        {sortDirection === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  return (
    <section className="admin-section admin-section--table">
      <div className="admin-section-header admin-section-header--compact">
        <h2 className="admin-section-title">{t("admin.tableSectionTitle")}</h2>
        <p className="admin-section-subtitle">
          {t("admin.tableSectionSubtitle")}
        </p>
      </div>

      <div className="admin-search-wrapper">
        <input
          type="text"
          className="form-control admin-search-input"
          placeholder={t("admin.searchPlaceholder")}
          value={search}
          onChange={onSearchChange}
        />
      </div>

      {usersLoading && (
        <p className="admin-status-text">{t("admin.loading")}</p>
      )}
      {usersError && (
        <p className="admin-status-text admin-status-text--error">
          {usersError}
        </p>
      )}

      {!usersLoading && !usersError && (
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
                  onClick={() => handleSort("user_id")}
                >
                  <span>{t("admin.colId")}</span>
                  {renderSortIcon("user_id")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleSort("email")}
                >
                  <span>{t("admin.colEmail")}</span>
                  {renderSortIcon("email")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleSort("username")}
                >
                  <span>{t("admin.colUsername")}</span>
                  {renderSortIcon("username")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleSort("is_confirmed")}
                >
                  <span>{t("admin.colConfirmed")}</span>
                  {renderSortIcon("is_confirmed")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleSort("is_admin")}
                >
                  <span>{t("admin.colAdmin")}</span>
                  {renderSortIcon("is_admin")}
                </th>
                <th
                  scope="col"
                  className="admin-sortable-header"
                  onClick={() => handleSort("wallet_address")}
                >
                  <span>{t("admin.colWallet")}</span>
                  {renderSortIcon("wallet_address")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.length === 0 && (
                <tr>
                  <td colSpan={7}>{t("admin.noUsers")}</td>
                </tr>
              )}
              {sortedUsers.map((u) => {
                const anonymized = isUserAnonymized(u);
                const rowClass = anonymized
                  ? "admin-user-row admin-user-row--anonymized"
                  : "admin-user-row";

                return (
                  <tr key={u.user_id} className={rowClass}>
                    <td className="admin-users-actions-col admin-users-actions-cell">
                      <div className="admin-user-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary admin-user-action-btn"
                          title={
                            u.is_admin
                              ? t("admin.actionDemoteAdmin")
                              : t("admin.actionPromoteAdmin")
                          }
                          onClick={() => toggleAdmin(u)}
                        >
                          <FontAwesomeIcon icon={faUserShield} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary admin-user-action-btn"
                          title={
                            u.is_confirmed
                              ? t("admin.actionMarkUnconfirmed")
                              : t("admin.actionMarkConfirmed")
                          }
                          onClick={() => toggleConfirmed(u)}
                        >
                          <FontAwesomeIcon icon={faUserCheck} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary admin-user-action-btn"
                          title={t("admin.userActions.viewQueries")}
                          onClick={() =>
                            navigate(`/admin/users/${u.user_id}/queries`)
                          }
                        >
                          <FontAwesomeIcon icon={faChartLine} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger admin-user-action-btn"
                          title={
                            anonymized
                              ? t("admin.actionDeleteUserHard")
                              : t("admin.actionDeleteUserSoft")
                          }
                          onClick={() => deleteUser(u)}
                        >
                          <FontAwesomeIcon
                            icon={anonymized ? faUserSlash : faTrashAlt}
                          />
                        </button>{" "}
                      </div>
                    </td>
                    <td>{u.user_id}</td>
                    <td>{u.email || "—"}</td>
                    <td>
                      <span className="admin-user-identity">
                        {u.username || "—"}
                        {anonymized && (
                          <span
                            className="admin-user-badge"
                            title={t("admin.toastUserAnonymized")}
                          >
                            <FontAwesomeIcon icon={faUserSlash} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td>{u.is_confirmed ? t("admin.yes") : t("admin.no")}</td>
                    <td>{u.is_admin ? t("admin.yes") : t("admin.no")}</td>
                    <td>{u.wallet_address || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
