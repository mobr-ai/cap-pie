// src/components/welcome/WelcomeShowcase.jsx
import React, { useMemo } from "react";
import CapIcon from "./CapIcon";

export default function WelcomeShowcase({ t, showcaseRef }) {
  const pillars = useMemo(
    () => [
      {
        icon: "llm",
        title: t("welcome.cap.pillars.llm.title", "Fine-Tuned Cardano LLM"),
        desc: t(
          "welcome.cap.pillars.llm.desc",
          "A specialized AI reasoning engine trained to understand Cardano’s domain-specific data structures, ontologies, and governance mechanics.",
        ),
      },
      {
        icon: "kg",
        title: t("welcome.cap.pillars.kg.title", "Federated Knowledge Graph"),
        desc: t(
          "welcome.cap.pillars.kg.desc",
          "A semantic source of truth linking on-chain activity with off-chain metadata for holistic, contextual blockchain analysis.",
        ),
      },
      {
        icon: "dash",
        title: t(
          "welcome.cap.pillars.dashboards.title",
          "User-Centric Smart Dashboards",
        ),
        desc: t(
          "welcome.cap.pillars.dashboards.desc",
          "Interactive, customizable workspaces where users pin AI-generated charts and tables for real-time monitoring and exploration.",
        ),
      },
    ],
    [t],
  );

  const steps = useMemo(
    () => [
      {
        n: "01",
        title: t("welcome.cap.flow.step1.title", "Ask in Natural Language"),
        desc: t(
          "welcome.cap.flow.step1.desc",
          "Users can input blockchain queries using everyday language — no SQL or SPARQL required.",
        ),
      },
      {
        n: "02",
        title: t("welcome.cap.flow.step2.title", "Semantic Translation"),
        desc: t(
          "welcome.cap.flow.step2.desc",
          "CAP’s AI translates your human question into precise, executable SPARQL queries over the Cardano knowledge graph.",
        ),
      },
      {
        n: "03",
        title: t("welcome.cap.flow.step3.title", "Instant Visual Results"),
        desc: t(
          "welcome.cap.flow.step3.desc",
          "Results are automatically rendered into interactive Vega-Lite charts or structured tables.",
        ),
      },
    ],
    [t],
  );

  const examples = useMemo(() => {
    const raw = t("welcome.cap.examples.items", {
      returnObjects: true,
      defaultValue: [],
    });

    const items = Array.isArray(raw)
      ? raw
      : [
          {
            query: t(
              "welcome.cap.examples.items.0.query",
              "List top 5 meme tokens by volume",
            ),
            sources: t(
              "welcome.cap.examples.items.0.sources",
              "On-chain transactions + Off-chain token descriptions",
            ),
          },
          {
            query: t(
              "welcome.cap.examples.items.1.query",
              "Compare voter turnout by proposal label",
            ),
            sources: t(
              "welcome.cap.examples.items.1.sources",
              "Governance actions + Metadata anchors",
            ),
          },
          {
            query: t(
              "welcome.cap.examples.items.2.query",
              "Show pools with metadata discrepancies",
            ),
            sources: t(
              "welcome.cap.examples.items.2.sources",
              "Registration certificates + Off-chain registry",
            ),
          },
        ];

    return items.map((it) => ({ q: it?.query || "", s: it?.sources || "" }));
  }, [t]);

  return (
    <main className="WelcomePage-showcase" ref={showcaseRef}>
      <section className="CapSection CapSection--intro" data-reveal>
        <div className="CapSection-inner">
          <div className="CapEyebrow">{t("capEyebrow", "CAP")}</div>
          <h2 className="CapH2">
            {t(
              "welcome.cap.headline",
              "Welcome to CAP: Cardano Analytics Powered by AI",
            )}
          </h2>
          <p className="CapLead">
            {t(
              "welcome.cap.lead",
              "Simplifying Cardano blockchain data exploration through natural language, bridging complex on-chain data with user-friendly insights via a Cardano-tailored LLM pipeline and a Semantic Knowledge Graph.",
            )}
          </p>

          <div className="CapKpis" role="list">
            <div className="CapKpi" role="listitem">
              <CapIcon name="spark" />
              <div className="CapKpiText">
                <div className="CapKpiTop">
                  {t("welcome.cap.kpis.ask.title", "Ask")}
                </div>
                <div className="CapKpiBottom">
                  {t("welcome.cap.kpis.ask.subtitle", "in plain language")}
                </div>
              </div>
            </div>

            <div className="CapKpi" role="listitem">
              <CapIcon name="kg" />
              <div className="CapKpiText">
                <div className="CapKpiTop">
                  {t("welcome.cap.kpis.federate.title", "Federate")}
                </div>
                <div className="CapKpiBottom">
                  {t(
                    "welcome.cap.kpis.federate.subtitle",
                    "on-chain + off-chain",
                  )}
                </div>
              </div>
            </div>

            <div className="CapKpi" role="listitem">
              <CapIcon name="dash" />
              <div className="CapKpiText">
                <div className="CapKpiTop">
                  {t("welcome.cap.kpis.visualize.title", "Visualize")}
                </div>
                <div className="CapKpiBottom">
                  {t("welcome.cap.kpis.visualize.subtitle", "instantly")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="CapSection" data-reveal>
        <div className="CapSection-inner">
          <div className="CapSectionGrid">
            <div className="CapSectionCol">
              <h3 className="CapH3">
                {t(
                  "welcome.cap.pillars.title",
                  "The Three Pillars of Innovation",
                )}
              </h3>
              <p className="CapBody">
                {t(
                  "capPillarsBody",
                  "CAP combines a domain-tuned LLM, a federated semantic graph, and dashboards designed for human workflows.",
                )}
              </p>
            </div>

            <div className="CapSectionCol">
              <div className="CapCardGrid">
                {pillars.map((p) => (
                  <article key={p.title} className="CapCard" data-reveal>
                    <div className="CapCardIcon">
                      <CapIcon name={p.icon} />
                    </div>
                    <div className="CapCardContent">
                      <div className="CapCardTitle">{p.title}</div>
                      <div className="CapCardDesc">{p.desc}</div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="CapSection CapSection--steps" data-reveal>
        <div className="CapSection-inner">
          <h3 className="CapH3">
            {t("welcome.cap.flow.title", "From Question to Insight")}
          </h3>
          <div className="CapSteps">
            {steps.map((s) => (
              <div className="CapStep" key={s.n} data-reveal>
                <div className="CapStepHeader">
                  <div className="CapStepNum">{s.n}</div>
                  <div className="CapStepTitle">{s.title}</div>
                </div>
                <div className="CapStepDesc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="CapSection" data-reveal>
        <div className="CapSection-inner">
          <div className="CapExamplesHeader">
            <h3 className="CapH3">
              {t(
                "welcome.cap.examples.title",
                "Examples of Complex Federated Queries",
              )}
            </h3>
            <p className="CapBody">{t("welcome.cap.examples.body")}</p>
          </div>

          <div
            className="CapTable"
            role="table"
            aria-label={t("capExamplesAria", "CAP query examples")}
          >
            <div className="CapTableHead" role="rowgroup">
              <div className="CapTableRow CapTableRow--head" role="row">
                <div className="CapTableCell" role="columnheader">
                  {t("welcome.cap.examples.colQuery", "User Query Example")}
                </div>
                <div className="CapTableCell" role="columnheader">
                  {t(
                    "welcome.cap.examples.colSources",
                    "Data Sources Combined",
                  )}
                </div>
              </div>
            </div>

            <div className="CapTableBody" role="rowgroup">
              {examples.map((e) => (
                <div className="CapTableRow" role="row" key={e.q}>
                  <div className="CapTableCell" role="cell">
                    <span className="CapMono">“{e.q}”</span>
                  </div>
                  <div className="CapTableCell" role="cell">
                    {e.s}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="CapCTA" data-reveal>
            <div className="CapCTA-inner">
              <div className="CapCTAText">
                <div className="CapCTATitle">
                  {t(
                    "welcome.cap.cta.title",
                    "Ready to explore Cardano data the fast way?",
                  )}
                </div>
                <div className="CapCTADesc">
                  {t(
                    "welcome.cap.cta.description",
                    "Sign in above to access your workspace and start pinning insights.",
                  )}
                </div>
              </div>

              <button
                type="button"
                className="CapCTAButton"
                onClick={() =>
                  window.scrollTo({
                    top: 0,
                    behavior:
                      window.matchMedia &&
                      window.matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "auto"
                        : "smooth",
                  })
                }
              >
                {t("welcome.cap.cta.button", "Get Early Access")}
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="CapFooter" data-reveal>
        <div className="CapFooter-inner">
          <div className="CapFooterBrand">
            <img
              className="CapFooterLogo"
              src="/assets/mobr-footer-logo.png"
              alt={t("mobrLogoAlt", "MOBR Systems")}
              loading="lazy"
            />
            <div className="CapFooterTagline">
              {t(
                "welcome.footer.tagline",
                "Building advanced data and AI infrastructure for decentralized ecosystems.",
              )}
            </div>
          </div>

          <nav
            className="CapFooterLinks"
            aria-label={t("capFooterLinks", "Links")}
          >
            <a
              className="CapFooterLink"
              href="https://mobr.ai"
              target="_blank"
              rel="noreferrer"
            >
              mobr.ai
            </a>
            <a
              className="CapFooterLink"
              href="https://github.com/mobr-ai"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
            <a
              className="CapFooterLink"
              href="https://www.linkedin.com/company/mobr"
              target="_blank"
              rel="noreferrer"
            >
              LinkedIn
            </a>
          </nav>

          <div className="CapFooterFineprint">
            <span>© {new Date().getFullYear()} MOBR Systems</span>
            <span className="CapFooterSep" aria-hidden="true">
              ·
            </span>
            <span>{t("welcome.footer.allRights", "All rights reserved.")}</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
