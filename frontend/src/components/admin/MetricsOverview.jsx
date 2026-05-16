// src/components/admin/MetricsOverview.jsx
import React, { useMemo } from "react";

function fmtPct(v) {
  const n = Number(v || 0);
  return `${n.toFixed(1)}%`;
}
function fmtMs(v) {
  const n = Number(v || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

export function MetricsOverview({
  t,
  report,
  recentQueries,
  isLoading,
  error,
  onOpenQuery,
}) {
  const cards = useMemo(() => {
    const llm = report?.llm_capability;
    const kg = report?.knowledge_graph;
    const dash = report?.dashboard_adoption;
    const perf = report?.performance;

    return [
      {
        k: "totalQueries",
        label: t("admin.metrics.totalQueries"),
        value: llm ? llm.total_queries : "—",
        caption: llm
          ? `${t("admin.metrics.uniqueLangs")}: ${llm.unique_languages}`
          : "",
      },
      {
        k: "validSparql",
        label: t("admin.metrics.validSparqlRate"),
        value: llm ? fmtPct(llm.valid_sparql_rate) : "—",
        caption: llm
          ? `${t("admin.metrics.target")}: ${fmtPct(llm.target_valid_rate)}`
          : "",
      },
      {
        k: "semanticValid",
        label: t("admin.metrics.semanticValidRate"),
        value: llm ? fmtPct(llm.semantic_valid_rate) : "—",
        caption: llm
          ? `${t("admin.metrics.target")}: ${fmtPct(llm.target_semantic_rate)}`
          : "",
      },
      {
        k: "triples",
        label: t("admin.metrics.totalTriplesLoaded"),
        value: kg ? (kg.total_triples_loaded || 0).toLocaleString() : "—",
        caption: kg
          ? `${t("admin.metrics.ontologyAlignmentRate")}: ${fmtPct(
              kg.ontology_alignment_rate,
            )}`
          : "",
      },
      {
        k: "dashboards",
        label: t("admin.metrics.uniqueDashboards"),
        value: dash ? dash.unique_dashboards : "—",
        caption: dash
          ? `${t("admin.metrics.uniqueUsers")}: ${dash.unique_users}`
          : "",
      },
      {
        k: "avgLatency",
        label: t("admin.metrics.avgTotalLatency"),
        value: perf ? fmtMs(perf.avg_total_latency_ms) : "—",
        caption: perf
          ? `p95 LLM: ${fmtMs(perf.p95_llm_latency_ms)} • p95 SPARQL: ${fmtMs(
              perf.p95_sparql_latency_ms,
            )}`
          : "",
      },
    ];
  }, [report, t]);

  return (
    <section className="admin-section">
      <div className="admin-section-header">
        <div className="admin-section-title">{t("admin.metrics.title")}</div>
        <div className="admin-section-subtitle">
          {t("admin.metrics.subtitle")}
        </div>
      </div>

      {error ? <div className="admin-stat-error">{error}</div> : null}

      <div className="admin-stat-grid">
        {cards.map((c) => (
          <div key={c.k} className="admin-stat-card">
            <div className="admin-stat-label">{c.label}</div>
            <div className="admin-stat-value">{isLoading ? "…" : c.value}</div>
            <div className="admin-stat-caption">
              {isLoading ? "" : c.caption}
            </div>
          </div>
        ))}
      </div>

      {/* Optional: show a compact list of recent queries under the cards */}
      {recentQueries?.queries?.length ? (
        <div
          className="admin-section admin-section--table"
          style={{ marginTop: "1rem" }}
        >
          <div className="admin-section-header admin-section-header--compact">
            <div className="admin-section-title">
              {t("admin.metrics.recentQueries")}
            </div>
            <div className="admin-section-subtitle">
              {t("admin.metrics.recentQueriesSubtitle")}
            </div>
          </div>

          <div className="admin-table-wrapper">
            <table className="table table-sm table-dark table-striped align-middle admin-users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("admin.metrics.query")}</th>
                  <th>{t("admin.metrics.lang")}</th>
                  <th>{t("admin.metrics.ok")}</th>
                  <th>{t("admin.metrics.complexity")}</th>
                  <th>{t("admin.metrics.totalLatency")}</th>
                  <th>{t("admin.metrics.createdAt")}</th>
                </tr>
              </thead>
              <tbody>
                {recentQueries.queries.map((q) => (
                  <tr
                    key={q.id}
                    className={onOpenQuery ? "admin-recentq-row" : ""}
                    onClick={() => onOpenQuery?.(q)}
                    style={{ cursor: onOpenQuery ? "pointer" : "default" }}
                  >
                    <td>{q.id}</td>
                    <td
                      style={{
                        maxWidth: 520,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {q.nl_query}
                    </td>
                    <td>{q.language}</td>
                    <td>{q.succeeded ? "yes" : "no"}</td>
                    <td>{q.complexity_score}</td>
                    <td>{fmtMs(q.total_latency_ms)}</td>
                    <td>{q.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
