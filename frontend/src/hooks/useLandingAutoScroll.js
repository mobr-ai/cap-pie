// src/hooks/useLandingAutoScroll.js
import { useCallback, useEffect, useRef } from "react";

export function useLandingAutoScroll({
  messages,
  isLoadingConversation,
  routeConversationId,
  messagesEndRef, // still used for fallback
  messageElsRef, // Map<messageId, HTMLElement>
  initialScrollMessageId = null, // string | null
}) {
  const lastMsgCountRef = useRef(0);
  const lastRouteRef = useRef(routeConversationId);
  const lastLoadDoneKeyRef = useRef(null);

  const scrollToBottom = useCallback(
    (behavior = "smooth") => {
      messagesEndRef?.current?.scrollIntoView({
        behavior,
        block: "end",
      });
    },
    [messagesEndRef],
  );

  const scrollToMessageId = useCallback(
    (messageId, behavior = "auto") => {
      if (!messageId) return false;

      const raw = String(messageId);
      const el =
        messageElsRef?.current?.get(raw) ||
        messageElsRef?.current?.get(`conv_${raw}`) ||
        (raw.startsWith("conv_")
          ? messageElsRef?.current?.get(raw.replace(/^conv_/, ""))
          : null);

      if (!el) return false;

      el.scrollIntoView({ behavior, block: "start", inline: "nearest" });
      return true;
    },
    [messageElsRef],
  );

  const scrollToLastMessageStart = useCallback(
    (behavior = "auto") => {
      const last = messages?.length ? messages[messages.length - 1] : null;
      if (last?.id && scrollToMessageId(last.id, behavior)) return true;

      // fallback if the element isn't registered yet
      scrollToBottom(behavior);
      return false;
    },
    [messages, scrollToMessageId, scrollToBottom],
  );

  // 1) On conversation load finished, scroll to target message start (default last).
  useEffect(() => {
    const routeChanged = lastRouteRef.current !== routeConversationId;
    if (routeChanged) lastRouteRef.current = routeConversationId;

    // wait for load completion
    if (isLoadingConversation) return;

    const len = messages?.length || 0;
    if (len === 0) return;

    // Build a stable key: route + len + optional target
    const key = `${String(routeConversationId || "root")}::${len}::${String(
      initialScrollMessageId || "",
    )}`;

    // Prevent re-scrolling for the same “loaded” state
    if (lastLoadDoneKeyRef.current === key) return;
    lastLoadDoneKeyRef.current = key;

    // Ensure DOM is painted (especially with big markdown / artifacts)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (initialScrollMessageId) {
          const ok = scrollToMessageId(initialScrollMessageId, "auto");
          if (!ok) scrollToLastMessageStart("auto");
        } else {
          scrollToLastMessageStart("auto");
        }
      });
    });
  }, [
    routeConversationId,
    isLoadingConversation,
    messages,
    initialScrollMessageId,
    scrollToMessageId,
    scrollToLastMessageStart,
  ]);

  // 2) Smooth scroll only when a new message is appended (length increases).
  useEffect(() => {
    const len = messages?.length || 0;

    if (len > lastMsgCountRef.current) {
      // If the user is near bottom, scroll smoothly to last message start.
      // If not, do nothing (future improvement: detect near-bottom).
      requestAnimationFrame(() => {
        scrollToLastMessageStart("smooth");
      });
    }

    lastMsgCountRef.current = len;
  }, [messages, scrollToLastMessageStart]);

  return { scrollToBottom, scrollToMessageId, scrollToLastMessageStart };
}
