import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Spinner from "react-bootstrap/Spinner";

import {
  buildSignSubmitPaymentTx,
  getWalletLovelaceBalance,
  lovelaceToAda,
} from "../../cardano/payment";
import {
  createCardanoPaymentSession,
  fetchBillingPlans,
  verifyCardanoPayment,
} from "../../billing/api";
import { getWalletInfo } from "../../cardano/utils";
import { WALLET_ICONS } from "../../cardano/constants";
import "../../styles/CardanoPaymentModal.css";
import {
  formatBillingAmountFromMinor,
  formatBillingCurrencyCode,
  formatBillingNetworkLabel,
} from "../../billing/currency";

function formatWalletName(value) {
  if (!value || typeof value !== "string") return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function compactAddress(value) {
  if (!value || value.length <= 24) return value || "";
  return `${value.slice(0, 12)}...${value.slice(-10)}`;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isVerificationPendingError(err) {
  const detail = err?.detail;
  const code =
    err?.code ||
    detail?.code ||
    (typeof detail === "string" ? detail : null) ||
    err?.message;

  return code === "txNotFound";
}

function isPendingVerificationResult(result) {
  return result?.status === "pending_verification" || result?.code === "txNotFound";
}

async function verifyCardanoPaymentWithRetry({
  session,
  paymentSessionId,
  txHash,
  attempts = 12,
  delayMs = 5000,
}) {
  let lastError = null;

  for (let i = 0; i < attempts; i += 1) {
    try {
      const result = await verifyCardanoPayment(session, paymentSessionId, txHash);

      if (!isPendingVerificationResult(result)) {
        return result;
      }

      lastError = new Error("txNotFound");
      lastError.code = "txNotFound";
      lastError.detail = {
        code: "txNotFound",
        received_lovelace: result?.received_lovelace || 0,
        expected_lovelace: result?.expected_lovelace,
      };

      if (i === attempts - 1) {
        throw lastError;
      }

      await sleep(delayMs);
    } catch (err) {
      lastError = err;

      if (!isVerificationPendingError(err) || i === attempts - 1) {
        throw err;
      }

      await sleep(delayMs);
    }
  }

  throw lastError || new Error("paymentVerificationFailed");
}

function getPlanList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.plans)) return data.plans;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function getPlanPreview(data, planCode) {
  const plan = getPlanList(data).find((item) => item?.code === planCode);
  const prices = plan?.prices || plan?.billing_prices || [];
  const price =
    prices.find((item) => item?.active !== false && item?.network === "mainnet") ||
    prices.find((item) => item?.active !== false) ||
    prices[0] ||
    plan?.price ||
    null;

  const amount =
    price?.amount ??
    price?.amount_lovelace ??
    plan?.amount ??
    plan?.amount_lovelace ??
    null;

  const durationDays =
    price?.duration_days ??
    plan?.duration_days ??
    30;

  return {
    plan,
    price,
    amount,
    durationDays,
    network: price?.network || plan?.network || "mainnet",
    currency: price?.currency || plan?.currency || "lovelace",
  };
}

function getErrorMessage(t, err) {
  const detail = err?.detail;
  const code =
    err?.code ||
    detail?.code ||
    (typeof detail === "string" ? detail : null) ||
    err?.message ||
    "paymentFailed";

  return t(`billing.errors.${code}`, {
    defaultValue: t("billing.errors.paymentFailed"),
    balance: err?.balanceLovelace
      ? formatBillingAmountFromMinor(err.balanceLovelace, { currency: "lovelace" })
      : undefined,
    required: err?.requiredLovelace
      ? formatBillingAmountFromMinor(err.requiredLovelace, { currency: "lovelace" })
      : undefined,
  });
}

export default function CardanoPaymentModal({
  show,
  onHide,
  session,
  walletName,
  walletApi,
  onPaid,
  planCode = "cap_premium_access",
  paymentKind = "plan_purchase",
  amountLovelace = null,
}) {
  const { t } = useTranslation();

  const [planPreview, setPlanPreview] = useState(null);
  const [catalogNetwork, setCatalogNetwork] = useState("");
  const [paymentSession, setPaymentSession] = useState(null);
  const [walletBalance, setWalletBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const walletKey = (walletName || "").toLowerCase();
  const displayWalletName = formatWalletName(walletName);
  const walletIcon = WALLET_ICONS[walletKey];

  const isDepositPayment = paymentKind === "credit_deposit";
  const isSupportPayment = paymentKind === "support_contribution";

  const resolvedAmountLovelace =
    isDepositPayment || isSupportPayment
      ? amountLovelace
      : planPreview?.amount;

  const amountLovelaceToPay = paymentSession?.amount ?? resolvedAmountLovelace ?? null;
  const amountAda = amountLovelaceToPay ? lovelaceToAda(amountLovelaceToPay) : null;
  const paymentCurrency =
    paymentSession?.currency ||
    planPreview?.currency ||
    "lovelace";
  const paymentCurrencyCode = formatBillingCurrencyCode(paymentCurrency);
  const durationDays = paymentSession?.duration_days || planPreview?.durationDays || 30;
  const network =
    paymentSession?.network ||
    planPreview?.network ||
    catalogNetwork ||
    "mainnet";

  const canPay = useMemo(
    () => Boolean(session?.access_token && walletName && walletApi),
    [session, walletName, walletApi],
  );

  const balanceLovelace = walletBalance?.lovelace
    ? BigInt(walletBalance.lovelace)
    : null;

  const requiredLovelace = amountLovelaceToPay
    ? BigInt(amountLovelaceToPay) + 500000n
    : null;

  const hasInsufficientBalance =
    balanceLovelace !== null &&
    requiredLovelace !== null &&
    balanceLovelace < requiredLovelace;

  const busy = ["creating_session", "building_transaction", "verifying"].includes(status);

  const statusLabel = useMemo(() => {
    if (status === "creating_session") return t("billing.status.creatingSession");
    if (status === "building_transaction") return t("billing.status.buildingTransaction");
    if (status === "verifying") return t("billing.status.verifying");
    if (status === "paid") return t("billing.status.paid");
    if (status === "error") return t("billing.status.error");
    return t("billing.status.ready");
  }, [status, t]);

  const refreshPlanPreview = useCallback(async () => {
    try {
      const data = await fetchBillingPlans();
      setCatalogNetwork(data?.network || "");

      if (isDepositPayment || isSupportPayment) {
        setPlanPreview(null);
        return;
      }

      const preview = getPlanPreview(data, planCode);
      setPlanPreview(preview);
    } catch (err) {
      console.error("[Billing] Failed to load billing plans:", err);
    }
  }, [isDepositPayment, isSupportPayment, planCode]);

  const refreshWalletBalance = useCallback(async () => {
    if (!walletApi) {
      setWalletBalance(null);
      return;
    }

    setBalanceLoading(true);

    try {
      const balance = await getWalletLovelaceBalance(walletApi);
      setWalletBalance(balance);
    } catch (err) {
      console.error("[Billing] Failed to read wallet balance:", err);
      setWalletBalance({
        available: false,
        error: err?.code || "walletBalanceUnavailable",
      });
    } finally {
      setBalanceLoading(false);
    }
  }, [walletApi]);

  useEffect(() => {
    if (!show) return;
    refreshPlanPreview();
  }, [refreshPlanPreview, show]);

  useEffect(() => {
    if (!show) return;
    refreshWalletBalance();
  }, [refreshWalletBalance, show]);

  useEffect(() => {
    if (!show) return;

    if (hasInsufficientBalance) {
      setError(t("billing.errors.insufficientWalletBalance", {
        balance: formatBillingAmountFromMinor(balanceLovelace, { currency: paymentCurrency }),
        required: formatBillingAmountFromMinor(requiredLovelace, { currency: paymentCurrency }),
      }));
    } else if (error === t("billing.errors.insufficientWalletBalance", {
      balance: walletBalance?.ada || "0",
      required: amountAda || "0",
    })) {
      setError("");
    }
  }, [
    amountAda,
    balanceLovelace,
    error,
    hasInsufficientBalance,
    requiredLovelace,
    show,
    t,
    walletBalance?.ada,
  ]);

  const reset = useCallback(() => {
    setPaymentSession(null);
    setStatus("idle");
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onHide?.();
  }, [onHide, reset]);

  const handlePay = useCallback(async () => {
    if (!canPay) {
      setError(t("billing.errors.walletRequired"));
      return;
    }

    if (hasInsufficientBalance) {
      setError(t("billing.errors.insufficientWalletBalance", {
        balance: walletBalance?.lovelace
          ? formatBillingAmountFromMinor(walletBalance.lovelace, { currency: paymentCurrency })
          : formatBillingAmountFromMinor(0, { currency: paymentCurrency }),
        required: requiredLovelace
          ? formatBillingAmountFromMinor(requiredLovelace, { currency: paymentCurrency })
          : amountAda || "0",
      }));
      return;
    }

    setError("");

    try {
      setStatus("creating_session");
      const created = await createCardanoPaymentSession(session, {
        kind: paymentKind,
        planCode,
        amountLovelace: amountLovelaceToPay,
      });
      setPaymentSession(created);

      setStatus("building_transaction");
      const walletInfo = await getWalletInfo(walletName, walletApi);

      if (!walletInfo?.addressHex) {
        throw new Error("walletChangeAddressMissing");
      }

      const { txHash } = await buildSignSubmitPaymentTx({
        walletApi,
        paymentAddress: created.payment_address,
        amountLovelace: created.amount,
        changeAddressHex: walletInfo.addressHex,
      });

      setStatus("verifying");
      const verified = await verifyCardanoPaymentWithRetry({
        session,
        paymentSessionId: created.session_id,
        txHash,
      });

      setStatus("paid");
      await refreshWalletBalance();
      onPaid?.(verified);
    } catch (err) {
      console.error("[Billing] Cardano payment failed:", err);
      setError(getErrorMessage(t, err));
      setStatus("error");
      refreshWalletBalance();
    }
  }, [
    amountAda,
    canPay,
    hasInsufficientBalance,
    onPaid,
    amountLovelaceToPay,
    paymentKind,
    planCode,
    refreshWalletBalance,
    requiredLovelace,
    session,
    t,
    walletApi,
    walletBalance?.ada,
    walletName,
  ]);

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      dialogClassName="CardanoPaymentModal-dialog"
      contentClassName="CardanoPaymentModal-content"
    >
      <Modal.Header closeButton>
        <div className="CardanoPaymentModal-headerText">
          <div className="CardanoPaymentModal-eyebrow">
            {isSupportPayment
              ? t("billing.modal.supportEyebrow")
              : isDepositPayment
                ? t("billing.modal.depositEyebrow")
                : t("billing.modal.eyebrow")}
          </div>
          <Modal.Title>
            {isSupportPayment
              ? t("billing.modal.supportTitle")
              : isDepositPayment
                ? t("billing.modal.depositTitle")
                : t("billing.modal.title")}
          </Modal.Title>
          <div className="CardanoPaymentModal-subtitle">
            {isSupportPayment
              ? t("billing.modal.supportSubtitle")
              : isDepositPayment
                ? t("billing.modal.depositSubtitle")
                : t("billing.modal.subtitle")}
          </div>
        </div>
      </Modal.Header>

      <Modal.Body className="CardanoPaymentModal-body">
        <div className="CardanoPaymentModal-hero">
          <div>
            <div className="CardanoPaymentModal-planName">
              {isSupportPayment
                ? t("billing.modal.supportPlanName")
                : isDepositPayment
                  ? t("billing.modal.depositPlanName")
                  : t("billing.plans.capPremiumAccess")}
            </div>
            <div className="CardanoPaymentModal-price">
              {amountAda ? (
                <>
                  <span>{amountAda}</span>
                  <small>{paymentCurrencyCode}</small>
                </>
              ) : (
                <span>{t("billing.modal.loadingPrice")}</span>
              )}
            </div>
            <div className="CardanoPaymentModal-priceMeta">
              {isSupportPayment
                ? t("billing.modal.supportMeta")
                : isDepositPayment
                  ? t("billing.modal.prepaidCreditMeta")
                  : t("billing.modal.durationDays", { count: durationDays })} · {formatBillingNetworkLabel(network)}
            </div>
          </div>

          <div className="CardanoPaymentModal-statusPill" data-status={status}>
            {busy ? <Spinner size="sm" /> : null}
            <span>{statusLabel}</span>
          </div>
        </div>

        <div className="CardanoPaymentModal-benefits">
          {isSupportPayment ? (
            <>
              <div>{t("billing.modal.benefits.supportOpenInfrastructure")}</div>
              <div>{t("billing.modal.benefits.supportKnowledgeGraphs")}</div>
              <div>{t("billing.modal.benefits.walletNative")}</div>
            </>
          ) : isDepositPayment ? (
            <>
              <div>{t("billing.modal.benefits.prepaidRenewals")}</div>
              <div>{t("billing.modal.benefits.payAsYouGoReady")}</div>
              <div>{t("billing.modal.benefits.walletNative")}</div>
            </>
          ) : (
            <>
              <div>{t("billing.modal.benefits.unlimitedQueries")}</div>
              <div>{t("billing.modal.benefits.premiumAnalytics")}</div>
              <div>{t("billing.modal.benefits.walletNative")}</div>
            </>
          )}
        </div>

        <div className="CardanoPaymentModal-walletCard">
          <div className="CardanoPaymentModal-walletLeft">
            <div className="CardanoPaymentModal-walletIconWrap">
              {walletIcon ? (
                <img src={walletIcon} alt="" className="CardanoPaymentModal-walletIcon" />
              ) : (
                <span>{displayWalletName ? displayWalletName.slice(0, 1) : "W"}</span>
              )}
            </div>

            <div className="CardanoPaymentModal-walletCopy">
              <div className="CardanoPaymentModal-walletName">
                {displayWalletName || t("billing.modal.noWallet")}
              </div>
              <div className="CardanoPaymentModal-walletSub">
                {balanceLoading
                  ? t("billing.modal.balanceLoading")
                  : walletBalance?.available === false
                    ? t("billing.errors.walletBalanceUnavailable")
                    : walletBalance
                      ? t("billing.modal.walletBalance", {
                          balance: walletBalance.ada,
                        })
                      : t("billing.modal.connectWalletToSeeBalance")}
              </div>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline-light"
            onClick={refreshWalletBalance}
            disabled={!walletApi || balanceLoading || busy}
          >
            {t("billing.actions.refresh")}
          </Button>
        </div>

        {paymentSession?.payment_address ? (
          <div className="CardanoPaymentModal-details">
            <div className="CardanoPaymentModal-detailLabel">
              {t("billing.modal.paymentAddress")}
            </div>
            <div title={paymentSession.payment_address} className="CardanoPaymentModal-address">
              {compactAddress(paymentSession.payment_address)}
            </div>
          </div>
        ) : null}

        {!canPay ? (
          <div className="CardanoPaymentModal-warning">
            {t("billing.errors.walletRequired")}
          </div>
        ) : null}

        {error ? (
          <div className="CardanoPaymentModal-error">
            {error}
          </div>
        ) : null}

        {status === "paid" ? (
          <div className="CardanoPaymentModal-success">
            {t("billing.modal.success")}
          </div>
        ) : null}

        <div className="CardanoPaymentModal-note">
          {isSupportPayment ? t("billing.modal.supportNote") : t("billing.modal.note")}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={busy}>
          {status === "paid" ? t("billing.actions.done") : t("billing.actions.close")}
        </Button>

        <Button
          variant="primary"
          onClick={handlePay}
          disabled={!canPay || busy || status === "paid" || hasInsufficientBalance || !amountLovelaceToPay}
          className="CardanoPaymentModal-payButton"
        >
          {busy ? (
            <>
              <Spinner size="sm" className="me-2" />
              {t("billing.actions.processing")}
            </>
          ) : (
            t("billing.actions.payWithAda")
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
