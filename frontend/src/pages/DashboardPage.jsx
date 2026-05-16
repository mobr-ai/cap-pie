// src/pages/DashboardPage.jsx
import React, {
  useMemo,
  useState,
  useLayoutEffect,
  useEffect,
  Suspense,
  useCallback,
  useRef,
} from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Modal from "react-bootstrap/Modal";

import { useAuthRequest } from "@/hooks/useAuthRequest";
import useDashboardData from "@/hooks/useDashboardData";
import { useDashboardItems } from "@/hooks/useDashboardItems";

import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { DashboardWidgetContent } from "@/components/dashboard/DashboardWidget";

import LoadingPage from "@/pages/LoadingPage";
import ShareModal from "@/components/ShareModal";

import "@/styles/DashboardPage.css";

function applyOverridesToList(list, overridesMap) {
  if (!Array.isArray(list)) return list;
  if (!overridesMap || overridesMap.size === 0) return list;

  // Only keep overrides for items that still exist in the current list
  const ids = new Set(list.map((x) => x?.id).filter(Boolean));
  for (const key of overridesMap.keys()) {
    if (!ids.has(key)) overridesMap.delete(key);
  }

  return list.map((it) => {
    const ovr = overridesMap.get(it?.id);
    return ovr ? { ...it, ...ovr } : it;
  });
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const { session, showToast, setLoading } = useOutletContext() || {};
  const navigate = useNavigate();
  const { authFetch } = useAuthRequest({ session, showToast });

  const [expandedItem, setExpandedItem] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState(null);

  const [sortOrder, setSortOrder] = useState(
    () => localStorage.getItem("cap.dashboard.sort") || "position",
  );

  const handleChangeSort = useCallback((next) => {
    setSortOrder(next);
    localStorage.setItem("cap.dashboard.sort", next);
  }, []);

  const handleExpandItem = useCallback((item) => {
    setExpandedItem(item);
  }, []);

  const handleCloseModal = useCallback(() => {
    setExpandedItem(null);
  }, []);

  // Base data: dashboards list + default dashboard items
  const {
    dashboard: dashboardsRaw,
    defaultId,
    items: defaultItemsRaw,
    error,
    refresh,
    applyDashboardItemUpdate,
  } = useDashboardData(authFetch);

  const dashboards = useMemo(
    () => (Array.isArray(dashboardsRaw) ? dashboardsRaw : []),
    [dashboardsRaw],
  );

  // Keep null/undefined while loading so hooks/loader can behave correctly.
  const defaultItems = useMemo(
    () => (Array.isArray(defaultItemsRaw) ? defaultItemsRaw : null),
    [defaultItemsRaw],
  );

  // View-level state: which dashboard is active and which items to show
  const { activeId, setActiveId, items, activeName } = useDashboardItems({
    dashboards,
    defaultId,
    defaultItems,
    authFetch,
    sortOrder,
  });

  // ------------------------------------------------------------------
  // Local render state to ensure PATCH responses reflect immediately.
  // This fixes rename/config not showing until poll/refresh (or never).
  // ------------------------------------------------------------------
  const overridesRef = useRef(new Map()); // Map<itemId, partialOrFullItem>
  const [renderItems, setRenderItems] = useState(items);

  // When hook-provided items change (poll/refresh/dashboard switch), re-apply overrides.
  useEffect(() => {
    setRenderItems((prev) => {
      // If items is null/undefined/loading, keep it as-is.
      if (!Array.isArray(items)) return items;
      return applyOverridesToList(items, overridesRef.current);
    });
  }, [items, activeId]);

  const applyRenderItemUpdate = useCallback((updatedItem) => {
    if (!updatedItem || !updatedItem.id) return;

    overridesRef.current.set(updatedItem.id, updatedItem);

    // Update currently rendered list immediately
    setRenderItems((prev) => {
      if (!Array.isArray(prev)) return prev;
      const next = prev.map((it) =>
        it?.id === updatedItem.id ? { ...it, ...updatedItem } : it,
      );
      return applyOverridesToList(next, overridesRef.current);
    });

    // If expanded modal is open for this item, update it too
    setExpandedItem((prev) => {
      if (!prev || prev.id !== updatedItem.id) return prev;
      return { ...prev, ...updatedItem };
    });
  }, []);

  const hasDashboards = dashboards.length > 0;
  const dashboardsLoaded =
    dashboardsRaw !== null && typeof dashboardsRaw !== "undefined";
  const isDashboardsLoading = !dashboardsLoaded && !error;
  const isWidgetsMaybeLoading =
    hasDashboards &&
    (!activeId || renderItems === null || typeof renderItems === "undefined") &&
    !error;

  const isGridLoading = isDashboardsLoading || isWidgetsMaybeLoading;

  // Smooth out micro-flickers by debouncing "loading finished"
  const [debouncedGridLoading, setDebouncedGridLoading] = useState(true);

  useEffect(() => {
    if (isGridLoading) {
      setDebouncedGridLoading(true);
      return;
    }

    const timer = setTimeout(() => {
      setDebouncedGridLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [isGridLoading]);

  useLayoutEffect(() => {
    if (!setLoading) return;
    setLoading(debouncedGridLoading);
  }, [setLoading, debouncedGridLoading]);

  const handleUpdateItem = useCallback(
    async (payloadOrId, maybeTitle) => {
      if (!authFetch) return false;

      // Backward compatible:
      // - old calls: handleUpdateItem(id, "New title")
      // - new calls: handleUpdateItem({ itemId, title, configPatch, move, swap_with_id })
      let payload = null;

      if (typeof payloadOrId === "number" || typeof payloadOrId === "string") {
        payload = {
          itemId: payloadOrId,
          title: maybeTitle,
        };
      } else {
        payload = payloadOrId || {};
      }

      const id = payload.itemId ?? payload.id;
      if (!id) return false;

      // Only include fields that are actually present to keep the PATCH minimal.
      const body = {};

      if (payload.title !== undefined) {
        const title = String(payload.title || "").trim();
        if (!title) return false;
        body.title = title;
      }

      if (payload.configPatch !== undefined) {
        // Backend expects config_patch
        body.config_patch = payload.configPatch;
      }

      // Legacy move support (manual ordering)
      if (payload.move !== undefined) {
        body.move = payload.move; // "up" | "down"
      }

      // New strategy: swap with a specific neighbor id (visual order)
      const swapWithId =
        payload.swap_with_id ??
        payload.swapWithId ??
        payload.swap_with ??
        payload.swapWith;

      if (swapWithId !== undefined && swapWithId !== null) {
        body.swap_with_id = swapWithId;
      }

      // Nothing to update
      if (Object.keys(body).length === 0) return false;

      try {
        const res = await authFetch(`/api/v1/dashboard/items/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error("update_failed");

        const updated = await res.json();

        // 1) Update what the grid is rendering immediately
        applyRenderItemUpdate(updated);

        // 2) Also update the base hook cache (keeps default dashboard cache consistent)
        if (typeof applyDashboardItemUpdate === "function") {
          applyDashboardItemUpdate(updated);
        }

        // 3) Optional: refresh for eventual consistency (safe to keep)
        refresh?.();

        return true;
      } catch (e) {
        showToast?.(t("dashboard.widgetUpdateFailed"), "danger");
        return false;
      }
    },
    [
      authFetch,
      applyRenderItemUpdate,
      applyDashboardItemUpdate,
      refresh,
      showToast,
      t,
    ],
  );

  // Keep old API used by current widgets (rename-only modal inside DashboardWidget.jsx)
  const handleRenameItem = useCallback(
    async (id, nextTitle) => {
      return await handleUpdateItem(id, nextTitle);
    },
    [handleUpdateItem],
  );

  const handleDeleteItem = useCallback(
    async (id) => {
      if (!authFetch) return;

      try {
        const res = await authFetch(`/api/v1/dashboard/items/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("delete_failed");

        // Drop any override, update UI immediately, then refresh
        overridesRef.current.delete(id);
        setRenderItems((prev) =>
          Array.isArray(prev) ? prev.filter((x) => x?.id !== id) : prev,
        );
        setExpandedItem((prev) => (prev?.id === id ? null : prev));

        refresh?.();
      } catch {
        showToast?.(t("dashboard.widgetDeleteFailed"), "danger");
      }
    },
    [authFetch, refresh, showToast, t],
  );

  const handleGoToConversation = useCallback(
    (conversationId, messageId = null) => {
      if (!conversationId) return;

      navigate(`/conversations/${conversationId}`, {
        state: {
          initialScrollMessageId: messageId != null ? String(messageId) : null,
        },
      });
    },
    [navigate],
  );

  const handleShareItem = useCallback(
    (payload) => {
      if (payload?.error === "share_failed") {
        showToast?.(t("dashboard.widgetShareFailed"), "danger");
        return;
      }
      setSharePayload(payload);
      setShareOpen(true);
    },
    [showToast, t],
  );

  const nudgeResize = useCallback(() => {
    try {
      window.dispatchEvent(new Event("resize"));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="cap-root">
      <div className="container py-4">
        <DashboardToolbar
          dashboards={dashboards}
          activeId={activeId}
          activeName={activeName}
          onSelectDashboard={setActiveId}
          onRefresh={refresh}
          isLoading={isGridLoading}
          sortOrder={sortOrder}
          onChangeSort={handleChangeSort}
        />

        {!debouncedGridLoading && !dashboards.length && !error && (
          <p>{t("dashboard.emptyPrompt")}</p>
        )}

        {error && (
          <p className="text-danger small mb-2">{t("dashboard.loadError")}</p>
        )}

        <Suspense
          fallback={
            <LoadingPage
              type="ring"
              fullscreen={true}
              message={t("loading.dashboardItems")}
            />
          }
        >
          <DashboardGrid
            items={renderItems}
            activeId={activeId}
            hasDashboards={dashboards.length > 0}
            onDelete={handleDeleteItem}
            onRename={handleRenameItem}
            onUpdateItem={handleUpdateItem}
            onShare={handleShareItem}
            onGoToConversation={handleGoToConversation}
            onExpand={handleExpandItem}
            isLoading={debouncedGridLoading}
            order={sortOrder}
          />
        </Suspense>

        {/* Expanded widget modal */}
        <Modal
          show={!!expandedItem}
          onHide={handleCloseModal}
          size="xl"
          centered
          animation
          dialogClassName="dashboard-widget-modal dashboard-widget-modal-dialog"
          contentClassName="dashboard-widget-modal-content"
          backdropClassName="dashboard-widget-modal-backdrop"
          onEntered={nudgeResize}
          onExited={nudgeResize}
        >
          {expandedItem && (
            <>
              <Modal.Header closeButton>
                <Modal.Title>{expandedItem.title}</Modal.Title>
              </Modal.Header>

              <Modal.Body>
                <div className="dashboard-widget-modal-inner">
                  <DashboardWidgetContent item={expandedItem} />
                </div>
              </Modal.Body>
            </>
          )}
        </Modal>

        <ShareModal
          show={shareOpen}
          onHide={() => setShareOpen(false)}
          title={sharePayload?.title || "CAP"}
          hashtags={sharePayload?.hashtags || ["CAP"]}
          link={null}
          message={sharePayload?.message || ""}
          imageDataUrl={sharePayload?.imageDataUrl || null}
        />
      </div>
    </div>
  );
}
