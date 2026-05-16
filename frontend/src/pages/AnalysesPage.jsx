// src/pages/AnalysesPage.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthRequest } from "@/hooks/useAuthRequest";
import useConversations from "@/hooks/useConversations";
import LoadingPage from "@/pages/LoadingPage";

import "@/styles/AnalysesPage.css";

const lower = (v) => String(v ?? "").toLowerCase();

export default function AnalysesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, showToast, handleLogout } = useOutletContext() || {};

  const [processingConversationId, setProcessingConversationId] =
    useState(null);

  // Gleam effect for processing convos
  useEffect(() => {
    // If a stream started before this page mounted, pick up the current state.
    const initial = window.__capProcessingConversationId;
    if (initial) setProcessingConversationId(Number(initial));

    const onStart = (e) => {
      const cid = e?.detail?.conversationId
        ? Number(e.detail.conversationId)
        : null;
      if (cid && !Number.isNaN(cid)) setProcessingConversationId(cid);
    };

    const onEnd = (e) => {
      const cid = e?.detail?.conversationId
        ? Number(e.detail.conversationId)
        : null;
      setProcessingConversationId((prev) => {
        if (!cid) return null;
        return prev === cid ? null : prev;
      });
    };

    const onState = (e) => {
      const cid = e?.detail?.conversationId
        ? Number(e.detail.conversationId)
        : null;
      setProcessingConversationId(cid && !Number.isNaN(cid) ? cid : null);
    };

    window.addEventListener("cap:stream-start", onStart);
    window.addEventListener("cap:stream-end", onEnd);
    window.addEventListener("cap:stream-state", onState);
    return () => {
      window.removeEventListener("cap:stream-start", onStart);
      window.removeEventListener("cap:stream-end", onEnd);
      window.removeEventListener("cap:stream-state", onState);
    };
  }, []);

  // Keep using your existing hook as-is
  const { authFetch } = useAuthRequest({
    session,
    showToast,
    handleLogout,
  });

  // ---- Make authFetch stable for useConversations to avoid storms ----
  const authFetchRef = useRef(authFetch);
  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const stableAuthFetch = useCallback((url, options) => {
    return authFetchRef.current(url, options);
  }, []);
  // -------------------------------------------------------------------

  // IMPORTANT: enabled must be true, otherwise load() will never run
  const { conversations, isLoading } = useConversations({
    authFetch: stableAuthFetch,
    enabled: !!session,
    limit: 50,
    showToast,
    t,
  });

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;

    return conversations.filter((c) => {
      return (
        lower(c?.title).includes(q) ||
        lower(c?.last_message_preview).includes(q) ||
        lower(c?.id).includes(q)
      );
    });
  }, [conversations, query]);

  if (!session) {
    return (
      <div className="AnalysesPage container">
        <div className="AnalysesPage-inner">
          <h1 className="analyses-title">{t("analyses.accessDeniedTitle")}</h1>
          <p className="analyses-subtitle">{t("analyses.accessDeniedText")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="AnalysesPage container">
      <div className="AnalysesPage-inner">
        <header className="analyses-header">
          <div>
            <h1 className="analyses-title">{t("analyses.title")}</h1>
            <p className="analyses-subtitle">{t("analyses.subtitle")}</p>
          </div>
        </header>

        <div className="analyses-toolbar">
          <input
            className="analyses-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("analyses.searchPlaceholder")}
            aria-label={t("analyses.searchPlaceholder")}
          />
        </div>

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
          <div className="analyses-empty">{t("analyses.empty")}</div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="analyses-grid">
            {filtered.map((c) => {
              const title = c?.title || t("nav.untitledConversation");
              const preview = c?.last_message_preview;
              const isProcessingConv =
                Number(processingConversationId) === Number(c?.id);

              return (
                <button
                  key={c.id}
                  type="button"
                  className={`analyses-card ${
                    isProcessingConv ? "processing" : ""
                  }`}
                  onClick={() => navigate(`/conversations/${c.id}`)}
                  title={preview || title}
                >
                  <div className="analyses-card-top">
                    <div className="analyses-card-title">{title}</div>
                    <div className="analyses-card-meta">#{c.id}</div>
                  </div>

                  {preview ? (
                    <div className="analyses-card-preview">{preview}</div>
                  ) : (
                    <div className="analyses-card-preview muted">
                      {t("analyses.noPreview")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
