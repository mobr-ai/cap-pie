// src/components/wallet/CardanoWalletLogin.jsx
import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import Button from "react-bootstrap/Button";
import "../../styles/AuthPage.css";
import { getWalletInfo } from "../../cardano/utils";
import { SUPPORTED_WALLETS, WALLET_ICONS } from "../../cardano/constants";

/**
 * Wallet login (button-per-wallet style)
 * - Robust, case-insensitive detection from window.cardano
 * - Persistent re-scan (covers late injections without route changes)
 * - Uses signed CIP-30 / CIP-8 challenge verification
 */
export default function CardanoWalletLogin({ onLogin, showToast }) {
  const { t } = useTranslation();
  const [availableWallets, setAvailableWallets] = useState([]);
  const scanningRef = useRef(false);

  const lower = (s) => (typeof s === "string" ? s.toLowerCase() : s);
  const ALLOWED = useRef(new Set((SUPPORTED_WALLETS || []).map(lower)));

  const detectAvailable = useCallback(() => {
    const w = window.cardano || {};
    const keys = Object.keys(w);

    const present = keys
      .map((k) => ({ raw: k, norm: lower(k) }))
      .filter(({ norm }) => ALLOWED.current.has(norm))
      .map(({ norm }) => norm);

    return Array.from(new Set(present)).sort();
  }, []);

  const updateWallets = useCallback(() => {
    const found = detectAvailable();
    setAvailableWallets((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(found)) return prev;
      return found;
    });
  }, [detectAvailable]);

  useEffect(() => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    const onUpdate = () => updateWallets();

    queueMicrotask(onUpdate);
    requestAnimationFrame(onUpdate);

    window.addEventListener("cardano#initialized", onUpdate);

    const onDom = onUpdate;
    const onLoad = () => {
      onUpdate();
      setTimeout(onUpdate, 1000);
    };

    if (document.readyState === "complete") {
      onLoad();
    } else {
      document.addEventListener("DOMContentLoaded", onDom, { once: true });
      window.addEventListener("load", onLoad, { once: true });
    }

    window.addEventListener("focus", onUpdate);
    const onVis = () => document.visibilityState === "visible" && onUpdate();
    document.addEventListener("visibilitychange", onVis);

    const poll = setInterval(onUpdate, 500);

    return () => {
      clearInterval(poll);
      window.removeEventListener("cardano#initialized", onUpdate);
      window.removeEventListener("focus", onUpdate);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("DOMContentLoaded", onDom);
      window.removeEventListener("load", onLoad);
      scanningRef.current = false;
    };
  }, [updateWallets]);

  const handleConnect = async (walletName) => {
    try {
      const w = window.cardano || {};
      const exactKey =
        Object.keys(w).find((k) => k.toLowerCase() === walletName) ||
        walletName;

      if (!w[exactKey]) {
        throw new Error(`Wallet provider not found: ${walletName}`);
      }

      const api = await w[exactKey].enable();
      const walletInfo = await getWalletInfo(exactKey, api);

      if (!walletInfo?.address) {
        throw new Error("Wallet did not return a usable Cardano address");
      }

      if (!walletInfo?.addressHex) {
        throw new Error("Wallet did not return a hex Cardano address for signData");
      }

      if (typeof api.signData !== "function") {
        throw new Error("This wallet does not support CIP-30 signData");
      }

      const challengeRes = await fetch("/api/v1/auth/cardano/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletInfo.address,
          address_hex: walletInfo.addressHex,
          wallet_name: exactKey,
          network_id: walletInfo.networkId,
        }),
      });

      if (!challengeRes.ok) {
        let errText = "";
        try {
          errText = await challengeRes.text();
        } catch {}
        throw new Error(errText || `Challenge failed (${challengeRes.status})`);
      }

      const challenge = await challengeRes.json();

      if (!challenge?.challenge_id || !challenge?.message || !challenge?.message_hex) {
        throw new Error("Invalid Cardano auth challenge response");
      }

      const signed = await api.signData(walletInfo.addressHex, challenge.message_hex);

      if (!signed?.signature || !signed?.key) {
        throw new Error("Wallet did not return a valid signature payload");
      }

      const verifyRes = await fetch("/api/v1/auth/cardano/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletInfo.address,
          address_hex: walletInfo.addressHex,
          challenge_id: challenge.challenge_id,
          message: challenge.message,
          signature: signed.signature,
          key: signed.key,
          wallet_name: exactKey,
          remember_me: true,
        }),
      });

      if (!verifyRes.ok) {
        let errText = "";
        try {
          errText = await verifyRes.text();
        } catch {}
        throw new Error(errText || `Auth failed (${verifyRes.status})`);
      }

      const data = await verifyRes.json();

      if (data?.access_token) {
        onLogin?.({ ...data, wallet_info: walletInfo });
        showToast?.(t("walletLoginSuccess"), "success");
        return;
      }

      if (data?.status === "pending_confirmation") {
        const uid = data?.id;
        const wallet = data?.wallet_address;

        if (uid && wallet) {
          window.location.href =
            `/signup?state=wallet` +
            `&uid=${encodeURIComponent(uid)}` +
            `&wallet=${encodeURIComponent(wallet)}`;
          return;
        }

        showToast?.(t("walletPendingApproval"), "secondary");
        return;
      }

      showToast?.(t("loginError"), "danger");
    } catch (err) {
      console.error("Cardano Auth Error:", err);
      showToast?.(t("loginError"), "danger");
    }
  };

  return (
    <div className="Auth-oauth-wallets">
      {availableWallets.length > 0 ? (
        <>
          {availableWallets.map((wallet) => (
            <Button
              key={wallet}
              variant="outline-secondary"
              size="md"
              onClick={() => handleConnect(wallet)}
              className="Auth-oauth-button"
            >
              <img
                src={WALLET_ICONS[wallet] || WALLET_ICONS[wallet.toLowerCase()]}
                alt={wallet}
                className="Auth-oauth-logo"
              />
              {t("connectWallet", { wallet })}
            </Button>
          ))}
        </>
      ) : (
        <div style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
          <Trans
            i18nKey="walletNotFound"
            components={{
              nami: (
                <a
                  className="Auth-wallet-link"
                  href="https://namiwallet.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
              lace: (
                <a
                  className="Auth-wallet-link"
                  href="https://lace.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
              flint: (
                <a
                  className="Auth-wallet-link"
                  href="https://flint-wallet.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
              eternl: (
                <a
                  className="Auth-wallet-link"
                  href="https://eternl.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
            }}
          />
        </div>
      )}
    </div>
  );
}
