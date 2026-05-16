import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import InputGroup from "react-bootstrap/InputGroup";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { passwordStrengthKey } from "../../utils/authUtils";

export default function SetPasswordPanel({
  t,
  setupToken,
  passwordInput,
  setPasswordInput,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  processing,
  onSubmit,
  setpassInputRef,
  setupTokenError,
  requestLinkEmail,
  setRequestLinkEmail,
  requestLinkLoading,
  onRequestNewSetupLink,
}) {
  // autofocus
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setpassInputRef.current?.focus();
      } catch {}
    }, 50);
    return () => clearTimeout(timer);
  }, [setpassInputRef]);

  const strengthKey = passwordStrengthKey(passwordInput);

  return (
    <>
      <InputGroup className="Auth-input-pass" size="md">
        <InputGroup.Text
          className="Auth-input-label Auth-password-eye"
          onClick={() => setShowPassword(!showPassword)}
          role="button"
          aria-label={t("togglePasswordVisibility")}
        >
          <FontAwesomeIcon icon={!showPassword ? faEyeSlash : faEye} />
        </InputGroup.Text>

        <Form.Control
          ref={setpassInputRef}
          id="Auth-input-password-text"
          className="Auth-password-input"
          type={showPassword ? "text" : "password"}
          placeholder={t("passwordPlaceholder")}
          size="md"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!processing) onSubmit();
            }
          }}
        />
      </InputGroup>

      <div className="Auth-hintBox">
        <div className="Auth-hintLine">{t("passwordHintMinChars")}</div>
        <div className={`Auth-hintSub ${strengthKey}`}>{t(strengthKey)}</div>
      </div>

      <Form.Check
        type="checkbox"
        id="rememberMe"
        label={t("keepMeLoggedIn")}
        className="Auth-keep-logged-toggle"
        checked={rememberMe}
        onChange={(e) => setRememberMe(e.target.checked)}
      />

      <Button
        className="Auth-input-button"
        variant="dark"
        size="md"
        onClick={!processing ? onSubmit : null}
        disabled={processing || !setupToken}
      >
        {processing ? t("processingMail") : t("setPasswordCta")}
      </Button>

      <p className="Auth-linkRow">
        <NavLink className="Auth-alternative-link" to="/login">
          {t("backToLogin")}
        </NavLink>
      </p>

      {setupTokenError && (
        <div className="Auth-setupCtaWrapper">
          <p className="Auth-setupCtaHelp">{t("requestNewSetupLinkHelp")}</p>

          <InputGroup size="md">
            <Form.Control
              type="email"
              placeholder={t("mailPlaceholder")}
              value={requestLinkEmail}
              onChange={(e) => setRequestLinkEmail(e.target.value)}
            />
            <Button
              variant="outline-secondary"
              onClick={!requestLinkLoading ? onRequestNewSetupLink : null}
              disabled={requestLinkLoading}
            >
              {requestLinkLoading
                ? t("processingMail")
                : t("requestNewSetupLinkCta")}
            </Button>
          </InputGroup>
        </div>
      )}
    </>
  );
}
