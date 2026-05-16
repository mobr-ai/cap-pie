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
 * - Buttons styled like the Google OAuth option
 */
export default function CardanoWalletLogin({ onLogin, showToast }) {
  const { t } = useTranslation();
  const [availableWallets, setAvailableWallets] = useState([]);
  const scanningRef = useRef(false);

  // normalize helpers
  const lower = (s) => (typeof s === "string" ? s.toLowerCase() : s);
  const ALLOWED = useRef(new Set((SUPPORTED_WALLETS || []).map(lower)));

  // Build a stable list from window.cardano (case-insensitive)
  const detectAvailable = useCallback(() => {
    const w = window.cardano || {};
    const keys = Object.keys(w);

    // map the real keys → lowercase → keep if in ALLOWED
    const present = keys
      .map((k) => ({ raw: k, norm: lower(k) }))
      .filter(({ norm }) => ALLOWED.current.has(norm))
      .map(({ norm }) => norm);

    // make unique, stable & sorted for consistency
    const unique = Array.from(new Set(present)).sort();

    return unique;
  }, []);

  // Set state only when it actually changes (stringify compare avoids flicker)
  const updateWallets = useCallback(() => {
    const found = detectAvailable();
    setAvailableWallets((prev) => {
      if (JSON.stringify(prev) === JSON.stringify(found)) return prev;
      return found;
    });
  }, [detectAvailable]);

  // Persistent detection:
  // - immediate
  // - cardano#initialized event
  // - focus / visibilitychange
  // - DOMContentLoaded / load (and a grace re-check after load)
  // - polling every 500ms while mounted
  useEffect(() => {
    if (scanningRef.current) return;
    scanningRef.current = true;

    const onUpdate = () => updateWallets();

    // 1) immediate
    // microtask + rAF to avoid early first-paint races
    queueMicrotask(onUpdate);
    requestAnimationFrame(onUpdate);

    // 2) wallet init event (Lace/Nami emit this)
    window.addEventListener("cardano#initialized", onUpdate);

    // 3) doc lifecycle
    const onDom = onUpdate;
    const onLoad = () => {
      onUpdate();
      setTimeout(onUpdate, 1000); // grace re-check post-load
    };
    if (document.readyState === "complete") {
      onLoad();
    } else {
      document.addEventListener("DOMContentLoaded", onDom, { once: true });
      window.addEventListener("load", onLoad, { once: true });
    }

    // 4) visibility / focus (extensions may init when tab is activated)
    window.addEventListener("focus", onUpdate);
    const onVis = () => document.visibilityState === "visible" && onUpdate();
    document.addEventListener("visibilitychange", onVis);

    // 5) persistent polling (every 500ms) until unmount
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
      // walletName here is lowercased; window.cardano keys might be mixed-case.
      // Prefer the exact key from window.cardano if it exists.
      const w = window.cardano || {};
      const exactKey =
        Object.keys(w).find((k) => k.toLowerCase() === walletName) ||
        walletName;

      const api = await w[exactKey].enable();
      const walletInfo = await getWalletInfo(exactKey, api);

      const res = await fetch("/api/v1/auth/cardano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: walletInfo.address,
          wallet_info: walletInfo,
          remember_me: true,
        }),
      });

      if (!res.ok) {
        let errText = "";
        try {
          errText = await res.text();
        } catch {}
        throw new Error(errText || `Auth failed (${res.status})`);
      }

      const data = await res.json();
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
