// src/hooks/useLandingStreamManager.js
import { useCallback, useEffect, useMemo, useRef } from "react";

import { useLLMStream } from "@/hooks/useLLMStream";
import { useLandingTopQueries } from "@/hooks/useLandingTopQueries";

import { sanitizeChunk } from "@/utils/streamSanitizers";
import { kvToChartSpec } from "@/utils/kvCharts";
import { normalizeKvResultType } from "@/utils/landingMessageOps";
import { isValidKVTable } from "@/components/artifacts/KVTable";

export function useLandingStreamManager({
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
}) {
  const hasBackendStatusRef = useRef(false);

  const activeStreamRef = useRef({
    requestId: null,
    startedRouteConversationId: routeConversationId
      ? Number(routeConversationId)
      : null,
    resolvedConversationId: null,
  });

  const emitStreamEvent = useCallback((type, detail) => {
    try {
      window.dispatchEvent(new CustomEvent(type, { detail }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const id = routeConversationId ? Number(routeConversationId) : null;
    activeStreamRef.current.startedRouteConversationId = id;
  }, [routeConversationId]);

  const isViewingStreamConversation = useCallback(() => {
    const routeId = routeConversationId ? Number(routeConversationId) : null;
    const s = activeStreamRef.current;

    if (!routeId) {
      return s.startedRouteConversationId == null;
    }

    const targetId =
      typeof s.resolvedConversationId === "number" &&
      !Number.isNaN(s.resolvedConversationId)
        ? s.resolvedConversationId
        : s.startedRouteConversationId;

    return !!targetId && routeId === targetId;
  }, [routeConversationId]);

  const streamConvoKey = useCallback(() => {
    const s = activeStreamRef.current;
    const resolved = s?.resolvedConversationId;
    const started = s?.startedRouteConversationId;
    const cid =
      typeof resolved === "number" && Number.isFinite(resolved)
        ? resolved
        : typeof started === "number" && Number.isFinite(started)
          ? started
          : null;
    return cid != null ? `conv:${cid}` : "root";
  }, []);

  const handleStatus = useCallback(
    (text) => {
      if (!text) return;
      if (!isViewingStreamConversation()) return;

      hasBackendStatusRef.current = true;
      landing.upsertStatus(text);
    },
    [isViewingStreamConversation, landing],
  );

  const handleChunk = useCallback(
    (raw) => {
      const chunk = sanitizeChunk(raw);
      if (!chunk) return;
      if (!isViewingStreamConversation()) return;
      landing.appendAssistantChunk(chunk);
    },
    [isViewingStreamConversation, landing],
  );

  const handleKVResults = useCallback(
    (kv) => {
      if (!kv || !kv.result_type) return;
      if (!isViewingStreamConversation()) return;

      if (kv.result_type === "table") {
        if (!isValidKVTable(kv)) return;
        landing.addMessage("table", "", {
          kv,
          insertBeforeStreamingAssistant: true,
        });
        return;
      }

      let spec = kvToChartSpec(kv);

      if (!spec) {
        const normalized = normalizeKvResultType(kv.result_type);
        if (normalized && normalized !== kv.result_type) {
          spec = kvToChartSpec({ ...kv, result_type: normalized });
        }
      }

      if (!spec) return;

      landing.addMessage("chart", "", {
        vegaSpec: spec,
        kvType: normalizeKvResultType(kv.result_type),
        isKV: true,
        insertBeforeStreamingAssistant: true,
      });
    },
    [isViewingStreamConversation, landing],
  );

  const handleOnMetadata = useCallback(
    (meta) => {
      if (!meta) return;

      const rid = meta.requestId || null;
      const rawCid = meta.conversationId;
      const rawUserMsgId = meta.userMessageId;

      const cid =
        typeof rawCid === "number" && Number.isFinite(rawCid) ? rawCid : null;

      const userMessageId =
        typeof rawUserMsgId === "number" && Number.isFinite(rawUserMsgId)
          ? rawUserMsgId
          : null;

      if (!cid && !userMessageId) return;

      if (
        cid &&
        (activeStreamRef.current.startedRouteConversationId == null ||
          Number.isNaN(activeStreamRef.current.startedRouteConversationId))
      ) {
        migrateProcessingKey("root", `conv:${cid}`);
      }

      activeStreamRef.current = {
        ...activeStreamRef.current,
        requestId: rid || activeStreamRef.current.requestId,
        resolvedConversationId:
          cid || activeStreamRef.current.resolvedConversationId,
        startedRouteConversationId:
          activeStreamRef.current.startedRouteConversationId ?? null,
      };

      if (conversationMetaRef?.current) {
        conversationMetaRef.current = {
          ...conversationMetaRef.current,
          conversationId: cid || conversationMetaRef.current.conversationId,
          userMessageId:
            userMessageId || conversationMetaRef.current.userMessageId,
        };
      }

      if (cid && !activeStreamRef.current._streamStartEmitted) {
        activeStreamRef.current._streamStartEmitted = true;
        emitStreamEvent("cap:stream-start", { conversationId: cid });
      }
    },
    [conversationMetaRef, emitStreamEvent, migrateProcessingKey],
  );

  const handleDone = useCallback(() => {
    hasBackendStatusRef.current = false;

    setProcessingForKey(streamConvoKey(), false);

    const viewing = isViewingStreamConversation();

    if (viewing) {
      landing.clearStatus();
      landing.finalizeStreamingAssistant();
    } else {
      landing.dropAllStreamingAssistants();
    }

    landing.resetStreamRefs();

    const cid =
      activeStreamRef.current.resolvedConversationId ||
      activeStreamRef.current.startedRouteConversationId ||
      null;

    if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
  }, [
    emitStreamEvent,
    isViewingStreamConversation,
    landing,
    setProcessingForKey,
    streamConvoKey,
  ]);

  const handleError = useCallback(
    (err) => {
      hasBackendStatusRef.current = false;

      setProcessingForKey(streamConvoKey(), false);

      const viewing = isViewingStreamConversation();

      if (viewing) {
        landing.clearStatus();
        const msg = err?.message || t("landing.unexpectedError");
        addMessage("error", msg);
      } else {
        landing.dropAllStreamingAssistants();
      }

      landing.resetStreamRefs();

      const cid =
        activeStreamRef.current.resolvedConversationId ||
        activeStreamRef.current.startedRouteConversationId ||
        null;

      if (cid) emitStreamEvent("cap:stream-end", { conversationId: cid });
    },
    [
      addMessage,
      emitStreamEvent,
      isViewingStreamConversation,
      landing,
      setProcessingForKey,
      streamConvoKey,
      t,
    ],
  );

  const { start, stop } = useLLMStream({
    fetcher: (...args) => authFetchRef.current?.(...args),
    onStatus: handleStatus,
    onChunk: handleChunk,
    onKVResults: handleKVResults,
    onError: handleError,
    onMetadata: handleOnMetadata,
    acceptBareStatusLines: isDev && isDemoEndpoint,
    onDone: () => {
      handleDone();

      const convId = conversationMetaRef?.current?.conversationId;
      if (!routeConversationId && convId) {
        navigate(`/conversations/${convId}`, { replace: true });
      }
    },
  });

  useEffect(() => () => stop(), [stop]);

  const { topQueries } = useLandingTopQueries({
    authFetchRef,
    initialTopQueries: isDev
      ? [
          { query: "Heatmap of transaction activity by day and hour" },
          { query: "Treemap breaking down NFT mints by policy ID" },
          { query: "Transaction fee vs transaction value" },
          { query: "Bubble chart representing governance proposals" },
          { query: "Markdown formatting test" },
          { query: "Current trends" },
          { query: "List the latest 5 blocks" },
          { query: "Show the last 5 proposals" },
          {
            query:
              "Plot a bar chart showing monthly multi assets created in 2021",
          },
          {
            query:
              "Plot a line chart showing monthly number of transactions and outputs",
          },
          {
            query:
              "Plot a pie chart to show how much the top 1% ADA holders represent from the total supply on the Cardano network",
          },
          {
            query:
              "how many blocks were produced by this SPO pool18rjrygm3knlt67n3r3prlhnzcjxun7wa8d3l8w9nmlpasquv4au in the current epoch?",
          },
        ]
      : undefined,
    limit: 5,
    refreshMs: 5 * 60 * 1000,
  });

  const sendQuery = useCallback(() => {
    const trimmed = (query || "").trim();
    const fetchFn = authFetchRef.current;

    if (readOnly) return;
    if (!trimmed || isProcessing || !fetchFn || isSyncBlocked) return;

    landing.resetStreamRefs();
    hasBackendStatusRef.current = false;

    if (conversationMetaRef?.current) {
      conversationMetaRef.current.emittedCreatedEvent = false;
    }

    landing.addMessage("user", trimmed);
    setQuery("");
    setCharCount(0);

    landing.ensureStreamingAssistant();

    if (
      !hasBackendStatusRef.current &&
      !activeStreamRef.current._fallbackStatusWritten
    ) {
      activeStreamRef.current._fallbackStatusWritten = true;
      landing.upsertStatus(t("landing.statusPlanning"));
    }

    const demoDelayMs = Number(import.meta.env.VITE_DEMO_STREAM_DELAY_MS || 0);
    const shouldDelay =
      isDev &&
      isDemoEndpoint &&
      Number.isFinite(demoDelayMs) &&
      demoDelayMs > 0;

    const body = {
      query: trimmed,
      conversation_id: routeConversationId ? Number(routeConversationId) : null,
      ...(shouldDelay ? { delay_ms: demoDelayMs } : {}),
    };

    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    activeStreamRef.current = {
      requestId,
      startedRouteConversationId: routeConversationId
        ? Number(routeConversationId)
        : null,
      resolvedConversationId: null,
    };

    landing.bindStreamScope({
      requestId,
      conversationId: routeConversationId ? Number(routeConversationId) : null,
    });

    const startedKey = routeConversationId
      ? `conv:${Number(routeConversationId)}`
      : "root";
    setProcessingForKey(startedKey, true, { requestId });

    start({
      url: NL_ENDPOINT,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body,
    });
  }, [
    NL_ENDPOINT,
    authFetchRef,
    conversationMetaRef,
    isDemoEndpoint,
    isDev,
    isProcessing,
    isSyncBlocked,
    landing,
    query,
    readOnly,
    routeConversationId,
    setCharCount,
    setProcessingForKey,
    setQuery,
    start,
    t,
  ]);

  return useMemo(
    () => ({
      topQueries,
      sendQuery,
    }),
    [topQueries, sendQuery],
  );
}
