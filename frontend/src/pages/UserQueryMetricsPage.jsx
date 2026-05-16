// src/pages/UserQueryMetricsPage.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthRequest } from "@/hooks/useAuthRequest";
import LoadingPage from "@/pages/LoadingPage";
import "@/styles/AnalysesPage.css";
import QueryDetailsModal from "@/components/admin/QueryDetailsModal";

const lower = (v) => String(v ?? "").toLowerCase();
function fmtMs(v) {
  const n = Number(v || 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.round(n)}ms`;
}

export default function UserQueryMetricsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, showToast, handleLogout } = useOutletContext() || {};
  const { userId } = useParams();

  const { authFetch } = useAuthRequest({ session, showToast, handleLogout });

  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);
  const stableAuthFetch = useCallback(
    (url, options) => authFetchRef.current(url, options),
    [],
  );

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setIsLoading(true);
      setError("");

      try {
        const res = await stableAuthFetch(
          `/api/v1/metrics/queries/by-user/${userId}?limit=500`,
          { method: "GET" },
        );

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody?.detail || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        setRows(Array.isArray(data?.queries) ? data.queries : []);
      } catch (e) {
        if (cancelled) return;
        setError(String(e?.message || e));
        setRows([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (session?.is_admin) run();

    return () => {
      cancelled = true;
    };
  }, [stableAuthFetch, userId, session?.is_admin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        lower(r.id).includes(q) ||
        lower(r.nl_query).includes(q) ||
        lower(r.language).includes(q) ||
        lower(r.result_type).includes(q)
      );
    });
  }, [rows, query]);

  if (!session || !session.is_admin) {
    return (
      <div className="AnalysesPage container">
        <div className="AnalysesPage-inner">
          <h1 className="analyses-title">{t("admin.accessDeniedTitle")}</h1>
          <p className="analyses-subtitle">{t("admin.accessDeniedText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="AnalysesPage container">
      <div className="AnalysesPage-inner">
        <header className="analyses-header">
          <div>
            <h1 className="analyses-title">{t("admin.userQueries.title")}</h1>
            <p className="analyses-subtitle">
              {t("admin.userQueries.subtitle", { userId })}
            </p>
          </div>

          <button
            type="button"
            className="btn btn-outline-light btn-sm"
            onClick={() => navigate(`/admin?tab=users&user=${userId}`)}
            title={t("admin.userQueries.back")}
          >
            {t("admin.userQueries.back")}
          </button>
        </header>

        <div className="analyses-toolbar">
          <input
            className="analyses-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("admin.userQueries.searchPlaceholder")}
            aria-label={t("admin.userQueries.searchPlaceholder")}
          />
        </div>

        {error ? <div className="analyses-empty">{error}</div> : null}

        {isLoading && (
          <div className="analyses-loading">
            <LoadingPage
              type="ring"
              fullscreen={false}
              message={t("analyses.loading")}
            />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="analyses-empty">{t("admin.userQueries.empty")}</div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="analyses-grid">
            {filtered.map((r) => {
              const ok = !!r.succeeded;
              const badge = ok ? "status-green" : "status-red";

              const subtitleBits = [
                `#${r.id}`,
                r.language ? r.language.toUpperCase() : null,
                `C${r.complexity_score ?? 0}`,
                `T ${fmtMs(r.total_latency_ms)}`,
              ].filter(Boolean);

              return (
                <button
                  key={r.id}
                  type="button"
                  className={`analyses-card ${badge}`}
                  onClick={() => setSelected(r)}
                  title={r.nl_query}
                >
                  <div className="uq-card-header">
                    <div className="uq-card-query" title={r.nl_query}>
                      {r.nl_query}
                    </div>

                    <div className="uq-card-meta">
                      #{r.id}
                      {r.language ? ` • ${r.language.toUpperCase()}` : ""}• C
                      {r.complexity_score ?? 0}• T {fmtMs(r.total_latency_ms)}
                    </div>
                  </div>

                  <div className="uq-card-metrics">
                    <span>LLM {fmtMs(r.llm_latency_ms)}</span>
                    <span>SPARQL {fmtMs(r.sparql_latency_ms)}</span>
                    <span>
                      {t("admin.userQueries.results")} {r.result_count ?? 0}
                    </span>
                    <span>{r.result_type || "—"}</span>
                  </div>

                  <div className="uq-card-flags">
                    <span>
                      {t("admin.userQueries.sparqlValid")}:{" "}
                      {r.sparql_valid ? t("common.yes") : t("common.no")}
                    </span>
                    <span>
                      {t("admin.userQueries.semanticValid")}:{" "}
                      {r.semantic_valid ? t("common.yes") : t("common.no")}
                    </span>
                    <span>
                      {t("admin.userQueries.federated")}:{" "}
                      {r.is_federated ? t("common.yes") : t("common.no")}
                    </span>
                  </div>

                  <div className="uq-card-footer">
                    <span>{new Date(r.created_at).toLocaleString()}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected && (
        <QueryDetailsModal
          t={t}
          queryId={selected.id}
          initialData={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
