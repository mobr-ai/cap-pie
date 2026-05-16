// src/pages/LandingPage.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useOutletContext,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";

import { useTranslation } from "react-i18next";

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import { useLandingMessages } from "@/hooks/useLandingMessages";
import { useLandingAutoScroll } from "@/hooks/useLandingAutoScroll";
import { useLandingConversationLoader } from "@/hooks/useLandingConversationLoader";
import { useLandingStreamManager } from "@/hooks/useLandingStreamManager";
import { useLandingArtifactActions } from "@/hooks/useLandingArtifactActions";

import ArtifactToolButton from "@/components/landing/ArtifactToolButton";
import TopQueries from "@/components/landing/TopQueries";
import ChatInput from "@/components/landing/ChatInput";
import LandingEmptyState from "@/components/landing/LandingEmptyState";
import ChatFeed from "@/components/landing/ChatFeed";

import ShareModal from "@/components/ShareModal";
import { getSessionUserId } from "@/utils/authUtils";

import "@/styles/LandingPage.css";

export default function LandingPage() {
  const NL_ENDPOINT = import.meta.env.VITE_NL_ENDPOINT || "/api/v1/nl/query";

  const outlet = useOutletContext() || {};
  const { session, showToast, healthOnline, syncStatus } = outlet;
  const { authFetch } = useAuthRequest({ session, showToast });
  const authFetchRef = useRef(null);

  useEffect(() => {
    authFetchRef.current = authFetch;
  }, [authFetch]);

  const navigate = useNavigate();
  const { conversationId: routeConversationId } = useParams();
  const { t } = useTranslation();

  const [query, setQuery] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [processingByKey, setProcessingByKey] = useState({});
  const [conversationOwnerId, setConversationOwnerId] = useState(null);

  // Block queries if sync service is Offline or Unknown
  const statusCode = String(syncStatus?.code || "unknown");
  const isSyncUnknown = statusCode === "unknown" || statusCode === "checking";
  const isSyncOffline = healthOnline === false;
  const isSyncBlocked = isSyncOffline || isSyncUnknown || healthOnline == null;

  const location = useLocation();

  const routeConvoKey = routeConversationId
    ? `conv:${Number(routeConversationId)}`
    : "root";

  const isProcessing = !!processingByKey?.[routeConvoKey]?.isProcessing;

  const setProcessingForKey = useCallback((key, isProc, extra = {}) => {
    if (!key) return;
    setProcessingByKey((prev) => {
      const next = { ...(prev || {}) };
      const existing = next[key] || {};
      next[key] = {
        ...existing,
        ...extra,
        isProcessing: !!isProc,
      };
      return next;
    });
  }, []);

  const migrateProcessingKey = useCallback((fromKey, toKey) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    setProcessingByKey((prev) => {
      const p = prev || {};
      const from = p[fromKey];
      if (!from?.isProcessing) return prev;

      const next = { ...p };
      delete next[fromKey];
      next[toKey] = { ...(next[toKey] || {}), ...from, isProcessing: true };
      return next;
    });
  }, []);

  // Prefer location.state (internal navigation), fallback to URL (?mid=123)
  const initialScrollMessageId = React.useMemo(() => {
    const st = location?.state || {};
    const v =
      st.initialScrollMessageId ??
      st.focusMessageId ??
      st.conversation_message_id ??
      st.conversationMessageId ??
      null;

    if (v != null) return String(v);

    const params = new URLSearchParams(location?.search || "");
    const mid = params.get("mid") || params.get("messageId") || null;
    return mid ? String(mid) : null;
  }, [location?.state, location?.search]);

  const isAdminReadonlyRoute = location.pathname.startsWith(
    "/admin/conversations/",
  );
  const sessionUserId = getSessionUserId(session);

  const [conversationTitle, setConversationTitle] = useState("");

  const isOwner =
    sessionUserId != null &&
    conversationOwnerId != null &&
    String(sessionUserId) === String(conversationOwnerId);

  const readOnly = !!isAdminReadonlyRoute && !isOwner;

  const sendBlockedReason = isSyncOffline
    ? t(
        "landing.syncBlockedOffline",
        "Sync service is offline. Try again soon.",
      )
    : t(
        "landing.syncBlockedUnknown",
        "Sync service status is unknown. Please wait a moment and retry.",
      );

  const landing = useLandingMessages();
  const { messages, setMessages, addMessage } = landing;

  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);

  const chartViewByMsgIdRef = useRef(new Map());
  const tableElByMsgIdRef = useRef(new Map());
  const chartElByMsgIdRef = useRef(new Map());

  const handleSharePayload = useCallback(
    (payload) => {
      if (payload?.error === "share_failed") {
        showToast?.(t("dashboard.widgetShareFailed"), "danger");
        return;
      }
      setSharePayload(payload);
      setShareOpen(true);
    },
    [showToast, t],
  );

  const conversationMetaRef = useRef({
    conversationId: routeConversationId ? Number(routeConversationId) : null,
    userMessageId: null,
    emittedCreatedEvent: false,
  });

  const messagesEndRef = useRef(null);
  const messageElsRef = useRef(new Map());

  const { isLoadingConversation } = useLandingConversationLoader({
    routeConversationId,
    authFetchRef,
    setMessages,
    setConversationTitle,
    setConversationOwnerId,
    showToast,
    t,
    mode: isAdminReadonlyRoute ? "admin" : "user",
  });

  const { scrollToBottom } = useLandingAutoScroll({
    messages,
    isLoadingConversation,
    routeConversationId,
    messagesEndRef,
    messageElsRef,
    initialScrollMessageId,
  });

  useEffect(() => {
    const id = routeConversationId;
    conversationMetaRef.current.conversationId = id ? Number(id) : null;
  }, [routeConversationId]);

  const isDev = import.meta.env.DEV === true;
  const isDemoEndpoint = String(NL_ENDPOINT || "").includes(
    "/api/v1/demo/nl/query",
  );

  const streamManager = useLandingStreamManager({
    NL_ENDPOINT,
    routeConversationId,
    isDev,
    isDemoEndpoint,
    t,
    navigate,
    authFetchRef,
    readOnly,
    isSyncBlocked,
    isProcessing,
    query,
    setQuery,
    setCharCount,
    setProcessingForKey,
    migrateProcessingKey,
    landing,
    conversationMetaRef,
    addMessage,
  });

  const { pinArtifact, shareArtifact } = useLandingArtifactActions({
    authFetchRef,
    showToast,
    t,
    navigate,
    messages,
    conversationTitle,
    conversationMetaRef,
    routeConversationId,
    tableElByMsgIdRef,
    handleSharePayload,
  });

  const sendQuery = useCallback(() => {
    if (readOnly) {
      showToast?.(t("admin.queryDetails.readOnlyConversation"), "secondary");
      return;
    }
    streamManager.sendQuery();
  }, [readOnly, showToast, t, streamManager]);

  const isEmptyState = messages.length === 0 && !isLoadingConversation;

  return (
    <div className="cap-root">
      <div className="container">
        <div className={`chat-container ${isEmptyState ? "is-empty" : ""}`}>
          <div className="messages">
            {isEmptyState ? (
              <LandingEmptyState
                t={t}
                topQueries={streamManager.topQueries}
                isProcessing={isProcessing}
                typingMsPerChar={18}
                pauseAfterTypedMs={2800}
                fadeMs={200}
              />
            ) : (
              <ChatFeed
                messages={messages}
                messageElsRef={messageElsRef}
                pinArtifact={pinArtifact}
                shareArtifact={shareArtifact}
                chartElByMsgIdRef={chartElByMsgIdRef}
                chartViewByMsgIdRef={chartViewByMsgIdRef}
                tableElByMsgIdRef={tableElByMsgIdRef}
                ArtifactToolBtn={ArtifactToolButton}
              />
            )}
          </div>

          <div className="input-container">
            <div
              className={`top-queries-wrap ${
                isEmptyState ? "is-visible" : "is-hidden"
              }`}
              aria-hidden={!isEmptyState}
            >
              <TopQueries
                title={t("landing.topQueriesTitle")}
                topQueries={streamManager.topQueries}
                isProcessing={isProcessing}
                onSelectQuery={(q) => {
                  setQuery(q.query);
                  setCharCount(q.query.length);
                  scrollToBottom("smooth");
                }}
              />
            </div>

            <ChatInput
              readOnly={readOnly}
              readOnlyReason={t("admin.queryDetails.readOnlyConversation")}
              query={query}
              setQuery={setQuery}
              charCount={charCount}
              setCharCount={setCharCount}
              isProcessing={isProcessing}
              isSyncBlocked={isSyncBlocked}
              syncBlockedReason={sendBlockedReason}
              maxLength={1000}
              placeholder={t("landing.inputPlaceholder")}
              charCountText={t("landing.charCount", {
                count: charCount,
                max: 1000,
              })}
              processingLabel={t("landing.processing")}
              sendLabel={t("landing.send")}
              onSend={sendQuery}
            />
          </div>
          <div ref={messagesEndRef} />
        </div>

        <ShareModal
          show={shareOpen}
          onHide={() => setShareOpen(false)}
          title={sharePayload?.title || "CAP"}
          hashtags={sharePayload?.hashtags || ["CAP"]}
          link={null}
          message={sharePayload?.message || ""}
          imageDataUrl={sharePayload?.imageDataUrl || null}
        />
      </div>
    </div>
  );
}
