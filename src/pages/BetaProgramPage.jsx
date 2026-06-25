// src/pages/BetaProgramPage.jsx
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router-dom";

import "../styles/BetaProgramPage.css";
import useRevealOnScroll from "../hooks/useRevealOnScroll";
import CapIcon from "../components/welcome/CapIcon";
import {
  currentLang,
  isValidEmail,
  normalizeApiErrorKey,
} from "../utils/authUtils";

const initialForm = {
  fullName: "",
  email: "",
  role: "",
  organization: "",
  useCase: "",
  companyUrl: "", // honeypot; keep hidden in the UI
};

export default function BetaProgramPage() {
  const { t } = useTranslation();
  const { showToast } = useOutletContext();
  useRevealOnScroll();
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const features = useMemo(
    () => [
      {
        icon: "llm",
        title: t("welcome.beta.features.nl.title", "Natural Language Discovery"),
        desc: t(
          "welcome.beta.features.nl.desc",
          "Ask questions about Cardano in plain English and retrieve structured analytics.",
        ),
      },
      {
        icon: "dash",
        title: t("welcome.beta.features.dashboards.title", "AI-Powered Dashboards"),
        desc: t(
          "welcome.beta.features.dashboards.desc",
          "Pin generated charts and tables into a personal analytics workspace.",
        ),
      },
      {
        icon: "kg",
        title: t("welcome.beta.features.federated.title", "Federated Data Intelligence"),
        desc: t(
          "welcome.beta.features.federated.desc",
          "Explore a unified view across on-chain activity and essential off-chain metadata.",
        ),
      },
    ],
    [t],
  );

  const audiences = useMemo(
    () => [
      t("welcome.beta.audience.developers", "Developers & teams"),
      t("welcome.beta.audience.analysts", "Analysts & researchers"),
      t("welcome.beta.audience.community", "Investors & community contributors"),
    ],
    [t],
  );

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const email = form.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      showToast?.(t("invalidEmailFormat", "Invalid email format"), "danger");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/v1/beta/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          email,
          role: form.role.trim(),
          organization: form.organization.trim(),
          use_case: form.useCase.trim(),
          language: currentLang(),
          source: "beta_program_page",
          company_url: form.companyUrl.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(normalizeApiErrorKey(errorData));
      }

      setSubmitted(true);
      setForm((prev) => ({ ...initialForm, email: prev.email }));
      showToast?.(
        t(
          "welcome.beta.form.successToast",
          "Registration received. We will review it and follow up by email.",
        ),
        "success",
      );
    } catch (error) {
      showToast?.(
        t(normalizeApiErrorKey(error?.message || error), t("welcome.beta.form.error")),
        "danger",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="BetaProgramPage"><section className="BetaCTA" id="closed-beta">
      <div className="BetaCTA-bgMesh" aria-hidden="true" />

      <div className="BetaCTA-inner">
        <div className="BetaCTA-header" data-reveal>
          <div className="BetaCTA-brandRow">
            <img
              src="/icons/logo.svg"
              className="BetaCTA-logo"
              alt={t("capLogoAlt", "CAP")}
              loading="lazy"
            />
            <span className="BetaCTA-eyebrow">
              {t("welcome.beta.eyebrow", "Closed Beta Program")}
            </span>
          </div>

          <h2 className="BetaCTA-title">
            {t("welcome.beta.title", "Join the CAP Closed Beta")}
          </h2>
          <p className="BetaCTA-lead">
            {t(
              "welcome.beta.lead",
              "Explore Cardano data with AI-powered analytics, natural language queries, and interactive dashboards.",
            )}
          </p>
        </div>

        <div className="BetaCTA-grid">
          <div className="BetaCTA-story" data-reveal>
            <div className="BetaCTA-panel BetaCTA-panel--intro">
              <p>
                {t(
                  "welcome.beta.description",
                  "CAP is opening a limited closed beta for selected users who want to test a clearer way to analyze Cardano data. The platform combines structured blockchain data, knowledge graphs, and AI reasoning to move from raw on-chain information to practical insights.",
                )}
              </p>
            </div>

            <div className="BetaCTA-featureGrid">
              {features.map((feature) => (
                <article className="BetaCTA-featureCard" key={feature.title} data-reveal>
                  <div className="BetaCTA-featureIcon">
                    <CapIcon name={feature.icon} />
                  </div>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.desc}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className="BetaCTA-panel BetaCTA-panel--audience" data-reveal>
              <div>
                <h3>{t("welcome.beta.audience.title", "Who should apply")}</h3>
                <p>
                  {t(
                    "welcome.beta.audience.desc",
                    "We are looking for users willing to test, give feedback, and help shape the next version of CAP.",
                  )}
                </p>
              </div>
              <div className="BetaCTA-chipList">
                {audiences.map((audience) => (
                  <span className="BetaCTA-chip" key={audience}>
                    {audience}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <form className="BetaCTA-form" onSubmit={handleSubmit} data-reveal>
            <div className="BetaCTA-formHeader">
              <span className="BetaCTA-formKicker">
                {t("welcome.beta.form.kicker", "Early access")}
              </span>
              <h3>{t("welcome.beta.form.title", "Register your interest")}</h3>
              <p>
                {t(
                  "welcome.beta.form.subtitle",
                  "Tell us how you would use CAP. We will use this to prioritize beta invitations.",
                )}
              </p>
            </div>

            <div className="BetaCTA-fieldGrid">
              <label className="BetaCTA-field">
                <span>{t("welcome.beta.form.name", "Name")}</span>
                <input
                  value={form.fullName}
                  onChange={updateField("fullName")}
                  placeholder={t("welcome.beta.form.namePlaceholder", "Your name")}
                  maxLength={120}
                />
              </label>

              <label className="BetaCTA-field">
                <span>{t("welcome.beta.form.email", "Email")}</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={updateField("email")}
                  placeholder={t("welcome.beta.form.emailPlaceholder", "you@example.com")}
                  maxLength={255}
                  required
                />
              </label>
            </div>

            <div className="BetaCTA-fieldGrid">
              <label className="BetaCTA-field">
                <span>{t("welcome.beta.form.role", "Profile")}</span>
                <select value={form.role} onChange={updateField("role")} required>
                  <option value="">{t("welcome.beta.form.rolePlaceholder", "Select one")}</option>
                  <option value="developer">{t("welcome.beta.form.roles.developer", "Developer / builder")}</option>
                  <option value="analyst">{t("welcome.beta.form.roles.analyst", "Analyst / researcher")}</option>
                  <option value="ecosystem">{t("welcome.beta.form.roles.ecosystem", "Ecosystem team")}</option>
                  <option value="investor">{t("welcome.beta.form.roles.investor", "Investor / community")}</option>
                  <option value="other">{t("welcome.beta.form.roles.other", "Other")}</option>
                </select>
              </label>

              <label className="BetaCTA-field">
                <span>{t("welcome.beta.form.organization", "Organization / project")}</span>
                <input
                  value={form.organization}
                  onChange={updateField("organization")}
                  placeholder={t("welcome.beta.form.organizationPlaceholder", "Optional")}
                  maxLength={160}
                />
              </label>
            </div>

            <label className="BetaCTA-field">
              <span>{t("welcome.beta.form.useCase", "What would you like to test?")}</span>
              <textarea
                value={form.useCase}
                onChange={updateField("useCase")}
                placeholder={t(
                  "welcome.beta.form.useCasePlaceholder",
                  "Example: staking analytics, governance monitoring, token dashboards, research workflows...",
                )}
                maxLength={2000}
                rows={4}
              />
            </label>

            <input
              className="BetaCTA-honeypot"
              tabIndex="-1"
              autoComplete="off"
              value={form.companyUrl}
              onChange={updateField("companyUrl")}
              aria-hidden="true"
            />

            <button className="BetaCTA-submit" type="submit" disabled={submitting}>
              {submitting
                ? t("welcome.beta.form.submitting", "Submitting...")
                : t("welcome.beta.form.submit", "Register for Closed Beta")}
            </button>

            <div className="BetaCTA-formNote" aria-live="polite">
              {submitted
                ? t(
                    "welcome.beta.form.successInline",
                    "Thanks — your registration was received.",
                  )
                : t(
                    "welcome.beta.form.note",
                    "Closed beta access is limited while we test the product with early users.",
                  )}
            </div>
          </form>
        </div>
      </div>
    </section></main>
  );
}
