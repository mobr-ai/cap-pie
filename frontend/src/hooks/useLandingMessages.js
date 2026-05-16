// src/hooks/useLandingMessages.js
import { useCallback, useRef, useState } from "react";
import { appendChunkSmart } from "@/utils/landingMessageOps";
import { finalizeForRender } from "@/utils/streamSanitizers";

/**
 * Streaming assistant scoping:
 * - We attach streamRequestId / streamConversationId to the streaming assistant message
 * - We keep a current "stream scope" in streamScopeRef
 * - When scoped: streaming updates ONLY target the scoped message (never fallback),
 *   otherwise they are buffered.
 *
 * This prevents late SSE events from mutating the wrong conversation message list
 * when the UI route changes mid-stream.
 */
export function useLandingMessages() {
  const [messages, setMessages] = useState([]);

  // Legacy "current streaming assistant id" (still used as a fallback in UNSCOPED mode)
  const streamingAssistantIdRef = useRef(null);

  // Buffered status in case status arrives before ensureStreamingAssistant (legacy buffer)
  const pendingStatusRef = useRef("");

  // Prevent double-ensure in same tick
  const ensuringRef = useRef(false);

  // current stream scope; set by caller (LandingPage) per request
  // { requestId: string|null, conversationId: number|null }
  const streamScopeRef = useRef({ requestId: null, conversationId: null });

  // NEW: scoped buffers to prevent leakage when user navigates away mid-stream
  // Prefer requestId; fallback to conversationId if requestId is missing.
  const bufferedStatusByKeyRef = useRef(new Map()); // Map<key, string>
  const bufferedContentByKeyRef = useRef(new Map()); // Map<key, string>

  const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

  const normalizeScope = (scope) => {
    const requestId =
      scope?.requestId != null && String(scope.requestId).trim()
        ? String(scope.requestId)
        : null;

    const conversationId = isFiniteNumber(scope?.conversationId)
      ? scope.conversationId
      : scope?.conversationId != null && String(scope.conversationId).trim()
        ? Number(scope.conversationId)
        : null;

    return {
      requestId,
      conversationId: Number.isFinite(conversationId) ? conversationId : null,
    };
  };

  const scopeKey = (scope) => {
    const s = normalizeScope(scope);
    if (s.requestId) return `rid:${String(s.requestId)}`;
    if (s.conversationId != null) return `cid:${String(s.conversationId)}`;
    return null;
  };

  const isScoped = (scope) => {
    const s = normalizeScope(scope);
    return !!s.requestId || s.conversationId != null;
  };

  const bindStreamScope = useCallback((scope) => {
    streamScopeRef.current = normalizeScope(scope);
  }, []);

  const clearStreamScope = useCallback(() => {
    const k = scopeKey(streamScopeRef.current);
    if (k) {
      bufferedStatusByKeyRef.current.delete(k);
      bufferedContentByKeyRef.current.delete(k);
    }
    streamScopeRef.current = { requestId: null, conversationId: null };
  }, []);

  const scopeMatchesMessage = (m, scope) => {
    if (!m) return false;
    if (m.type !== "assistant" || !m.streaming) return false;

    const s = normalizeScope(scope);
    const rid = s.requestId;
    const cid = s.conversationId;

    // If we have a requestId, it must match.
    if (rid) {
      return String(m.streamRequestId || "") === String(rid);
    }

    // Otherwise, if we have a conversationId, match that.
    if (cid != null) {
      return String(m.streamConversationId || "") === String(cid);
    }

    return false;
  };

  const findScopedStreamingAssistantIndex = (arr) => {
    const scope = streamScopeRef.current || {
      requestId: null,
      conversationId: null,
    };
    const s = normalizeScope(scope);
    const rid = s.requestId;
    const cid = s.conversationId;

    if (!Array.isArray(arr) || arr.length === 0) return -1;

    // Strong match: requestId
    if (rid) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const m = arr[i];
        if (
          m?.type === "assistant" &&
          m?.streaming &&
          String(m.streamRequestId || "") === String(rid)
        ) {
          return i;
        }
      }
      return -1;
    }

    // Secondary match: conversationId
    if (cid != null) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const m = arr[i];
        if (
          m?.type === "assistant" &&
          m?.streaming &&
          String(m.streamConversationId || "") === String(cid)
        ) {
          return i;
        }
      }
      return -1;
    }

    return -1;
  };

  const findLastStreamingAssistantIndex = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0) return -1;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]?.type === "assistant" && arr[i]?.streaming) return i;
    }
    return -1;
  };

  const consumeScopedBuffersIntoMessage = (msg, scope) => {
    const k = scopeKey(scope);
    if (!k) return msg;

    const bufferedStatus = String(
      bufferedStatusByKeyRef.current.get(k) || "",
    ).trim();
    const bufferedContent = String(
      bufferedContentByKeyRef.current.get(k) || "",
    );

    if (bufferedStatus) bufferedStatusByKeyRef.current.delete(k);
    if (bufferedContent) bufferedContentByKeyRef.current.delete(k);

    const next = { ...msg };
    if (bufferedStatus && !String(next.statusText || "").trim()) {
      next.statusText = bufferedStatus;
    }
    if (bufferedContent) {
      next.content = appendChunkSmart(next.content || "", bufferedContent);
    }
    return next;
  };

  const ensureStreamingAssistant = useCallback((initial = {}) => {
    if (ensuringRef.current) return;
    ensuringRef.current = true;
    queueMicrotask(() => {
      ensuringRef.current = false;
    });

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];
      const scope = streamScopeRef.current || {
        requestId: null,
        conversationId: null,
      };
      const scoped = isScoped(scope);

      // 1) Prefer scoped assistant if present
      let idx = findScopedStreamingAssistantIndex(next);
      if (idx >= 0) {
        streamingAssistantIdRef.current = next[idx].id;
        return prev;
      }

      // IMPORTANT: if scoped, DO NOT fall back to other assistants.
      // We must create a scoped one to avoid leaking into whatever convo is currently shown.
      if (scoped) {
        const id = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        streamingAssistantIdRef.current = id;

        const pendingStatus = String(pendingStatusRef.current || "").trim();
        pendingStatusRef.current = "";

        let msg = {
          id,
          type: "assistant",
          content: "",
          streaming: true,
          statusText: pendingStatus || "",
          streamRequestId: normalizeScope(scope).requestId || null,
          streamConversationId: normalizeScope(scope).conversationId ?? null,
          ...initial,
        };

        msg = consumeScopedBuffersIntoMessage(msg, scope);

        next.push(msg);
        return next;
      }

      // 2) UNSCOPED: Prefer legacy tracked id if it exists and is streaming
      const sid = streamingAssistantIdRef.current;
      if (sid) {
        const sidx = next.findIndex((m) => m?.id === sid);
        if (
          sidx >= 0 &&
          next[sidx]?.type === "assistant" &&
          next[sidx]?.streaming
        ) {
          return prev;
        }
      }

      // 3) UNSCOPED: Fallback: find last streaming assistant anywhere
      idx = findLastStreamingAssistantIndex(next);
      if (idx >= 0) {
        streamingAssistantIdRef.current = next[idx].id;
        return prev;
      }

      // 4) UNSCOPED: Otherwise, create a new streaming assistant
      const id = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamingAssistantIdRef.current = id;

      const pendingStatus = String(pendingStatusRef.current || "").trim();
      pendingStatusRef.current = "";

      next.push({
        id,
        type: "assistant",
        content: "",
        streaming: true,
        statusText: pendingStatus || "",
        streamRequestId: null,
        streamConversationId: null,
        ...initial,
      });

      return next;
    });
  }, []);

  const addMessage = useCallback((type, content, extra = {}) => {
    const id =
      extra.id ||
      `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const insertBeforeStreamingAssistant =
      extra.insertBeforeStreamingAssistant === true;

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];
      const msg = { id, type, content, ...extra };

      if (!insertBeforeStreamingAssistant) {
        next.push(msg);
        return next;
      }

      const scope = streamScopeRef.current || {
        requestId: null,
        conversationId: null,
      };
      const scoped = isScoped(scope);

      // Prefer inserting before the scoped streaming assistant, if any.
      let sidx = findScopedStreamingAssistantIndex(next);

      // If scoped and no scoped assistant exists in this list, DO NOT insert before some other convo's stream.
      if (scoped && sidx < 0) {
        next.push(msg);
        return next;
      }

      // UNSCOPED fallback: legacy ref
      if (sidx < 0) {
        const sid = streamingAssistantIdRef.current;
        if (sid) {
          const idx = next.findIndex((m) => m.id === sid && m.streaming);
          if (idx >= 0) sidx = idx;
        }
      }

      // UNSCOPED fallback: last streaming assistant
      if (sidx < 0) {
        sidx = findLastStreamingAssistantIndex(next);
      }

      if (sidx < 0) {
        next.push(msg);
        return next;
      }

      next.splice(sidx, 0, msg);
      return next;
    });

    return id;
  }, []);

  const updateMessage = useCallback((id, patch) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  }, []);

  const removeMessage = useCallback((id) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const upsertStatus = useCallback((text) => {
    if (!text) return;

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];
      const scope = streamScopeRef.current || {
        requestId: null,
        conversationId: null,
      };
      const scoped = isScoped(scope);

      // 1) Scoped target
      let idx = findScopedStreamingAssistantIndex(next);

      if (idx >= 0) {
        streamingAssistantIdRef.current = next[idx].id;
        next[idx] = { ...next[idx], statusText: text };
        return next;
      }

      // If scoped and not found in this list: BUFFER (do not leak)
      if (scoped) {
        const k = scopeKey(scope);
        if (k) bufferedStatusByKeyRef.current.set(k, text);
        return prev;
      }

      // 2) UNSCOPED legacy tracked id
      const sid = streamingAssistantIdRef.current;
      if (sid) {
        const tIdx = next.findIndex((m) => m.id === sid);
        const ok =
          tIdx >= 0 &&
          next[tIdx]?.type === "assistant" &&
          next[tIdx]?.streaming;
        if (ok) {
          next[tIdx] = { ...next[tIdx], statusText: text };
          return next;
        }
      }

      // 3) UNSCOPED fallback: last streaming assistant
      idx = findLastStreamingAssistantIndex(next);

      if (idx >= 0) {
        streamingAssistantIdRef.current = next[idx].id;
        next[idx] = { ...next[idx], statusText: text };
        return next;
      }

      // No assistant to write into yet, buffer the status
      pendingStatusRef.current = text;
      return next;
    });
  }, []);

  const appendAssistantChunk = useCallback((chunk) => {
    if (!chunk) return;

    setMessages((prev) => {
      const next = Array.isArray(prev) ? prev.slice() : [];
      const scope = streamScopeRef.current || {
        requestId: null,
        conversationId: null,
      };
      const scoped = isScoped(scope);

      // 1) Scoped target
      let idx = findScopedStreamingAssistantIndex(next);

      if (idx >= 0) {
        const nextContent = appendChunkSmart(next[idx].content || "", chunk);
        if (nextContent === next[idx].content) return prev;
        next[idx] = { ...next[idx], content: nextContent };
        streamingAssistantIdRef.current = next[idx].id;
        return next;
      }

      // If scoped and not found in this list: BUFFER (do not leak)
      if (scoped) {
        const k = scopeKey(scope);
        if (k) {
          const cur = String(bufferedContentByKeyRef.current.get(k) || "");
          bufferedContentByKeyRef.current.set(k, appendChunkSmart(cur, chunk));
        }
        return prev;
      }

      // 2) UNSCOPED legacy tracked id
      const sid = streamingAssistantIdRef.current;
      if (sid) {
        const tIdx = next.findIndex((m) => m.id === sid);
        const ok =
          tIdx >= 0 &&
          next[tIdx]?.type === "assistant" &&
          next[tIdx]?.streaming;
        if (ok) {
          const nextContent = appendChunkSmart(next[tIdx].content || "", chunk);
          if (nextContent === next[tIdx].content) return prev;
          next[tIdx] = { ...next[tIdx], content: nextContent };
          return next;
        }
      }

      // 3) UNSCOPED fallback: last streaming assistant
      idx = findLastStreamingAssistantIndex(next);
      if (idx >= 0) {
        const nextContent = appendChunkSmart(next[idx].content || "", chunk);
        if (nextContent === next[idx].content) return prev;
        next[idx] = { ...next[idx], content: nextContent };
        streamingAssistantIdRef.current = next[idx].id;
        return next;
      }

      // None exists at all -> create a new (unscoped) streaming assistant
      const id = `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      streamingAssistantIdRef.current = id;

      next.push({
        id,
        type: "assistant",
        content: chunk,
        streaming: true,
        statusText: "",
        streamRequestId: null,
        streamConversationId: null,
      });

      return next;
    });
  }, []);

  const finalizeStreamingAssistant = useCallback(() => {
    const scope = streamScopeRef.current || {
      requestId: null,
      conversationId: null,
    };
    const scoped = isScoped(scope);
    const targetId = streamingAssistantIdRef.current;

    setMessages((prev) =>
      prev.map((m) => {
        if (m?.type !== "assistant" || !m?.streaming) return m;

        // 1) If scoped, finalize only the scoped assistant
        if (scoped) {
          if (!scopeMatchesMessage(m, scope)) return m;
          return {
            ...m,
            streaming: false,
            statusText: "",
            content: finalizeForRender(m.content || ""),
          };
        }

        // 2) If we know a target id, finalize only that one
        if (targetId) {
          if (m.id !== targetId) return m;
          return {
            ...m,
            streaming: false,
            statusText: "",
            content: finalizeForRender(m.content || ""),
          };
        }

        // 3) Fallback: finalize any streaming assistant
        return {
          ...m,
          streaming: false,
          statusText: "",
          content: finalizeForRender(m.content || ""),
        };
      }),
    );

    streamingAssistantIdRef.current = null;
    pendingStatusRef.current = "";

    // Clear scoped buffers for this scope too
    const k = scopeKey(scope);
    if (k) {
      bufferedStatusByKeyRef.current.delete(k);
      bufferedContentByKeyRef.current.delete(k);
    }

    clearStreamScope();
  }, [clearStreamScope]);

  const dropAllStreamingAssistants = useCallback(() => {
    const scope = streamScopeRef.current || {
      requestId: null,
      conversationId: null,
    };
    const scoped = isScoped(scope);

    setMessages((prev) => {
      const arr = Array.isArray(prev) ? prev : [];

      // If scoped, only drop scoped streaming assistants.
      if (scoped) {
        return arr.filter(
          (m) =>
            !(
              m?.type === "assistant" &&
              m?.streaming &&
              scopeMatchesMessage(m, scope)
            ),
        );
      }

      // Otherwise drop all streaming assistants.
      return arr.filter((m) => !(m?.type === "assistant" && m?.streaming));
    });
  }, []);

  const clearStatus = useCallback(() => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.type !== "assistant") return m;
        if (!String(m.statusText || "").trim()) return m;
        return { ...m, statusText: "" };
      }),
    );
  }, []);

  const resetStreamRefs = useCallback(() => {
    streamingAssistantIdRef.current = null;
    pendingStatusRef.current = "";

    // Don’t nuke scoped buffers here; they may be needed if user navigated away.
    // But if you want resetStreamRefs to be a "hard reset", uncomment:
    // const k = scopeKey(streamScopeRef.current);
    // if (k) {
    //   bufferedStatusByKeyRef.current.delete(k);
    //   bufferedContentByKeyRef.current.delete(k);
    // }

    clearStreamScope();
  }, [clearStreamScope]);

  return {
    messages,
    setMessages,
    streamingAssistantIdRef,

    bindStreamScope,
    clearStreamScope,

    addMessage,
    updateMessage,
    removeMessage,
    upsertStatus,
    appendAssistantChunk,
    finalizeStreamingAssistant,
    clearStatus,
    dropAllStreamingAssistants,
    resetStreamRefs,
    ensureStreamingAssistant,
  };
}
