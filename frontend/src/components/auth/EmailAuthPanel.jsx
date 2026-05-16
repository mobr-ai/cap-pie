import { Suspense } from "react";
import InputGroup from "react-bootstrap/InputGroup";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import { NavLink } from "react-router-dom";
import reactStringReplace from "react-string-replace";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import LoadingPage from "../../pages/LoadingPage";
import CardanoWalletLogin from "../wallet/CardanoWalletLogin";

export default function EmailAuthPanel({
  t,
  propsType,
  email,
  setEmail,
  pass,
  setPass,
  passwordInput,
  setPasswordInput,
  showPassword,
  setShowPassword,
  rememberMe,
  setRememberMe,
  processing,
  confirmationError,
  resendLoading,
  onAuthStep,
  onResendConfirmation,
  onGoogleRedirectClick,
  showToast,
  handleLogin,
}) {
  return (
    <>
      {!email && (
        <InputGroup className="Auth-input-email" size="md">
          <InputGroup.Text className="Auth-input-label"></InputGroup.Text>
          <Form.Control
            autoFocus
            id="Auth-input-text"
            className="Auth-email-input"
            aria-label="Enter valid e-mail"
            placeholder={t("mailPlaceholder")}
            onFocus={(e) => (e.target.placeholder = "")}
            onBlur={(e) => (e.target.placeholder = t("mailPlaceholder"))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAuthStep();
              }
            }}
            size="md"
          />
        </InputGroup>
      )}

      {email && (
        <InputGroup className="Auth-input-email-entered" size="md">
          <InputGroup.Text
            className="Auth-input-label"
            onClick={() => {
              setEmail(null);
              setPass(undefined);
              setPasswordInput("");
            }}
          />
          <Form.Control
            className="Auth-email-input"
            placeholder={email}
            readOnly
            size="md"
          />
        </InputGroup>
      )}

      {email && (
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
              autoFocus
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
                  setPass(passwordInput);
                }
              }}
            />
          </InputGroup>

          <Form.Check
            type="checkbox"
            id="rememberMe"
            label={t("keepMeLoggedIn")}
            className="Auth-keep-logged-toggle"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
        </>
      )}

      {email && propsType === "login" && !confirmationError && (
        <p className="Auth-alternative-link">{t("forgotPass")}</p>
      )}

      {!confirmationError && (
        <Button
          className="Auth-input-button"
          variant="dark"
          size="md"
          onClick={!processing ? onAuthStep : null}
          disabled={processing}
        >
          {processing ? t("processingMail") : t("authNextStep")}
        </Button>
      )}

      {confirmationError && (
        <>
          <p className="Auth-confirmation-warning">
            {t("accountNotConfirmedMessage")}
          </p>
          <Button
            className="Auth-input-button"
            variant="dark"
            size="md"
            onClick={!resendLoading ? onResendConfirmation : null}
            disabled={resendLoading}
          >
            {resendLoading ? t("resending") : t("resendConfirmation")}
          </Button>
        </>
      )}

      <p>
        {propsType === "login"
          ? reactStringReplace(t("signUpAlternativeMsg"), "{}", (_m, i) => (
              <NavLink
                key={`signup-alt-${i}`}
                className="Auth-alternative-link"
                to="/signup"
              >
                {t("signUpButton")}
              </NavLink>
            ))
          : reactStringReplace(t("loginAlternativeMsg"), "{}", (_m, i) => (
              <NavLink
                key={`login-alt-${i}`}
                className="Auth-alternative-link"
                to="/login"
              >
                {t("loginButton")}
              </NavLink>
            ))}
      </p>

      <div className="Auth-divider">
        <span className="Auth-divider-or">{t("signUpOR")}</span>
      </div>

      <Button
        id="Auth-oauth-google"
        className="Auth-oauth-button"
        variant="outline-secondary"
        size="md"
        onClick={onGoogleRedirectClick}
        disabled={processing}
      >
        <img
          src="/icons/g.png"
          alt="Google authentication"
          className="Auth-oauth-logo"
        />
        {t("loginWithGoogle")}
      </Button>

      <Suspense
        fallback={
          <LoadingPage
            type="ring"
            fullscreen={true}
            message={t("loading.wallet")}
          />
        }
      >
        <CardanoWalletLogin onLogin={handleLogin} showToast={showToast} />
      </Suspense>
    </>
  );
}
