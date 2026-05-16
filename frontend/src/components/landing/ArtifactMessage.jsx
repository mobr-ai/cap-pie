// src/components/landing/ArtifactMessage.jsx
import React from "react";
import { useTranslation } from "react-i18next";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faThumbTack } from "@fortawesome/free-solid-svg-icons";
import { faShareAlt } from "@fortawesome/free-solid-svg-icons";

import VegaChart from "@/components/artifacts/VegaChart";
import KVTable, { isValidKVTable } from "@/components/artifacts/KVTable";

export default function ArtifactMessage({
  message,
  pinArtifact,
  shareArtifact,
  chartElByMsgIdRef,
  chartViewByMsgIdRef,
  tableElByMsgIdRef,
  ArtifactToolBtn,
}) {
  const { t } = useTranslation();

  if (!message) return null;

  const isChart = message.type === "chart" && !!message.vegaSpec;
  const isTable = message.type === "table" && !!message.kv;

  if (!isChart && !isTable) return null;

  if (isTable && !isValidKVTable(message.kv)) return null;

  // Avoid emoji literals in suggested code; keep same UI semantics.
  const assistantAvatar = "\uD83E\uDD16";

  if (isChart) {
    return (
      <div className="message assistant">
        <div className="message-avatar">{assistantAvatar}</div>
        <div className="message-content">
          <div className="message-bubble markdown-body">
            <div
              className="chat-chart-slot vega-chart-slot"
              ref={(node) => {
                if (!chartElByMsgIdRef?.current) return;
                if (!node) {
                  chartElByMsgIdRef.current.delete(message.id);
                  return;
                }
                chartElByMsgIdRef.current.set(message.id, node);
              }}
            >
              <VegaChart
                spec={message.vegaSpec}
                onViewReady={(view) => {
                  if (!chartViewByMsgIdRef?.current) return;
                  if (view) chartViewByMsgIdRef.current.set(message.id, view);
                }}
              />
            </div>

            <div className="artifact-actions">
              <ArtifactToolBtn
                id={`artifact-pin-${message.id}`}
                label={t("landing.pinToDashboard")}
                onClick={() => pinArtifact(message)}
              >
                <FontAwesomeIcon icon={faThumbTack} />
              </ArtifactToolBtn>

              <ArtifactToolBtn
                id={`artifact-share-${message.id}`}
                label={t("landing.shareArtifact")}
                onClick={() => shareArtifact(message)}
              >
                <FontAwesomeIcon icon={faShareAlt} />
              </ArtifactToolBtn>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // table
  return (
    <div className="message assistant kv-message">
      <div className="message-avatar">{assistantAvatar}</div>
      <div className="message-content">
        <div className="message-bubble markdown-body kv-bubble">
          <div
            ref={(node) => {
              if (!tableElByMsgIdRef?.current) return;
              if (!node) {
                tableElByMsgIdRef.current.delete(message.id);
                return;
              }
              tableElByMsgIdRef.current.set(message.id, node);
            }}
          >
            <KVTable kv={message.kv} />
          </div>

          <div className="artifact-actions">
            <ArtifactToolBtn
              id={`artifact-pin-${message.id}`}
              label={t("landing.pinToDashboard")}
              onClick={() => pinArtifact(message)}
            >
              <FontAwesomeIcon icon={faThumbTack} />
            </ArtifactToolBtn>

            <ArtifactToolBtn
              id={`artifact-share-${message.id}`}
              label={t("landing.shareArtifact")}
              onClick={() => shareArtifact(message)}
            >
              <FontAwesomeIcon icon={faShareAlt} />
            </ArtifactToolBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
