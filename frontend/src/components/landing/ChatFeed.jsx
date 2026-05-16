// src/components/landing/ChatFeed.jsx
import React from "react";

import ChatMessage from "@/components/landing/ChatMessage";
import ArtifactMessage from "@/components/landing/ArtifactMessage";

export default function ChatFeed({
  messages,
  messageElsRef,
  pinArtifact,
  shareArtifact,
  chartElByMsgIdRef,
  chartViewByMsgIdRef,
  tableElByMsgIdRef,
  ArtifactToolBtn,
}) {
  return (
    <>
      {messages.map((m) => (
        <div
          key={m.id}
          ref={(el) => {
            if (!messageElsRef?.current) return;

            const keys = [];
            if (m?.id != null) keys.push(String(m.id));
            if (m?.conv_message_id != null)
              keys.push(String(m.conv_message_id));

            for (const k of keys) {
              if (el) messageElsRef.current.set(k, el);
              else messageElsRef.current.delete(k);
            }
          }}
          data-msgid={m.id}
        >
          {(m.type === "chart" && m.vegaSpec) ||
          (m.type === "table" && m.kv) ? (
            <ArtifactMessage
              message={m}
              pinArtifact={pinArtifact}
              shareArtifact={shareArtifact}
              chartElByMsgIdRef={chartElByMsgIdRef}
              chartViewByMsgIdRef={chartViewByMsgIdRef}
              tableElByMsgIdRef={tableElByMsgIdRef}
              ArtifactToolBtn={ArtifactToolBtn}
            />
          ) : (
            <ChatMessage
              id={m.id}
              type={m.type}
              content={m.content}
              statusText={m.statusText}
              streaming={!!m.streaming}
              replayTyping={!!m.replayTyping}
              replayKey={m.replayKey ?? null}
            />
          )}
        </div>
      ))}
    </>
  );
}
