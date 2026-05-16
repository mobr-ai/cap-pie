// src/hooks/useLLMStream.js
import { useCallback, useRef } from "react";

const NL_TOKEN = "__NL__";

export function useLLMStream({
  fetcher,
  onStatus,
  onChunk,
  onKVResults,
  onDone,
  onError,
  onMetadata,
  // NEW: demo-only support for lines like: "status: Planning..."
  // Keep false by default to avoid interpreting real model text as protocol.
  acceptBareStatusLines = false,
} = {}) {
  let lastWasText = false;
  const abortRef = useRef(null);
  const stripTrailingDataPrefix = (s) => s.replace(/data\s*:\s*$/i, "");

  const makeRequestId = () => {
    try {
      // Modern browsers
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    } catch {}
    // Fallback: stable-enough for client routing
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const start = useCallback(
    async ({
      url = VITE_NL_ENDPOINT,
      body,
      method = "POST",
      headers = {},
    } = {}) => {
      if (!fetcher) {
        throw new Error("useLLMStream: fetcher (authFetch) is required.");
      }

      const requestedConversationId =
        body?.conversation_id ?? body?.conversationId ?? null;
      const isNewConversation = !requestedConversationId;

      const requestId = body?.request_id ?? body?.requestId ?? makeRequestId();

      const streamMeta = {
        requestId,
        requestedConversationId: requestedConversationId
          ? Number(requestedConversationId)
          : null,
        conversationId: null,
        userMessageId: null,
      };

      let createdEventEmitted = false;

      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const rawTitleCandidate = String(body?.query || "").trim();
      const makeTitleCandidate = () => {
        let title = rawTitleCandidate;
        if (title.length > 80) title = title.slice(0, 77) + "...";
        return title || null;
      };

      const emitCreatedIfNeeded = () => {
        if (!isNewConversation) return;
        if (createdEventEmitted) return;
        const convId = streamMeta.conversationId;
        if (!convId) return;

        createdEventEmitted = true;

        window.dispatchEvent(
          new CustomEvent("cap:conversation-created", {
            detail: {
              conversation: {
                id: convId,
                title: makeTitleCandidate(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_message_preview: null,
                _justCreated: true,
                _localUpdatedAt: Date.now(),
                requestId,
              },
            },
          }),
        );
      };

      const emitTouched = () => {
        const convId = streamMeta.conversationId;
        if (!convId) return;

        window.dispatchEvent(
          new CustomEvent("cap:conversation-touched", {
            detail: {
              conversation: {
                id: convId,
                updated_at: new Date().toISOString(),
                _localUpdatedAt: Date.now(),
                title: makeTitleCandidate(),
                requestId,
              },
            },
          }),
        );
      };

      const completeOnce = () => {
        emitTouched();
        onDone?.({ ...streamMeta });
      };

      const hardStopStream = (reader) => {
        try {
          reader?.cancel();
        } catch {}
        try {
          abortRef.current?.abort();
        } catch {}
      };

      const tryHandleStatusLine = (line) => {
        if (!line) return false;
        const s = String(line).trimStart();
        if (!s.toLowerCase().startsWith("status:")) return false;
        const status = s.slice("status:".length).trim();
        if (status) onStatus?.(status);
        lastWasText = false;
        return true;
      };

      // SSE rule: payload for "data:" lines must preserve spacing.
      // Only remove ONE optional leading space after "data:".
      const extractDataPayload = (rawLine) => {
        const idx = rawLine.indexOf("data:");
        if (idx < 0) return null;
        let payload = rawLine.slice(idx + "data:".length);
        if (payload.startsWith(" ")) payload = payload.slice(1);
        return payload;
      };

      const isDoneLine = (line) =>
        line === "[DONE]" || line === "data:[DONE]" || line === "data: [DONE]";

      let doneCarry = "";

      const emitText = (text) => {
        if (!text) return;

        let combined = doneCarry + text;
        doneCarry = "";

        const idx = combined.indexOf("[DONE]");
        if (idx !== -1) {
          const before = stripTrailingDataPrefix(combined.slice(0, idx));
          if (before) onChunk?.(before);
          return { hitDone: true };
        }

        const holdCandidates = ["[", "[D", "[DO", "[DON", "[DONE"];
        for (const c of holdCandidates) {
          if (combined.endsWith(c)) {
            doneCarry = c;
            const safe = combined.slice(0, -c.length);
            if (safe) onChunk?.(safe);
            return { hitDone: false };
          }
        }

        onChunk?.(combined);
        return { hitDone: false };
      };

      try {
        const response = await fetcher(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "X-Client-Request-Id": requestId,
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = new Error(
            `Streaming request failed: ${response.status} ${response.statusText}`,
          );
          onError?.(err, { ...streamMeta });
          return;
        }

        // ---- Read metadata headers EARLY ----
        try {
          const convIdHeader =
            response.headers.get("x-conversation-id") ||
            response.headers.get("X-Conversation-Id");
          const userMsgIdHeader =
            response.headers.get("x-user-message-id") ||
            response.headers.get("X-User-Message-Id");

          streamMeta.conversationId = convIdHeader
            ? Number(convIdHeader)
            : null;
          streamMeta.userMessageId = userMsgIdHeader
            ? Number(userMsgIdHeader)
            : null;

          if (streamMeta.conversationId || streamMeta.userMessageId) {
            onMetadata?.({ ...streamMeta });
          }

          emitCreatedIfNeeded();
        } catch (metaErr) {
          console.warn(
            "useLLMStream: failed to read metadata headers",
            metaErr,
          );
        }
        // -----------------------------------

        if (!response.body || !response.body.getReader) {
          const text = await response.text();
          if (text) emitText(text);
          if (doneCarry) {
            onChunk?.(doneCarry);
            doneCarry = "";
          }
          completeOnce();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        let inKVBlock = false;
        let kvBuffer = "";

        const flushKVResults = () => {
          let raw = kvBuffer;
          kvBuffer = "";
          if (!raw) return;

          let s = String(raw);
          s = s.replace(/^\s+|\s+$/g, "");

          try {
            if (s.startsWith("kv_results:")) {
              s = s.slice("kv_results:".length).replace(/^\s+/, "");
            }
            onKVResults?.(JSON.parse(s));
          } catch (err) {
            const match = s.match(/\{[\s\S]*\}/);
            if (match) {
              try {
                onKVResults?.(JSON.parse(match[0]));
                return;
              } catch {}
            }
            console.error("useLLMStream: failed to parse kv_results", err, s);
            onError?.(err, { ...streamMeta });
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (let rawLine of lines) {
            if (rawLine.endsWith("\r")) rawLine = rawLine.slice(0, -1);

            const trimmed = rawLine.replace(/\r$/, "");
            const proto = trimmed.trimStart();

            // HARD STOP: DONE marker may be concatenated
            const donePos = proto.indexOf("[DONE]");
            if (donePos !== -1) {
              let before = trimmed.slice(0, donePos);
              before = stripTrailingDataPrefix(before);

              if (before) {
                if (before.trimStart().startsWith("data:")) {
                  const payloadBeforeDone = extractDataPayload(
                    before.trimStart(),
                  );
                  if (payloadBeforeDone) {
                    const r = emitText(payloadBeforeDone);
                    if (r.hitDone) {
                      if (inKVBlock) {
                        inKVBlock = false;
                        flushKVResults();
                      }
                      lastWasText = false;
                      queueMicrotask(() => completeOnce());
                      hardStopStream(reader);
                      return;
                    }
                  }
                } else {
                  const r = emitText(before);
                  if (r.hitDone) {
                    if (inKVBlock) {
                      inKVBlock = false;
                      flushKVResults();
                    }
                    lastWasText = false;
                    queueMicrotask(() => completeOnce());
                    hardStopStream(reader);
                    return;
                  }
                }
              }

              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }

              lastWasText = false;
              queueMicrotask(() => completeOnce());
              hardStopStream(reader);
              return;
            }

            // Bare SSE prefix split from payload
            if (/^data\s*:\s*$/.test(proto) || /^data\s*$/.test(proto)) {
              continue;
            }

            // keep-alive / blank line
            if (!proto) {
              if (inKVBlock) {
                kvBuffer += "\n";
              } else if (lastWasText) {
                onChunk?.(NL_TOKEN);
              }
              continue;
            }

            if (isDoneLine(proto)) {
              if (inKVBlock) {
                inKVBlock = false;
                flushKVResults();
              }
              lastWasText = false;
              queueMicrotask(() => completeOnce());
              hardStopStream(reader);
              return;
            }

            // demo-only: bare status protocol line
            if (acceptBareStatusLines && !inKVBlock) {
              if (tryHandleStatusLine(proto)) continue;
            }

            if (proto.startsWith("kv_results:")) {
              inKVBlock = true;
              kvBuffer = "";
              lastWasText = false;

              const idx = proto.indexOf("kv_results:") + "kv_results:".length;
              const rest = proto.slice(idx);
              const restTrimmed = rest.trim();

              if (restTrimmed && !restTrimmed.startsWith("_kv_results_end_")) {
                kvBuffer += rest + "\n";
              }
              continue;
            }

            if (inKVBlock) {
              if (proto.includes("_kv_results_end_")) {
                inKVBlock = false;
                flushKVResults();
              } else {
                kvBuffer += trimmed + "\n";
              }
              lastWasText = false;
              continue;
            }

            // SSE data line
            if (proto.startsWith("data:")) {
              const payload = extractDataPayload(proto);
              if (payload == null) continue;

              if (tryHandleStatusLine(payload)) continue;

              if (payload === "") {
                onChunk?.(NL_TOKEN);
                lastWasText = true;
                continue;
              }

              if (payload === "[DONE]") {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                hardStopStream(reader);
                return;
              }

              const doneIdx = payload.indexOf("[DONE]");
              if (doneIdx !== -1) {
                let before = payload.slice(0, doneIdx);
                before = stripTrailingDataPrefix(before);

                if (before) emitText(before);

                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                hardStopStream(reader);
                return;
              }

              const r = emitText(payload);
              if (r.hitDone) {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                hardStopStream(reader);
                return;
              }

              lastWasText = true;
              continue;
            }

            // Raw text fallback
            {
              // Deterministic: never treat protocol status lines as content
              if (!inKVBlock && tryHandleStatusLine(trimmed)) {
                continue;
              }

              const r = emitText(trimmed);
              if (r.hitDone) {
                if (inKVBlock) {
                  inKVBlock = false;
                  flushKVResults();
                }
                lastWasText = false;
                queueMicrotask(() => completeOnce());
                hardStopStream(reader);
                return;
              }
              lastWasText = true;
            }
          }
        }

        if (inKVBlock) {
          inKVBlock = false;
          flushKVResults();
        }

        if (doneCarry) {
          onChunk?.(doneCarry);
          doneCarry = "";
        }

        completeOnce();
        hardStopStream(reader);
      } catch (err) {
        if (abortRef.current?.signal?.aborted) return;
        onError?.(err);
      }
    },
    [
      fetcher,
      onStatus,
      onChunk,
      onKVResults,
      onDone,
      onError,
      onMetadata,
      acceptBareStatusLines,
    ],
  );

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { start, stop };
}
