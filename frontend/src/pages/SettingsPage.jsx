// src/pages/SettingsPage.jsx
import React, { useState, useEffect, useRef } from "react";
import "../styles/SettingsPage.css";
import ShareModal from "../components/ShareModal";
import CardanoPaymentModal from "../components/billing/CardanoPaymentModal";
import { useOutletContext, useNavigate } from "react-router-dom";
import {
  Container,
  Form,
  Row,
  Col,
  Image,
  Button,
  Spinner,
} from "react-bootstrap";
import { useTranslation } from "react-i18next";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShareAlt,
  faCopy,
  faPen,
  faUpload,
  faTrash,
  faCompass,
  faChartLine,
  faLayerGroup,
  faBolt,
  faRocket,
} from "@fortawesome/free-solid-svg-icons";

import { useAuthRequest } from "../hooks/useAuthRequest";
import { useLocalUpload } from "../hooks/useLocalUpload";
import { resizeImage } from "../utils/resizeImage";
import useOnClickOutside from "../hooks/useOnClickOutside";
import avatarImg from "/icons/avatar.png";
import { SUPPORTED_WALLETS, WALLET_ICONS } from "../cardano/constants";
import { getWalletInfo } from "../cardano/utils";
import {
  fetchMyCreditBalance,
  fetchMyEntitlements,
  hasEntitlement,
} from "../billing/api";

const USERNAME_REGEX = /^[a-zA-Z][a-zA-Z0-9._]{5,29}$/;
// Simple, friendly display name rule: 2-30 chars, trimmed, no control chars
const DISPLAY_NAME_REGEX = /^[^\x00-\x1F\x7F]{2,30}$/;

const DEPOSIT_OPTIONS_ADA = [
  {
    amount: 10,
    labelKey: "settingsBilling.depositOptions.explore.label",
    hintKey: "settingsBilling.depositOptions.explore.hint",
    icon: faCompass,
  },
  {
    amount: 25,
    labelKey: "settingsBilling.depositOptions.analyze.label",
    hintKey: "settingsBilling.depositOptions.analyze.hint",
    icon: faChartLine,
  },
  {
    amount: 50,
    labelKey: "settingsBilling.depositOptions.build.label",
    hintKey: "settingsBilling.depositOptions.build.hint",
    icon: faLayerGroup,
  },
  {
    amount: 100,
    labelKey: "settingsBilling.depositOptions.scale.label",
    hintKey: "settingsBilling.depositOptions.scale.hint",
    icon: faBolt,
  },
  {
    amount: 500,
    labelKey: "settingsBilling.depositOptions.operate.label",
    hintKey: "settingsBilling.depositOptions.operate.hint",
    icon: faRocket,
  },
];

function adaToLovelace(ada) {
  const parsed = Number(ada || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 1_000_000);
}

function lovelaceToAdaDisplay(lovelace) {
  const n = Number(lovelace || 0);
  return (n / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });
}

function formatWalletName(value) {
  if (!value || typeof value !== "string") return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getSessionWalletName(session, user) {
  return (
    session?.wallet_info?.wallet ||
    session?.wallet_info?.wallet_name ||
    session?.wallet_name ||
    user?.wallet_info?.wallet ||
    user?.wallet_info?.wallet_name ||
    user?.wallet_name ||
    ""
  );
}

function getSessionWalletAddress(session, user) {
  return (
    session?.wallet_info?.address ||
    session?.wallet_address ||
    user?.wallet_info?.address ||
    user?.wallet_address ||
    ""
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const outlet = useOutletContext() || {};
  const { user, setUser, showToast } = outlet;

  // IMPORTANT: do NOT pass the raw user into useAuthRequest (it can clobber session).
  const { authFetch, authRequest } = useAuthRequest({
    session: outlet.session,
    showToast,
  });
  const { handleUploads } = useLocalUpload();

  const [language, setLanguage] = useState(i18n.language.split("-")[0] || "en");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const [billingLoading, setBillingLoading] = useState(false);
  const [billingEntitlements, setBillingEntitlements] = useState([]);
  const [billingError, setBillingError] = useState("");
  const [creditBalance, setCreditBalance] = useState(null);
  const [selectedDepositAda, setSelectedDepositAda] = useState(10);
  const [customDepositAda, setCustomDepositAda] = useState("10");

  const [billingWalletName, setBillingWalletName] = useState("");
  const [billingWalletApi, setBillingWalletApi] = useState(null);
  const [billingWalletInfo, setBillingWalletInfo] = useState(null);
  const autoBillingWalletTriedRef = useRef(false);

  // Editing states
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);

  // Values
  const [newUsername, setNewUsername] = useState(user ? user.username : "");
  const [newDisplayName, setNewDisplayName] = useState(
    user ? user.display_name : "",
  );

  // Spinners
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [isSavingDisplayName, setIsSavingDisplayName] = useState(false);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const navigate = useNavigate();
  const avatarInputRef = useRef(null);
  const hasPremiumAccess = hasEntitlement(
    billingEntitlements,
    "cap_premium_access",
  );

  const effectiveDepositAda =
    customDepositAda !== "" ? Number(customDepositAda) : selectedDepositAda;

  const effectiveDepositLovelace = adaToLovelace(effectiveDepositAda);

  const usernameRef = useRef(null);
  const displayNameRef = useRef(null);

  // Close editors on outside click
  useOnClickOutside(usernameRef, () => {
    if (!editingUsername) return;
    if (newUsername && newUsername.trim() !== (user.username || "")) {
      handleUsernameSubmit();
    } else {
      setEditingUsername(false);
    }
  });

  useOnClickOutside(displayNameRef, () => {
    if (!editingDisplayName) return;
    if (newDisplayName && newDisplayName.trim() !== (user.display_name || "")) {
      handleDisplayNameSubmit();
    } else {
      setEditingDisplayName(false);
    }
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!user || !user.id || !outlet?.session?.access_token) navigate("/login");
  }, [user, outlet?.session, navigate]);

  // Keep editor inputs in sync if user changes (login/logout)
  useEffect(() => {
    setNewUsername(user?.username || "");
    setNewDisplayName(user?.display_name || "");
  }, [user?.username, user?.display_name]);

  // ---- Billing -------------------------------------------------------------

  const refreshBilling = async () => {
    if (!outlet?.session?.access_token) return;

    setBillingLoading(true);
    setBillingError("");

    try {
      const data = await fetchMyEntitlements(outlet.session);
      setBillingEntitlements(data?.entitlements || []);

      const balanceData = await fetchMyCreditBalance(outlet.session);
      setCreditBalance(balanceData?.balance || null);
    } catch (err) {
      console.error("[Settings] Billing status failed:", err);
      setBillingError(t("settingsBilling.errors.statusFailed"));
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    refreshBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outlet?.session?.access_token]);

  const detectWallets = () => {
    const w = window.cardano || {};
    const allowed = new Set(
      (SUPPORTED_WALLETS || []).map((x) => x.toLowerCase()),
    );

    return Object.keys(w)
      .map((key) => ({ key, norm: key.toLowerCase() }))
      .filter(({ norm }) => allowed.has(norm))
      .map(({ key, norm }) => ({ key, norm }))
      .sort((a, b) => a.norm.localeCompare(b.norm));
  };

  const connectBillingWallet = async (walletName, options = {}) => {
    const { silent = false } = options;
    setBillingError("");

    try {
      const w = window.cardano || {};
      const exactKey =
        Object.keys(w).find(
          (k) => k.toLowerCase() === walletName.toLowerCase(),
        ) || walletName;

      if (!w[exactKey]) {
        throw new Error("walletNotFound");
      }

      const api = await w[exactKey].enable();
      const info = await getWalletInfo(exactKey, api);

      setBillingWalletName(exactKey);
      setBillingWalletApi(api);
      setBillingWalletInfo(info);
      if (!silent) {
        showToast?.(
          t("settingsBilling.walletConnected", {
            wallet: formatWalletName(exactKey),
          }),
          "success",
        );
      }
    } catch (err) {
      console.error("[Settings] Billing wallet connect failed:", err);

      if (!silent) {
        setBillingError(t("settingsBilling.errors.walletConnectFailed"));
      }

      throw err;
    }
  };

  useEffect(() => {
    if (autoBillingWalletTriedRef.current) return;
    if (billingWalletApi) return;

    const sessionWallet = getSessionWalletName(outlet.session, user);
    const sessionAddress = getSessionWalletAddress(outlet.session, user);

    if (!sessionWallet) return;

    autoBillingWalletTriedRef.current = true;

    setBillingWalletName(sessionWallet);

    if (sessionAddress) {
      setBillingWalletInfo((prev) => ({
        ...(prev || {}),
        wallet: sessionWallet,
        address: sessionAddress,
      }));
    }

    connectBillingWallet(sessionWallet, { silent: true }).catch(() => {
      setBillingError(
        t("settingsBilling.errors.reconnectWalletForPayment", {
          wallet: formatWalletName(sessionWallet),
        }),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingWalletApi, outlet?.session?.access_token, user?.id]);

  const handleBillingPaid = async () => {
    await refreshBilling();
    showToast?.(t("settingsBilling.paymentVerified"), "success");
  };

  const handleOpenDepositModal = () => {
    if (!billingWalletApi) {
      setBillingError(t("settingsBilling.errors.walletConnectFailed"));
      return;
    }

    if (!effectiveDepositLovelace || effectiveDepositLovelace < 1_000_000) {
      setBillingError(t("settingsBilling.errors.depositTooSmall"));
      return;
    }

    setBillingError("");
    setShowDepositModal(true);
  };

  // ---- Helpers -------------------------------------------------------------

  function safeParse(json) {
    try {
      return json ? JSON.parse(json) : {};
    } catch {
      return {};
    }
  }

  // Local-only settings updater (no extra POST to /api/v1/user/{id})
  async function saveSettingsLocally(updated) {
    const current = safeParse(user?.settings) || {};
    const merged = { ...current, ...updated };

    setUser((prev) => ({
      ...prev,
      settings: JSON.stringify(merged),
      // mirror common top-level fields for convenience in UI
      avatar: updated.avatar ?? prev.avatar,
      username: updated.username ?? prev.username,
      display_name: updated.display_name ?? prev.display_name,
    }));

    showToast?.(t("settingsSaved"), "success");
  }

  function displayHeaderName(u) {
    return (u?.display_name || u?.username || u?.email || "").trim();
  }

  // ---- Avatar flow ---------------------------------------------------------
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSavingAvatar(true);

      const resized = await resizeImage(file);

      const uploadResult = await handleUploads([resized]);
      const avatarUrl = uploadResult?.[0]?.url;
      if (!avatarUrl) throw new Error("No upload URL returned");

      await saveSettingsLocally({ avatar: avatarUrl });
    } catch (err) {
      console.error(err);
      showToast?.(t("avatarUpdateFailed"), "danger");
    } finally {
      setIsSavingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  // ---- Language ------------------------------------------------------------
  const handleLanguageChange = (e) => {
    const selected = e.target.value;
    setLanguage(selected);
    localStorage.setItem("i18nextLng", selected);
    i18n.changeLanguage(selected);
  };

  // ---- Display name flow ---------------------------------------------------
  const handleDisplayNameSubmit = async () => {
    const trimmed = (newDisplayName || "").trim();
    const current = (user.display_name || "").trim();

    if (!trimmed || trimmed === current) {
      setEditingDisplayName(false);
      return;
    }

    if (!DISPLAY_NAME_REGEX.test(trimmed)) {
      showToast?.(t("invalidDisplayName"), "danger");
      return;
    }

    setIsSavingDisplayName(true);
    try {
      // Persist server-side
      const res = await authRequest
        .post("/api/v1/user/display_name")
        .send({ display_name: trimmed });

      const saved = res?.body?.display_name || trimmed;
      await saveSettingsLocally({ display_name: saved });
    } catch (e) {
      console.error(e);
      showToast?.(t("settingsFailed"), "danger");
    } finally {
      setIsSavingDisplayName(false);
      setEditingDisplayName(false);
    }
  };

  // ---- Username flow -------------------------------------------------------
  const handleUsernameSubmit = async () => {
    const trimmed = (newUsername || "").trim();
    const current = (user.username || "").trim();

    if (!trimmed || trimmed === current) {
      setEditingUsername(false);
      return;
    }

    if (!USERNAME_REGEX.test(trimmed)) {
      showToast?.(t("invalidUsername"), "danger");
      return;
    }

    setIsSavingUsername(true);
    try {
      // Optional server-side availability check
      const chk = await authRequest
        .post("/api/v1/user/validate_username")
        .send({ username: trimmed });

      if (chk?.body?.available === false) {
        if (chk?.body?.suggested) {
          showToast?.(
            t("usernameSuggested", { name: chk.body.suggested }),
            "info",
          );
        } else {
          showToast?.(t("usernameTaken"), "danger");
        }
        return;
      }

      // Persist server-side
      const res = await authRequest
        .post("/api/v1/user/username")
        .send({ username: trimmed });

      const saved = res?.body?.username || trimmed;
      await saveSettingsLocally({ username: saved });
    } catch (e) {
      console.error(e);
      showToast?.(t("settingsFailed"), "danger");
    } finally {
      setIsSavingUsername(false);
      setEditingUsername(false);
    }
  };

  // ---- Danger zone ---------------------------------------------------------
  const deleteAccount = async () => {
    if (!window.confirm(t("confirmAccountDeletion"))) return;
    setIsDeleting(true);
    try {
      const res = await authFetch(`/api/v1/user/${user.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        localStorage.clear();
        setUser(null);
        navigate("/login");
      } else {
        showToast?.(t("accountDeletionFailed"), "danger");
      }
    } catch {
      showToast?.(t("accountDeletionFailed"), "danger");
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Referral utils ------------------------------------------------------
  const encodeBase62 = (num) => {
    const ALPH =
      "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    if (num === 0) return ALPH[0];
    let out = "";
    let n = num;
    while (n > 0) {
      out = ALPH[n % 62] + out;
      n = Math.floor(n / 62);
    }
    return out;
  };

  const referralBase = `${window.location.origin}/signup?ref=`;
  const generateReferralLink = (userId) =>
    `${referralBase}${encodeBase62(Number(userId) || 0)}`;

  const copyReferralMessage = async () => {
    const link = generateReferralLink(user.id);
    const message = `${t("shareMessageIntro")}\n\n${link}\n\n${t("shareMessageOutro")}`;
    try {
      await navigator.clipboard.writeText(message);
      showToast?.(t("copiedToClipboard"), "success");
    } catch {
      showToast?.(t("copyFailed"), "danger");
    }
  };

  if (!user) return null;

  // ---- UI ------------------------------------------------------------------
  return (
    <div className="Settings-body">
      <Container className="Settings-container">
        <h2 className="Settings-title">{t("settings")}</h2>

        <div className="Settings-user-box">
          <Row className="align-items-center">
            <Col xs={4}>
              <div
                className="Settings-avatar-wrapper"
                onMouseEnter={() => setEditingAvatar(true)}
                onMouseLeave={() => setEditingAvatar(false)}
                onClick={() => avatarInputRef.current?.click()}
                title={t("tooltipAvatar")}
              >
                <Image
                  src={user.avatar || avatarImg}
                  alt="Avatar"
                  className="Settings-avatar-img"
                  onError={(e) => (e.currentTarget.src = avatarImg)}
                  roundedCircle
                  fluid
                />
                {isSavingAvatar ? (
                  <Spinner
                    animation="border"
                    size="sm"
                    className="Settings-avatar-icon"
                  />
                ) : (
                  editingAvatar && (
                    <FontAwesomeIcon
                      icon={faUpload}
                      className="Settings-avatar-icon"
                    />
                  )
                )}
                <input
                  type="file"
                  ref={avatarInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handleAvatarChange}
                />
              </div>
            </Col>

            <Col xs={8}>
              {/* Display name (primary) */}
              <div
                className="Settings-name-row"
                ref={displayNameRef}
                title={t("tooltipDisplayName")}
              >
                {editingDisplayName ? (
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleDisplayNameSubmit();
                      if (e.key === "Escape") {
                        setNewDisplayName(user.display_name || "");
                        setEditingDisplayName(false);
                      }
                    }}
                    autoFocus
                    className="Settings-inline-input"
                  />
                ) : (
                  <div
                    className="Settings-editable-line"
                    onClick={() => setEditingDisplayName(true)}
                  >
                    <span className="Settings-primary-name">
                      {user.display_name || displayHeaderName(user)}
                    </span>
                    {isSavingDisplayName ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <FontAwesomeIcon
                        icon={faPen}
                        className="Settings-username-icon"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Username (secondary) */}
              <div
                className="Settings-handle-row"
                ref={usernameRef}
                title={t("tooltipUsername")}
              >
                {editingUsername ? (
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUsernameSubmit();
                      if (e.key === "Escape") {
                        setNewUsername(user.username || "");
                        setEditingUsername(false);
                      }
                    }}
                    className="Settings-inline-input"
                  />
                ) : (
                  <div
                    className="Settings-editable-line"
                    onClick={() => setEditingUsername(true)}
                  >
                    <span className="Settings-secondary-handle">
                      @
                      {user.username ||
                        (user.email ? user.email.split("@")[0] : "")}
                    </span>
                    {isSavingUsername ? (
                      <Spinner animation="border" size="sm" />
                    ) : (
                      <FontAwesomeIcon
                        icon={faPen}
                        className="Settings-username-icon"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* Email */}
              <p className="Settings-username-wallet mb-1">
                {user.email || ""}
              </p>

              <small className="Settings-referral-row">
                {t("referralLink")}:
                <div>
                  <a
                    href={generateReferralLink(user.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="Settings-referral-link"
                  >
                    {generateReferralLink(user.id)}
                  </a>
                </div>
                <div className="Settings-referral-buttons">
                  <Button
                    size="sm"
                    variant="outline-light"
                    onClick={copyReferralMessage}
                  >
                    <FontAwesomeIcon icon={faCopy} className="Settings-icon" />
                    {t("copyLink")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-light"
                    onClick={() => setShowShareModal(true)}
                  >
                    <FontAwesomeIcon
                      icon={faShareAlt}
                      className="Settings-icon"
                    />
                    {t("share")}
                  </Button>
                </div>
              </small>
            </Col>
          </Row>
        </div>

        <Form onSubmit={(e) => e.preventDefault()}>
          <Form.Group
            controlId="languageSelect"
            className="mb-3 Settings-language"
          >
            <Form.Label>{t("languageConf")}</Form.Label>
            <Form.Select value={language} onChange={handleLanguageChange}>
              <option value="en">🇺🇸 English (US)</option>
              <option value="pt">🇧🇷 Português (BR)</option>
            </Form.Select>
          </Form.Group>
        </Form>

        <div className="mt-4 p-3 Settings-billing-zone">
          <div className="Settings-billing-header">
            <div>
              <h5 className="Settings-section-title">
                {t("settingsBilling.title")}
              </h5>
              <p className="Settings-section-subtitle">
                {t("settingsBilling.subtitle")}
              </p>
            </div>

            <div
              className={
                hasPremiumAccess
                  ? "Settings-billing-status is-active"
                  : "Settings-billing-status"
              }
            >
              {billingLoading
                ? t("settingsBilling.status.loading")
                : hasPremiumAccess
                  ? t("settingsBilling.status.premium")
                  : t("settingsBilling.status.free")}
            </div>
          </div>

          <div className="Settings-billing-card">
            <div>
              <div className="Settings-billing-plan">
                {t("settingsBilling.premiumPlan")}
              </div>
              <div className="Settings-billing-copy">
                {t("settingsBilling.premiumDescription")}
              </div>
            </div>

            <Button
              size="sm"
              variant={hasPremiumAccess ? "outline-light" : "primary"}
              onClick={() => setShowPaymentModal(true)}
              disabled={!billingWalletApi}
            >
              {hasPremiumAccess
                ? t("settingsBilling.extendAccess")
                : t("settingsBilling.activateAccess")}
            </Button>
          </div>

          <div className="Settings-billing-card Settings-billing-credit-card">
            <div className="Settings-billing-credit-main">
              <div className="Settings-billing-plan">
                {t("settingsBilling.prepaidTitle")}
              </div>
              <div className="Settings-billing-balance">
                {lovelaceToAdaDisplay(
                  creditBalance?.balance_lovelace ||
                    creditBalance?.balance ||
                    0,
                )}{" "}
                ₳DA
              </div>
              <div className="Settings-billing-copy">
                {t("settingsBilling.prepaidDescription")}
              </div>
            </div>

            <div className="Settings-deposit-panel">
              <div className="Settings-deposit-options">
                {DEPOSIT_OPTIONS_ADA.map((option) => (
                  <button
                    key={option.amount}
                    type="button"
                    className={
                      Number(customDepositAda || selectedDepositAda) ===
                      option.amount
                        ? "Settings-deposit-chip is-selected"
                        : "Settings-deposit-chip"
                    }
                    title={t(option.hintKey)}
                    onClick={() => {
                      setSelectedDepositAda(option.amount);
                      setCustomDepositAda(String(option.amount));
                    }}
                  >
                    <FontAwesomeIcon
                      icon={option.icon}
                      className="Settings-deposit-chip-icon"
                    />
                    <span className="Settings-deposit-chip-amount">
                      {option.amount} ₳
                    </span>
                    <span className="Settings-deposit-chip-label">
                      {t(option.labelKey)}
                    </span>
                  </button>
                ))}
              </div>

              <div className="Settings-deposit-custom-row">
                <Form.Control
                  type="number"
                  min="1"
                  step="1"
                  value={customDepositAda}
                  placeholder={t("settingsBilling.customDepositPlaceholder")}
                  onChange={(e) => setCustomDepositAda(e.target.value)}
                  className="Settings-deposit-custom-input"
                />

                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleOpenDepositModal}
                  disabled={!billingWalletApi || !effectiveDepositLovelace}
                >
                  {t("settingsBilling.addBalance")}
                </Button>
              </div>

              <div className="Settings-billing-hint">
                {t("settingsBilling.prepaidHint")}
              </div>
            </div>
          </div>

          <div className="Settings-billing-wallets">
            <div className="Settings-billing-wallet-title">
              {billingWalletApi
                ? t("settingsBilling.connectedWallet", {
                    wallet: formatWalletName(billingWalletName),
                  })
                : t("settingsBilling.connectWallet")}
            </div>

            {billingWalletInfo?.address ? (
              <div className="Settings-billing-address">
                {billingWalletInfo.address}
              </div>
            ) : null}

            <div className="Settings-billing-wallet-row">
              {detectWallets().map(({ key, norm }) => (
                <Button
                  key={formatWalletName(key)}
                  size="sm"
                  variant="outline-light"
                  className="Settings-billing-wallet-btn"
                  onClick={() => connectBillingWallet(key)}
                >
                  {WALLET_ICONS[norm] ? (
                    <img
                      src={WALLET_ICONS[norm]}
                      alt=""
                      className="Settings-billing-wallet-icon"
                    />
                  ) : null}
                  {formatWalletName(key)}
                </Button>
              ))}
            </div>

            {!billingWalletApi ? (
              <div className="Settings-billing-hint">
                {t("settingsBilling.connectHint")}
              </div>
            ) : null}

            {billingError ? (
              <div className="Settings-billing-error">{billingError}</div>
            ) : null}
          </div>

          <div className="Settings-billing-future">
            <span>{t("settingsBilling.futureDonations")}</span>
            <span>{t("settingsBilling.futurePayg")}</span>
            <span>{t("settingsBilling.futureAutoRenew")}</span>
            <span>{t("settingsBilling.futurePlanControls")}</span>
          </div>
        </div>

        <div className="mt-4 p-3 Settings-danger-zone">
          <h5 className="text-danger">{t("dangerZone")}</h5>
          <Button
            variant="danger"
            onClick={deleteAccount}
            disabled={isDeleting}
          >
            <FontAwesomeIcon icon={faTrash} className="me-2" />
            {isDeleting ? t("deleting") : t("deleteAccount")}
          </Button>
        </div>
      </Container>

      <CardanoPaymentModal
        show={showPaymentModal}
        onHide={() => setShowPaymentModal(false)}
        session={outlet.session}
        walletName={billingWalletName}
        walletApi={billingWalletApi}
        onPaid={handleBillingPaid}
      />

      <CardanoPaymentModal
        show={showDepositModal}
        onHide={() => setShowDepositModal(false)}
        session={outlet.session}
        walletName={billingWalletName}
        walletApi={billingWalletApi}
        onPaid={handleBillingPaid}
        paymentKind="credit_deposit"
        amountLovelace={effectiveDepositLovelace}
      />

      <ShareModal
        show={showShareModal}
        onHide={() => setShowShareModal(false)}
        title={t("shareMessageIntro")}
        hashtags={t("shareMessageOutro")
          .split(/\s+/)
          .map((tag) => tag.replace(/^#/, ""))}
        link={generateReferralLink(user.id)}
        message={`${t("shareMessageIntro")}\n\n${generateReferralLink(user.id)}\n\n${t("shareMessageOutro")}`}
      />
    </div>
  );
}
