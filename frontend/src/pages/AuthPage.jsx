// src/pages/AuthPage.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useGoogleOneTapLogin } from "@react-oauth/google";
import {
  useOutletContext,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import Container from "react-bootstrap/Container";

import "../styles/AuthPage.css";

import AuthShell from "../components/auth/AuthShell";
import SetPasswordPanel from "../components/auth/SetPasswordPanel";
import EmailAuthPanel from "../components/auth/EmailAuthPanel";
import ConfirmMessageBox from "../components/auth/ConfirmMessageBox";

import {
  isValidEmail,
  normalizeApiErrorKey,
  currentLang,
} from "../utils/authUtils";

import LoadingPage from "./LoadingPage";

function AuthPage(props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { handleLogin, setLoading, loading, showToast } = useOutletContext();

  const [processing, setProcessing] = useState(false);
  const [email, setEmail] = useState();
  const [pass, setPass] = useState();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmationError, setConfirmationError] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // setpass mode
  const [setupToken, setSetupToken] = useState("");
  const [setupMode, setSetupMode] = useState(false);

  // request-new-link CTA after token error
  const [setupTokenError, setSetupTokenError] = useState(false);
  const [requestLinkEmail, setRequestLinkEmail] = useState("");
  const [requestLinkLoading, setRequestLinkLoading] = useState(false);

  const googleHandledHashRef = useRef(false);
  const setpassInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // detect mode from URL
  useEffect(() => {
    const st = (searchParams.get("state") || "").trim().toLowerCase();
    const tok = (searchParams.get("token") || "").trim();
    const urlEmail = (searchParams.get("email") || "").trim();

    const isSetPass = st === "setpass";
    setSetupMode(isSetPass);
    setSetupToken(tok);
    setSetupTokenError(false);

    if (isSetPass && urlEmail && isValidEmail(urlEmail)) {
      setEmail(urlEmail);
      setRequestLinkEmail(urlEmail);
    }

    if (isSetPass) setConfirmationError(false);
  }, [searchParams]);

  useGoogleOneTapLogin({
    onSuccess: async (credentialResponse) => {
      try {
        setLoading(true);
        await handleGoogleResponse(
          { credential: credentialResponse?.credential },
          handleLogin,
        );
      } finally {
        setLoading(false);
      }
    },
    onError: () => {},
    disabled: loading || processing || setupMode,
    cancel_on_tap_outside: false,
  });

  const handleResendConfirmation = async () => {
    setResendLoading(true);
    try {
      const res = await fetch("/api/v1/resend_confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, language: currentLang() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "errorResendingConfirmation");
      }
      showToast(t("confirmationEmailResent"), "success");
    } catch (error) {
      showToast(t(error.message) || t("errorResendingConfirmation"), "danger");
    } finally {
      setResendLoading(false);
    }
  };

  const handleRequestNewSetupLink = async () => {
    const e = (requestLinkEmail || email || "").trim().toLowerCase();

    if (!e || !isValidEmail(e)) {
      showToast(t("emailRequiredForSetupLink"), "danger");
      return;
    }

    setRequestLinkLoading(true);
    try {
      const res = await fetch("/api/v1/auth/resend_setup_link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, language: currentLang() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(normalizeApiErrorKey(err));
      }

      showToast(t("setupLinkSent"), "success");
    } catch (err) {
      showToast(t(normalizeApiErrorKey(err?.message || err)), "danger");
    } finally {
      setRequestLinkLoading(false);
    }
  };

  const handleEmailAuth = async () => {
    const endpoint =
      props.type === "create" ? "/api/v1/register" : "/api/v1/login";
    setProcessing(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: pass,
          remember_me: rememberMe,
          language: currentLang(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errKey = normalizeApiErrorKey(errorData);

        if (errKey === "confirmationError") {
          setConfirmationError(true);
          return;
        }

        if (errKey === "passwordNotSet") {
          navigate("/login?state=setpass", { replace: true });
          showToast(t("passwordNotSet"), "secondary");
          return;
        }

        throw new Error(errKey);
      }

      const result = await response.json();

      if (props.type === "login" && result?.access_token) {
        handleLogin(result);

        if (result?.notice === "googleLinked") {
          showToast(t("googleLinkedPasswordLoginNotice"), "success");
        }
      }

      if (result?.redirect) navigate(result.redirect);
    } catch (error) {
      showToast(t(normalizeApiErrorKey(error?.message || error)), "danger");
    } finally {
      setProcessing(false);
    }
  };

  const handleSetPassword = async () => {
    const tok = (setupToken || "").trim();
    const pw = (passwordInput || "").trim();

    if (!tok) {
      setSetupTokenError(true);
      showToast(t("invalidOrExpiredToken"), "danger");
      return;
    }

    if (!pw || pw.length < 8) {
      showToast(t("weakPassword"), "danger");
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch("/api/v1/auth/set_password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tok,
          password: pw,
          remember_me: rememberMe,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errKey = normalizeApiErrorKey(err);
        if (errKey === "invalidOrExpiredToken") setSetupTokenError(true);
        throw new Error(errKey);
      }

      const result = await res.json().catch(() => ({}));
      if (result?.access_token) {
        handleLogin(result);
        return;
      }

      throw new Error("invalidApiResponse");
    } catch (e) {
      showToast(t(normalizeApiErrorKey(e?.message || e)), "danger");
    } finally {
      setProcessing(false);
    }
  };

  const getGoogleRedirectUri = () => {
    const envUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI;
    if (typeof envUri === "string" && envUri.trim()) return envUri.trim();
    return `${window.location.origin}/login`;
  };

  const buildGoogleImplicitUrl = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = getGoogleRedirectUri();

    const state = `cap_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    try {
      sessionStorage.setItem("cap_google_oauth_state", state);
    } catch {}

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "token",
      scope: "openid email profile",
      include_granted_scopes: "true",
      prompt: "select_account",
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  const handleGoogleResponse = async (tokenResponse, onSuccess) => {
    try {
      const token =
        tokenResponse?.access_token || tokenResponse?.credential || null;
      const tokenType = tokenResponse?.access_token
        ? "access_token"
        : "id_token";
      if (!token) throw new Error("missingGoogleToken");

      const res = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          token_type: tokenType,
          remember_me: rememberMe,
          language: currentLang(),
        }),
      });

      if (!res.ok) {
        let errMsg = "googleAuthFailed";
        try {
          const err = await res.json();
          errMsg = err?.detail || err?.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }

      const apiResponse = await res.json().catch(() => ({}));

      if (apiResponse?.access_token) {
        onSuccess?.(apiResponse);
        return;
      }

      if (apiResponse?.status === "pending_confirmation") {
        const pendingEmail = apiResponse?.email || "";
        navigate(
          `/signup?state=already${
            pendingEmail ? `&email=${encodeURIComponent(pendingEmail)}` : ""
          }`,
        );
        return;
      }

      throw new Error("invalidApiResponse");
    } catch (err) {
      showToast(t(err?.message || "googleAuthFailed"), "danger");
    }
  };

  // parse OAuth hash on return
  useEffect(() => {
    if (setupMode) return;

    const hash = window.location.hash || "";
    if (!hash.startsWith("#")) return;
    if (googleHandledHashRef.current) return;

    const qs = new URLSearchParams(hash.slice(1));

    const err = qs.get("error");
    if (err) {
      googleHandledHashRef.current = true;
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );

      const lower = String(err).toLowerCase();
      showToast(
        t(
          lower.includes("access_denied")
            ? "googleAuthCancelled"
            : "googleAuthFailed",
        ),
        lower.includes("access_denied") ? "secondary" : "danger",
      );
      return;
    }

    const accessToken = qs.get("access_token");
    const tokenType = qs.get("token_type") || "Bearer";
    const state = qs.get("state") || "";
    if (!accessToken) return;

    googleHandledHashRef.current = true;

    try {
      const expected = sessionStorage.getItem("cap_google_oauth_state") || "";
      if (expected && state && expected !== state) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        showToast(t("googleAuthFailed"), "danger");
        return;
      }
      sessionStorage.removeItem("cap_google_oauth_state");
    } catch {}

    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );

    setLoading(true);
    handleGoogleResponse(
      { access_token: accessToken, token_type: tokenType },
      handleLogin,
    ).finally(() => setLoading(false));
  }, [setupMode]);

  const handleAuthStep = useCallback(() => {
    if (setupMode) {
      if (!processing) handleSetPassword();
      return;
    }

    if (!email) {
      const el = document.getElementById("Auth-input-text");
      const value = el?.value?.trim();
      if (!value) return;

      if (!isValidEmail(value)) {
        showToast(t("invalidEmailFormat"), "danger");
        return;
      }

      setEmail(value);
      return;
    }

    if (email && !pass) {
      if (passwordInput?.length > 0) setPass(passwordInput);
      return;
    }

    if (email && pass && !processing) handleEmailAuth();
  }, [setupMode, processing, email, pass, passwordInput, showToast, t]);

  useEffect(() => {
    if (setupMode) return;
    if (email && pass && !processing) handleEmailAuth();
  }, [email, pass, setupMode]);

  useEffect(() => {
    if (searchParams.get("sessionExpired") === "1") {
      showToast(t("sessionExpired"), "secondary");
      searchParams.delete("sessionExpired");
      setSearchParams(searchParams, { replace: true });
    } else if (searchParams.get("confirmed") === "true") {
      showToast(t("emailConfirmed"), "success");
      searchParams.delete("confirmed");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, showToast, t]);

  const titleText = setupMode
    ? t("setPasswordTitle")
    : props.type === "create"
      ? t("signUpMsg")
      : t("loginMsg");

  const isConfirmFalse = searchParams.get("confirmed") === "false";

  return (
    <Container className="Auth-body-wrapper" fluid>
      {loading && (
        <Container className="Auth-body-wrapper" fluid>
          <LoadingPage type="ring" fullscreen={true} />
        </Container>
      )}

      {!loading && !isConfirmFalse && (
        <AuthShell title={titleText}>
          {setupMode ? (
            <SetPasswordPanel
              t={t}
              setupToken={setupToken}
              passwordInput={passwordInput}
              setPasswordInput={setPasswordInput}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              rememberMe={rememberMe}
              setRememberMe={setRememberMe}
              processing={processing}
              onSubmit={handleSetPassword}
              setpassInputRef={setpassInputRef}
              setupTokenError={setupTokenError}
              requestLinkEmail={requestLinkEmail}
              setRequestLinkEmail={setRequestLinkEmail}
              requestLinkLoading={requestLinkLoading}
              onRequestNewSetupLink={handleRequestNewSetupLink}
            />
          ) : (
            <EmailAuthPanel
              t={t}
              propsType={props.type}
              email={email}
              setEmail={setEmail}
              pass={pass}
              setPass={setPass}
              passwordInput={passwordInput}
              setPasswordInput={setPasswordInput}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              rememberMe={rememberMe}
              setRememberMe={setRememberMe}
              processing={processing}
              confirmationError={confirmationError}
              resendLoading={resendLoading}
              onAuthStep={handleAuthStep}
              onResendConfirmation={handleResendConfirmation}
              onGoogleRedirectClick={() =>
                window.location.assign(buildGoogleImplicitUrl())
              }
              showToast={showToast}
              handleLogin={handleLogin}
            />
          )}
        </AuthShell>
      )}

      {!loading && isConfirmFalse && !setupMode && (
        <ConfirmMessageBox
          t={t}
          resendLoading={resendLoading}
          onResendConfirmation={handleResendConfirmation}
        />
      )}
    </Container>
  );
}

export default AuthPage;
