// src/hooks/useLandingArtifactActions.js
import { useCallback } from "react";

import { isValidKVTable } from "@/components/artifacts/KVTable";
import { pinLandingArtifact } from "@/utils/landingPinOps";
import { createSharePayloadForArtifact } from "@/utils/landingShareOps";

export function useLandingArtifactActions({
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
}) {
  const pinArtifact = useCallback(
    async (message) => {
      const fetchFn = authFetchRef.current;
      if (!fetchFn) return;

      try {
        if (message.type === "table") {
          if (!message.kv || !isValidKVTable(message.kv)) {
            showToast?.(t("landing.pinInvalidTable"), "warning");
            return;
          }
        }

        const conversationId =
          conversationMetaRef.current.conversationId ||
          (routeConversationId ? Number(routeConversationId) : null);

        await pinLandingArtifact({
          fetchFn,
          message,
          messages,
          conversationId,
        });

        showToast?.(t("landing.pinSuccess"), "success", {
          onClick: () => navigate("/dashboard"),
        });
      } catch (err) {
        console.error("Pin failed", err);
        showToast?.(t("landing.pinError"), "danger");
      }
    },
    [
      authFetchRef,
      conversationMetaRef,
      messages,
      navigate,
      routeConversationId,
      showToast,
      t,
    ],
  );

  const shareArtifact = useCallback(
    async (message) => {
      const payload = await createSharePayloadForArtifact({
        message,
        messages,
        conversationTitle,
        tableElByMsgIdRef,
      });

      handleSharePayload(payload);
    },
    [conversationTitle, handleSharePayload, messages, tableElByMsgIdRef],
  );

  return { pinArtifact, shareArtifact };
}
