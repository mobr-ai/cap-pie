// src/hooks/useLandingConversationLoader.js
import { useEffect, useRef, useState } from "react";
import {
  mergeById,
  injectArtifactsAfterMessage,
} from "@/utils/landingMessageOps";

export function useLandingConversationLoader({
  routeConversationId,
  authFetchRef,
  setMessages,
  setConversationTitle,
  setConversationOwnerId,
  showToast,
  t,
  mode = "user", // "user" | "admin"
}) {
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);

  const lastCommittedConversationIdRef = useRef(null);
  const routeLoadTokenRef = useRef(0);
  const lastAppliedSigRef = useRef({ id: null, sig: null });

  // Single monotonic token for "latest load wins"
  const loadSeqRef = useRef(0);

  useEffect(() => {
    const fetchFn = authFetchRef?.current;

    const isRootRoute =
      routeConversationId == null || routeConversationId === "";
    const parsedId = isRootRoute ? null : Number(routeConversationId);
    const id = Number.isFinite(parsedId) ? parsedId : null;

    // No fetch function yet: stop loading, do not mutate messages
    if (!fetchFn) {
      setIsLoadingConversation(false);
      return;
    }

    // Param exists but not valid numeric yet
    if (!isRootRoute && id == null) {
      setIsLoadingConversation(false);
      return;
    }

    // "/" route behavior
    if (isRootRoute) {
      if (lastCommittedConversationIdRef.current != null) {
        setMessages([]);
        lastCommittedConversationIdRef.current = null;
        lastAppliedSigRef.current = { id: null, sig: null };
      }
      setConversationTitle?.("");
      setConversationOwnerId?.(null);
      setIsLoadingConversation(false);
      return;
    }

    const prevCommittedId = lastCommittedConversationIdRef.current;
    const isRouteSwitch = prevCommittedId !== id;

    // Immediately reflect route switch in UI (empty + loading)
    if (isRouteSwitch) {
      setMessages([]);
      setConversationTitle?.("");
      setConversationOwnerId?.(null);
      routeLoadTokenRef.current += 1;
      lastAppliedSigRef.current = { id: null, sig: null };
    }

    // Mark loading immediately on any valid conversation route
    setIsLoadingConversation(true);

    const controller = new AbortController();
    const loadSeq = (loadSeqRef.current += 1);
    let cancelled = false;

    (async () => {
      try {
        const url =
          mode === "admin"
            ? `/api/v1/admin/conversations/${id}`
            : `/api/v1/conversations/${id}`;

        const res = await fetchFn(url, { signal: controller.signal });
        if (!res?.ok) throw new Error("Failed to load conversation");

        const data = await res.json();

        if (cancelled) return;
        if (loadSeqRef.current !== loadSeq) return;

        const ownerId = mode === "admin" ? (data?.user_id ?? null) : null;
        setConversationOwnerId?.(ownerId != null ? Number(ownerId) : null);

        setConversationTitle?.(
          String(data?.title || data?.conversation?.title || ""),
        );

        const restoredMsgsRaw = (data?.messages || []).map((m) => {
          const msgIdNum = m?.id;
          const role = m?.role;
          const isUser = role === "user";
          return {
            id: `conv_${msgIdNum}`,
            conv_message_id: msgIdNum,
            type: isUser ? "user" : "assistant",
            content: m?.content || "",
          };
        });

        const restoredWithArtifactsBase = injectArtifactsAfterMessage(
          restoredMsgsRaw,
          data?.artifacts || [],
        );

        const replayKey = routeLoadTokenRef.current;

        let lastAssistantId = null;
        for (let i = restoredWithArtifactsBase.length - 1; i >= 0; i--) {
          if (restoredWithArtifactsBase[i]?.type === "assistant") {
            lastAssistantId = restoredWithArtifactsBase[i].id;
            break;
          }
        }

        const restoredWithArtifacts = lastAssistantId
          ? restoredWithArtifactsBase.map((m) =>
              m.id === lastAssistantId
                ? { ...m, replayTyping: true, replayKey }
                : m,
            )
          : restoredWithArtifactsBase;

        const sig = JSON.stringify(
          restoredWithArtifacts.map((m) => ({
            id: m.id,
            type: m.type,
            content: m.content,
            replayTyping: !!m.replayTyping,
            replayKey: m.replayKey || 0,
            statusText: m.statusText || "",
            streaming: !!m.streaming,
            kind: m.kind || "",
          })),
        );

        if (
          lastAppliedSigRef.current.id === id &&
          lastAppliedSigRef.current.sig === sig
        ) {
          lastCommittedConversationIdRef.current = id;
          return;
        }

        lastAppliedSigRef.current = { id, sig };

        if (isRouteSwitch) {
          setMessages(restoredWithArtifacts);
          lastCommittedConversationIdRef.current = id;
          return;
        }

        setMessages((prev) => {
          const cleanedPrev = Array.isArray(prev)
            ? prev.filter((m) => !(m?.type === "assistant" && m?.streaming))
            : [];

          const merged = mergeById(cleanedPrev, restoredWithArtifacts);

          if (merged.length === cleanedPrev.length) {
            let same = true;
            for (let i = 0; i < merged.length; i++) {
              const a = merged[i];
              const b = cleanedPrev[i];
              if (
                a?.id !== b?.id ||
                a?.type !== b?.type ||
                a?.content !== b?.content ||
                !!a?.replayTyping !== !!b?.replayTyping ||
                (a?.replayKey || 0) !== (b?.replayKey || 0)
              ) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }

          return merged;
        });

        lastCommittedConversationIdRef.current = id;
      } catch (err) {
        if (cancelled) return;
        if (err?.name === "AbortError") return;

        console.error("Error loading conversation", err);
        showToast?.(t("landing.loadConversationError"), "danger");
      } finally {
        if (!cancelled && loadSeqRef.current === loadSeq) {
          setIsLoadingConversation(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    routeConversationId,
    authFetchRef, // IMPORTANT: depend on the ref object, not .current
    setMessages,
    setConversationTitle,
    setConversationOwnerId,
    showToast,
    t,
    mode,
  ]);

  return { isLoadingConversation };
}
