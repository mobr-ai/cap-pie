import React from "react";
import "../styles/WaitingListPage.css";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { parseWaitlistParams } from "../utils/waitlistParseParams";
import { useWaitlistFlow } from "../hooks/useWaitlistFlow";

const WaitingListPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  const flow = parseWaitlistParams(searchParams);
  const subtitleKey = flow.isWalletFlow
    ? "joinWaitListSubtitleWallet"
    : "joinWaitListSubtitle";

  const { email, setEmail, submitted, result, errorKey, handleSubmit } =
    useWaitlistFlow({ flow });

  const renderMessage = () => {
    if (!submitted) return null;

    if (result === "success")
      return <p className="mt-4">{t("successWaitListMsg")}</p>;

    if (result === "already")
      return <p className="mt-4">{t("alreadyOnWaitListMsg")}</p>;

    const key = errorKey || "errorWaitListMsg";
    return <p className="mt-4">{t(key)}</p>;
  };

  return (
    <div className="WaitingList-body">
      <div className="WaitingList-middle-column">
        <div className="logo-wrap">
          <img
            src="/icons/logo.svg"
            className={
              !submitted ? "WaitingList-logo" : "WaitingList-logo-static"
            }
            alt="CAP Logo"
          />
        </div>

        <h1 className="text-3xl font-semibold">{t("joinWaitList")}</h1>
        <p className="mt-2 text-gray-400">{t(subtitleKey)}</p>

        {!submitted ? (
          <form
            onSubmit={handleSubmit}
            className="WaitingList-input-form WaitingList-logo-text"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("enterEmailPlaceholder")}
              className="WaitingList-input"
              required
            />
            <button
              type="submit"
              className="btn btn-secondary btn-lg WaitingList-btn"
            >
              {t("signUpButton")}
            </button>
          </form>
        ) : (
          renderMessage()
        )}
      </div>
    </div>
  );
};

export default WaitingListPage;
