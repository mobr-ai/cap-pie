// src/components/dashboard/DashboardToolbar.jsx
import React from "react";
import Dropdown from "react-bootstrap/Dropdown";
import Button from "react-bootstrap/Button";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpWideShort,
  faClock,
  faFont,
} from "@fortawesome/free-solid-svg-icons";

export default function DashboardToolbar({
  dashboards,
  activeId,
  activeName,
  onSelectDashboard,
  onRefresh,
  isLoading,
  sortOrder,
  onChangeSort,
}) {
  const { t } = useTranslation();

  if (isLoading) return null;

  const sortOptions = [
    {
      key: "position",
      icon: faArrowUpWideShort,
      label: t("dashboard.sort.manual"),
    },
    {
      key: "newest",
      icon: faClock,
      label: t("dashboard.sort.newest"),
    },
    {
      key: "oldest",
      icon: faClock,
      label: t("dashboard.sort.oldest"),
    },
    {
      key: "title",
      icon: faFont,
      label: t("dashboard.sort.title"),
    },
  ];

  const activeSort =
    sortOptions.find((o) => o.key === sortOrder) || sortOptions[0];

  return (
    <div className="d-flex align-items-center mb-3 gap-2">
      <h2 className="me-2">{t("dashboard.title")}</h2>

      {/* Dashboard selector */}
      <Dropdown>
        <Dropdown.Toggle variant="secondary" size="sm">
          {activeName}
        </Dropdown.Toggle>
        <Dropdown.Menu>
          {dashboards.map((d) => (
            <Dropdown.Item
              key={d.id}
              active={d.id === activeId}
              onClick={() => onSelectDashboard(d.id)}
            >
              {d.name}
              {d.is_default ? ` (${t("dashboard.defaultLabel")})` : ""}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>

      {/* Refresh */}
      <Button
        variant="outline-secondary"
        size="sm"
        onClick={onRefresh}
        title={t("dashboard.refresh")}
      >
        {t("dashboard.refresh")}
      </Button>

      {/* Spacer */}
      <div className="flex-grow-1" />

      {/* Sort menu */}
      <Dropdown align="end">
        <Dropdown.Toggle
          variant="outline-secondary"
          size="sm"
          title={t("dashboard.sort.label")}
        >
          <FontAwesomeIcon icon={activeSort.icon} />
        </Dropdown.Toggle>
        <Dropdown.Menu variant="secondary">
          {sortOptions.map((opt) => (
            <Dropdown.Item
              key={opt.key}
              active={opt.key === sortOrder}
              onClick={() => onChangeSort?.(opt.key)}
            >
              <FontAwesomeIcon icon={opt.icon} className="me-2" />
              {opt.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
    </div>
  );
}
