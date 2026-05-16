// src/components/landing/ChatMessage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";

// Tracks replay completion per message id and per replayKey.
// NOTE: Map updates do NOT trigger rerenders; we also use local state for that.
const lastReplayKeyDoneByMessageId = new Map();

function ReplayTypingPlain({ text, speedMs = 1, onDone }) {
  const FULL = String(text || "");
  const [shown, setShown] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    setShown("");

    if (!FULL) {
      onDone?.();
      return;
    }

    let i = 0;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;

      i += 1;
      setShown(FULL.slice(0, i));

      if (i < FULL.length) {
        timerRef.current = window.setTimeout(tick, speedMs);
      } else {
        timerRef.current = null;
        onDone?.();
      }
    };

    timerRef.current = window.setTimeout(tick, speedMs);

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [FULL, speedMs, onDone]);

  return <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{shown}</pre>;
}

function ChatMessageImpl({
  id,
  type,
  content,
  streaming = false,
  replayTyping = false,
  replayKey = null,
  statusText = "",
}) {
  const { t } = useTranslation();

  const isUser = type === "user";
  const assistantHasText = String(content || "").trim().length > 0;

  if (!isUser && type !== "error" && !streaming && !assistantHasText) {
    return null;
  }

  if (type === "error") {
    return <div className="error-message">{content}</div>;
  }

  const trimmedStatus = String(statusText || "").trim();
  const hasStatus = trimmedStatus.length > 0;
  const statusToShow = hasStatus ? trimmedStatus : t("landing.defaultStatus");
  const showStatusRow = !isUser && (hasStatus || !assistantHasText);

  // Local state that forces the transition from replay -> final markdown
  const [replayDone, setReplayDone] = useState(false);

  // When message id or replayKey changes, determine if it was already done for this key
  useEffect(() => {
    if (!id || replayKey == null) {
      setReplayDone(true);
      return;
    }
    const doneKey = lastReplayKeyDoneByMessageId.get(id);
    setReplayDone(doneKey === replayKey);
  }, [id, replayKey]);

  const canReplay =
    !!id &&
    replayTyping &&
    replayKey != null &&
    !streaming &&
    assistantHasText &&
    !replayDone;

  // Final markdown (with highlight) — only rendered when not streaming and not replaying
  const finalMarkdown = useMemo(() => {
    const text = typeof content === "string" ? content : String(content || "");
    if (!text.trim()) return null;

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: true, strict: false }],
        ]}
        rehypePlugins={[
          rehypeKatex,
          [rehypeHighlight, { ignoreMissing: true }],
        ]}
        components={{
          h1: ({ node, ...props }) => <h3 {...props} />,
          h2: ({ node, ...props }) => <h4 {...props} />,
          h3: ({ node, ...props }) => <h5 {...props} />,
          h4: ({ node, ...props }) => <h6 {...props} />,
          a({ node, href, children, ...props }) {
            const isExternal =
              typeof href === "string" && /^https?:\/\//i.test(href);
            return (
              <a
                href={href}
                {...props}
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noreferrer" : undefined}
              >
                {children}
              </a>
            );
          },
          pre({ node, children, ...props }) {
            return (
              <pre {...props} className="rm-pre">
                {children}
              </pre>
            );
          },
          blockquote({ node, ...props }) {
            return <blockquote className="rm-quote" {...props} />;
          },
          table({ node, ...props }) {
            return (
              <div className="rm-table-wrap">
                <table {...props} />
              </div>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    );
  }, [content]);

  // Streaming markdown (no highlight to keep it light)
  const streamingMarkdown = useMemo(() => {
    const text = typeof content === "string" ? content : String(content || "");
    if (!text.trim()) return null;

    return (
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          [remarkMath, { singleDollarTextMath: true, strict: false }],
        ]}
        rehypePlugins={[rehypeKatex]}
      >
        {text}
      </ReactMarkdown>
    );
  }, [content]);

  // Avatars (unicode escapes)
  const userAvatar = "\uD83D\uDC64"; // 👤
  const assistantAvatar = "\uD83E\uDD16"; // 🤖

  return (
    <div className={`message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? userAvatar : assistantAvatar}
      </div>

      <div className="message-content">
        <div className="message-bubble markdown-body">
          {isUser ? (
            <div className="fade-in">
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{content}</pre>
            </div>
          ) : (
            <div
              className={`rm-chat ${streaming || canReplay ? "typing-mode" : "fade-in"}`}
            >
              {streaming ? (
                <div className="fade-in">
                  {showStatusRow ? (
                    <div className="rm-assistant-statusRow">
                      <span className="rm-assistant-statusText">
                        {statusToShow}
                      </span>
                      <span className="thinking-animation">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    </div>
                  ) : null}
                  {assistantHasText ? streamingMarkdown : null}
                </div>
              ) : canReplay ? (
                <ReplayTypingPlain
                  text={content || ""}
                  speedMs={1}
                  onDone={() => {
                    if (id && replayKey != null) {
                      lastReplayKeyDoneByMessageId.set(id, replayKey);
                    }
                    setReplayDone(true);
                  }}
                />
              ) : (
                finalMarkdown
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(ChatMessageImpl, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.content === next.content &&
    prev.streaming === next.streaming &&
    prev.replayTyping === next.replayTyping &&
    prev.replayKey === next.replayKey &&
    prev.statusText === next.statusText
  );
});
