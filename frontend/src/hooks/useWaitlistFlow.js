// src/hooks/useWaitlistFlow.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postWaitlist } from "../utils/waitlistClient";
import {
  getUidStorageKey,
  getWalletStorageKey,
  isClaimedLocally,
  markClaimed,
} from "../utils/waitlistStorage";

export function useWaitlistFlow({ flow }) {
  const {
    state,
    uid,
    wallet,
    ref,
    prefillEmail,
    isWalletFlow,
    isEmailRedirectFlow,
  } = flow;

  const walletStorageKey = useMemo(() => getWalletStorageKey(wallet), [wallet]);
  const uidStorageKey = useMemo(() => getUidStorageKey(uid), [uid]);

  const [email, setEmail] = useState(prefillEmail || "");
  const [submitted, setSubmitted] = useState(false);

  // result: "success" | "already" | "error" | null
  const [result, setResult] = useState(null);
  const [errorKey, setErrorKey] = useState(null);

  const inFlightRef = useRef(false);
  const didAutoSubmitRef = useRef(false);

  const applySuccess = useCallback(
    (emailUsed) => {
      setSubmitted(true);
      setResult("success");
      setErrorKey(null);

      if (isWalletFlow) {
        markClaimed({
          walletStorageKey,
          uidStorageKey,
          uid,
          wallet,
          email: emailUsed,
        });
      }
    },
    [isWalletFlow, walletStorageKey, uidStorageKey, uid, wallet],
  );

  const applyAlready = useCallback(
    (emailUsed) => {
      setSubmitted(true);
      setResult("already");
      setErrorKey(null);

      if (isWalletFlow) {
        markClaimed({
          walletStorageKey,
          uidStorageKey,
          uid,
          wallet,
          email: emailUsed,
        });
      }
    },
    [isWalletFlow, walletStorageKey, uidStorageKey, uid, wallet],
  );

  const applyError = useCallback((maybeKey) => {
    setSubmitted(true);
    setResult("error");
    setErrorKey(maybeKey || "errorWaitListMsg");
  }, []);

  const submitEmail = useCallback(
    async (emailToSend) => {
      const e = (emailToSend || "").trim();
      if (!e) return;

      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const out = await postWaitlist({
          email: e,
          ref,
          state: isWalletFlow ? state : undefined,
          uid,
          wallet,
        });

        if (out.kind === "success") applySuccess(e);
        else if (out.kind === "already") applyAlready(e);
        else applyError(out.key);
      } catch {
        applyError("errorWaitListMsg");
      } finally {
        inFlightRef.current = false;
      }
    },
    [
      ref,
      isWalletFlow,
      state,
      uid,
      wallet,
      applySuccess,
      applyAlready,
      applyError,
    ],
  );

  const handleSubmit = useCallback(
    async (e) => {
      e?.preventDefault?.();
      await submitEmail(email);
    },
    [submitEmail, email],
  );

  // Wallet revisit behavior:
  // ONLY show "already" if we have proof a wallet->email submission happened locally.
  useEffect(() => {
    if (!isWalletFlow) return;

    const claimedWithEmail = isClaimedLocally({
      walletStorageKey,
      uidStorageKey,
      requireEmail: true,
    });

    if (claimedWithEmail) {
      setSubmitted(true);
      setResult("already");
      setErrorKey(null);
    }
  }, [isWalletFlow, walletStorageKey, uidStorageKey]);

  // Email redirect behavior: auto-submit when URL has ?email=...
  useEffect(() => {
    if (!isEmailRedirectFlow) return;

    const e = (prefillEmail || "").trim();
    if (!e) return;

    if (didAutoSubmitRef.current) return;
    didAutoSubmitRef.current = true;

    setEmail(e);

    (async () => {
      await submitEmail(e);
    })();
  }, [isEmailRedirectFlow, prefillEmail, submitEmail]);

  return {
    email,
    setEmail,
    submitted,
    result,
    errorKey,
    handleSubmit,
  };
}
