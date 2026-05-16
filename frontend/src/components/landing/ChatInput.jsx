// src/components/landing/ChatInput.jsx
import React from "react";

export default function ChatInput({
  readOnly = false,
  readOnlyReason = "",
  query,
  setQuery,
  charCount,
  setCharCount,
  isProcessing = false,
  isSyncBlocked = false,
  syncBlockedReason = "",
  maxLength = 1000,
  placeholder,
  charCountText,
  processingLabel,
  sendLabel,
  onSend,
}) {
  const canSendText = !!(query || "").trim();
  const isSendDisabled =
    readOnly || isProcessing || !canSendText || isSyncBlocked;

  return (
    <div className="input-wrapper">
      <div className="input-field">
        <textarea
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            setCharCount(value.length);

            // Keep the same auto-grow behavior
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isSendDisabled) onSend?.();
            }
          }}
          placeholder={placeholder}
          rows={2}
          maxLength={maxLength}
          disabled={isProcessing || readOnly}
        />
        <div className="char-count">
          <span>{charCountText}</span>
        </div>
      </div>

      <div className="cap-send-btn-wrap">
        <button
          className={`send-button ${isProcessing ? "processing" : ""}`}
          disabled={isSendDisabled}
          aria-disabled={isSendDisabled}
          data-disabled-reason={isSyncBlocked ? "sync" : ""}
          onClick={() => {
            if (!isSendDisabled) onSend?.();
          }}
        >
          <span>{isProcessing ? processingLabel : sendLabel}</span>
          <span>{isProcessing ? <div className="button-spinner" /> : "→"}</span>
        </button>

        {readOnly && !!readOnlyReason && (
          <div className="cap-send-tooltip" role="tooltip">
            <span className="cap-tip-icon" aria-hidden="true">
              !
            </span>
            <span className="cap-tip-text">{readOnlyReason}</span>
          </div>
        )}
        {isSyncBlocked && !!syncBlockedReason && (
          <div className="cap-send-tooltip" role="tooltip">
            <span className="cap-tip-icon" aria-hidden="true">
              !
            </span>
            <span className="cap-tip-text">{syncBlockedReason}</span>
          </div>
        )}
      </div>
    </div>
  );
}
