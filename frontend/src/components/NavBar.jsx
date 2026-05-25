import "./../styles/NavBar.css";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Container from "react-bootstrap/Container";
import Image from "react-bootstrap/Image";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import NavDropdown from "react-bootstrap/NavDropdown";
import { Link, useNavigate, useLocation } from "react-router-dom";
import i18n from "./../i18n";
import { useTranslation } from "react-i18next";
import { formatBillingAmountFromMinor } from "./../billing/currency";

import avatarImg from "/icons/avatar.png";

function getBillingBadge(access, loading, t) {
  if (loading && !access) {
    return {
      className: "is-loading",
      label: t("billingAccess.badge.loading"),
      title: t("billingAccess.badge.loadingTitle"),
    };
  }

  if (!access) {
    return null;
  }

  if (access.access_mode === "premium" || access.premium_active) {
    return {
      className: "is-premium",
      label: t("billingAccess.badge.premium"),
      title: t("billingAccess.badge.premiumTitle"),
    };
  }

  if (access.access_mode === "blocked" || access.can_query === false) {
    return {
      className: "is-blocked",
      label: t("billingAccess.badge.blocked"),
      title: t("billingAccess.badge.blockedTitle"),
    };
  }

  const remaining = Number(access.free_query_remaining ?? 0);

  return {
    className: "is-free",
    label: t("billingAccess.badge.freeRemaining", { count: remaining }),
    title: t("billingAccess.badge.freeTitle", { count: remaining }),
  };
}

function NavBar({
  userData,
  handleLogout,
  capBlock,
  cardanoBlock,
  syncStatus,
  syncLag,
  syncPct,
  healthOnline,
  billingAccess,
  billingAccessLoading,
  refreshBillingAccess,
}) {
  const [expanded, setExpanded] = useState(false);
  const [brand, setBrand] = useState("");
  const brandRef = useRef("");
  const navigate = useNavigate();
  const location = useLocation();
  const hideLoginLink =
    location?.pathname === "/login" || location?.pathname === "/welcome";
  const { t } = useTranslation();
  const brandRanRef = useRef(false);

  // Typing → pause → shrink animation
  useEffect(() => {
    if (brandRanRef.current) return;
    brandRanRef.current = true;
    const FULL = "Cardano Analytics Platform";
    const TARGET = "CAP";
    const TYPE_MS = 40,
      BACK_MS = 35,
      PAUSE_MS = 700;
    let stage = "type",
      i = 0,
      tId;

    const tick = () => {
      if (stage === "type") {
        if (i < FULL.length) {
          const next = FULL.slice(0, i + 1);
          brandRef.current = next;
          setBrand(next);
          i += 1;
          tId = setTimeout(tick, TYPE_MS);
        } else {
          stage = "pause";
          tId = setTimeout(tick, PAUSE_MS);
        }
      } else if (stage === "pause") {
        stage = "shrink";
        tId = setTimeout(tick, BACK_MS);
      } else {
        const current = brandRef.current || FULL;
        if (current.length > TARGET.length) {
          const next = current.slice(0, -1);
          brandRef.current = next;
          setBrand(next);
          tId = setTimeout(tick, BACK_MS);
        } else {
          brandRef.current = TARGET;
          setBrand(TARGET);
          clearTimeout(tId);
        }
      }
    };
    tick();
    return () => clearTimeout(tId);
  }, []);

  const logout = () => handleLogout && handleLogout();
  const login = () => navigate("/login");

  const changeLanguage = (lng) => {
    localStorage.setItem("i18nextLng", lng);
    navigate(0);
  };

  const displayName =
    userData?.display_name ||
    userData?.username ||
    userData?.email ||
    "Account";
  const shortName =
    displayName.length > 20 ? displayName.slice(0, 17) + "…" : displayName;

  const billingBadge = getBillingBadge(billingAccess, billingAccessLoading, t);
  const balanceAmount = formatBillingAmountFromMinor(billingAccess?.balance_lovelace, { currency: "lovelace" });
  const freeUsed = Number(billingAccess?.free_query_used ?? 0);
  const freeLimit = Number(billingAccess?.free_query_limit ?? 0);
  const freeRemaining = Number(billingAccess?.free_query_remaining ?? 0);

  const userMenuTitle = (
    <span className="navbar-user-title nav-text">
      <Image
        src={userData?.avatar || avatarImg}
        alt="Profile avatar"
        onError={(e) => (e.currentTarget.src = avatarImg)}
        roundedCircle
        className="navbar-user-avatar"
      />
      <span className="navbar-user-name">{shortName}</span>
      {billingBadge ? (
        <span
          className={`navbar-billing-badge ${billingBadge.className}`}
          title={billingBadge.title}
        >
          {billingBadge.label}
        </span>
      ) : null}
      <span className="navbar-user-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );

  const langItems = useMemo(
    () => [
      { code: "pt", label: "🇧🇷 Português (BR)" },
      { code: "en", label: "🇺🇸 English (US)" },
    ],
    [],
  );
  const currentLang = (i18n.language || "en").split("-")[0];
  const langMenuTitle = (
    <span className="navbar-lang-title nav-text">
      <span className="navbar-lang-label">{t("language")}</span>
      <span className="navbar-lang-caret" aria-hidden="true">
        ▾
      </span>
    </span>
  );

  function SyncRadial({ pct, state, tooltip }) {
    const size = 26;
    const stroke = 3.2;

    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;

    const hasPct = typeof pct === "number" && Number.isFinite(pct);
    const clamped = hasPct ? Math.max(0, Math.min(100, pct)) : 0;
    const dash = (clamped / 100) * c;

    return (
      <span className="cap-sync" data-state={state}>
        <span className="cap-sync-label">SYNC</span>

        <span className="cap-sync-ring" aria-label={tooltip}>
          <svg
            className="cap-sync-svg"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
          >
            <circle
              className="cap-sync-track"
              cx={size / 2}
              cy={size / 2}
              r={r}
            />
            <circle
              className="cap-sync-progress"
              cx={size / 2}
              cy={size / 2}
              r={r}
              strokeDasharray={`${dash} ${c - dash}`}
            />
            <path
              className="cap-sync-slash"
              d={`M${size * 0.28} ${size * 0.72} L${size * 0.72} ${
                size * 0.28
              }`}
            />
          </svg>

          {hasPct && clamped < 100 ? (
            <span className="cap-sync-ring-text">{clamped.toFixed(1)}</span>
          ) : null}
        </span>

        {/* <span className="cap-sync-pct">{hasPct ? `${clamped}%` : "—"}</span> */}

        <span className="cap-sync-tooltip" role="tooltip">
          {tooltip}
        </span>
      </span>
    );
  }

  return (
    <>
      <style>{`
        #navbar-user .dropdown-toggle::after { display: none !important; }
      `}</style>

      <Navbar
        data-bs-theme="dark"
        expand="lg"
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        className="bg-body-tertiary cap-navbar"
        sticky="top"
      >
        <Container fluid className="cap-navbar-row">
          {/* Brand */}
          <Navbar.Brand
            as={Link}
            to="/"
            className="Navbar-brand-container nav-text"
          >
            <span className="Navbar-brand-slot">{brand || "CAP"}</span>
          </Navbar.Brand>

          {/* Status line (hidden on very small screens via CSS) */}
          {userData && (
            <div className="navbar-status-bar">
              {(() => {
                const showChecking = healthOnline === null;
                const showOffline = healthOnline === false;
                const showSync = healthOnline === true;

                const isSynced =
                  typeof syncLag === "number" ? syncLag <= 50 : syncPct >= 100;
                const state = showOffline
                  ? "offline"
                  : showChecking
                    ? "checking"
                    : isSynced
                      ? "synced"
                      : "syncing";

                const pct = showSync ? syncPct : null;

                const statusCode = String(syncStatus?.code || "unknown");
                const isUnknown =
                  statusCode === "unknown" || statusCode === "checking";
                const isBlocked =
                  showOffline || isUnknown || healthOnline == null;

                const tooltip = isBlocked ? (
                  <div className="cap-sync-tooltip-blocked">
                    <span className="cap-tip-icon" aria-hidden="true">
                      !
                    </span>
                    <div className="cap-sync-tooltip-text">
                      <div className="cap-sync-tooltip-title">
                        {t("sync.tooltip.blockedTitle")}
                      </div>
                      <div className="cap-sync-tooltip-body">
                        {showOffline
                          ? t("sync.tooltip.offlineBody")
                          : t("sync.tooltip.unknownBody")}
                      </div>
                    </div>
                  </div>
                ) : (
                  [
                    `${t("sync.tooltip.statusLabel")}: ${t(
                      `sync.status.${statusCode}`,
                    )}`,
                    `${t("sync.tooltip.capLabel")}: ${
                      capBlock == null ? "—" : capBlock.toLocaleString()
                    }`,
                    `${t("sync.tooltip.cardanoLabel")}: ${
                      cardanoBlock == null ? "—" : cardanoBlock.toLocaleString()
                    }`,
                    `${t("sync.tooltip.lagLabel")}: ${
                      syncLag == null ? "—" : syncLag.toLocaleString()
                    } ${t("sync.tooltip.blocksSuffix")}`,
                  ].join("\n")
                );

                return (
                  <div className="status-item nav-text">
                    <SyncRadial pct={pct} state={state} tooltip={tooltip} />
                  </div>
                );
              })()}
            </div>
          )}

          <Navbar.Toggle aria-controls="cap-navbar" />
          <Navbar.Collapse id="cap-navbar" className="justify-content-end">
            <Nav className="ml-auto NavBar-top-container">
              {/* Admin entry (only for admins) */}
              {userData?.is_admin && (
                <Nav.Link
                  as={Link}
                  to="/admin"
                  className="nav-text"
                  onClick={() => setExpanded(false)}
                >
                  {t("nav.admin")}
                </Nav.Link>
              )}
              {/* Dashboard entry (important for mobile where sidebar is hidden) */}
              {userData && (
                <Nav.Link
                  as={Link}
                  to="/dashboard"
                  className="nav-text"
                  onClick={() => setExpanded(false)}
                >
                  Dashboard
                </Nav.Link>
              )}

              {/* Learn more link */}
              <Nav.Link
                className="nav-text"
                onClick={() => {
                  window.open(
                    "https://www.youtube.com/watch?v=nRsa_qiGhN0",
                    "_blank",
                    "noopener,noreferrer",
                  );
                  setExpanded(false);
                }}
              >
                {t("learnMore")}
              </Nav.Link>

              {/* Language dropdown */}
              <NavDropdown
                title={langMenuTitle}
                id="navbar-lang"
                align="end"
                menuVariant="dark"
                className="nav-text"
              >
                {langItems.map((lng) => (
                  <NavDropdown.Item
                    key={lng.code}
                    onClick={() => {
                      changeLanguage(lng.code);
                      setExpanded(false);
                    }}
                  >
                    {lng.label}
                    {currentLang === lng.code ? (
                      <span className="Navbar-checkmark"> ✓</span>
                    ) : null}
                  </NavDropdown.Item>
                ))}
              </NavDropdown>

              {!userData && !hideLoginLink && (
                <Nav.Link
                  className="nav-text"
                  onClick={() => {
                    login();
                    setExpanded(false);
                  }}
                >
                  Log in
                </Nav.Link>
              )}

              {userData && (
                <NavDropdown
                  title={userMenuTitle}
                  id="navbar-user"
                  align="end"
                  menuVariant="dark"
                  className="navbar-user-dropdown"
                >
                  <div className="navbar-account-summary">
                    <div className="navbar-account-row">
                      <Image
                        src={userData?.avatar || avatarImg}
                        alt="Profile avatar"
                        onError={(e) => (e.currentTarget.src = avatarImg)}
                        roundedCircle
                        className="navbar-account-avatar"
                      />
                      <div className="navbar-account-copy">
                        <div className="navbar-account-name">{shortName}</div>
                        <div className="navbar-account-plan">
                          {billingAccess?.premium_active
                            ? t("billingAccess.dropdown.premium")
                            : billingAccess?.access_mode === "blocked"
                              ? t("billingAccess.dropdown.blocked")
                              : t("billingAccess.dropdown.free")}
                        </div>
                      </div>
                    </div>

                    <div className="navbar-account-metrics">
                      <div>
                        <span>{t("billingAccess.dropdown.balance")}</span>
                        <strong>{balanceAmount}</strong>
                      </div>
                      <div>
                        <span>{t("billingAccess.dropdown.queries")}</span>
                        <strong>
                          {billingAccess?.premium_active
                            ? t("billingAccess.dropdown.unlimited")
                            : `${freeRemaining}/${freeLimit}`}
                        </strong>
                      </div>
                    </div>

                    {billingAccess?.premium_entitlement?.expires_at ? (
                      <div className="navbar-account-note">
                        {t("billingAccess.dropdown.expires", {
                          date: new Date(
                            billingAccess.premium_entitlement.expires_at,
                          ).toLocaleDateString(),
                        })}
                      </div>
                    ) : (
                      <div className="navbar-account-note">
                        {t("billingAccess.dropdown.paygComing")}
                      </div>
                    )}
                  </div>

                  <NavDropdown.Divider />

                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      navigate("/analyses");
                      setExpanded(false);
                    }}
                  >
                    {t("nav.analyses")}
                  </NavDropdown.Item>

                  <NavDropdown.Divider />

                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      navigate("/settings");
                      setExpanded(false);
                    }}
                  >
                    {t("nav.settings")}
                  </NavDropdown.Item>
                  <NavDropdown.Divider />
                  <NavDropdown.Item
                    className="nav-text"
                    onClick={() => {
                      logout();
                      setExpanded(false);
                    }}
                  >
                    {t("nav.logout")}
                  </NavDropdown.Item>
                </NavDropdown>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
    </>
  );
}

export default NavBar;
