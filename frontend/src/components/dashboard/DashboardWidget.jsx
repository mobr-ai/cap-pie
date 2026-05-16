// src/components/dashboard/DashboardWidget.jsx
import React from "react";
import Card from "react-bootstrap/Card";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import WidgetSettingsModal from "@/components/dashboard/WidgetSettingsModal";
import VegaChart from "@/components/artifacts/VegaChart";
import KVTable, { isValidKVTable } from "@/components/artifacts/KVTable";

import {
  exportChartAsPngDataUrl,
  exportElementAsPngDataUrl,
  WATERMARK_PRESETS,
} from "@/utils/shareWidgetImage";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShareAlt,
  faPen,
  faTrash,
  faArrowUpRightFromSquare,
} from "@fortawesome/free-solid-svg-icons";

const COLOR_ACCENTS = {
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  orange: "#f97316",
  pink: "#ec4899",
  teal: "#14b8a6",
  gray: "#94a3b8",
};

const CATEGORY_ACCENTS = {
  governance: "#a855f7",
  spo: "#22c55e",
  tokens: "#3b82f6",
  defi: "#f97316",
  treasury: "#ec4899",
  wallets: "#14b8a6",
  network: "#94a3b8",
  nft: "#fb7185",
  markets: "#60a5fa",
  metadata: "#c084fc",
};

export function DashboardWidgetContent({ item, onChartViewReady }) {
  const cfg = item.config || {};

  if (item.artifact_type === "chart" && cfg.vegaSpec) {
    return <VegaChart spec={cfg.vegaSpec} onViewReady={onChartViewReady} />;
  }

  if (item.artifact_type === "table") {
    if (cfg.kv && isValidKVTable(cfg.kv)) {
      return <KVTable kv={cfg.kv} />;
    }
    return (
      <div className="dashboard-json-fallback">
        This table result is empty or invalid and cannot be displayed.
      </div>
    );
  }

  return (
    <pre className="dashboard-json-fallback">
      {JSON.stringify(cfg, null, 2)}
    </pre>
  );
}

const isTouchLike = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches ||
    "ontouchstart" in window
  );
};

function WidgetToolBtn({ id, label, onClick, children }) {
  const btn = (
    <button
      type="button"
      className="dashboard-widget-toolBtn"
      onClick={onClick}
      aria-label={label}
      title={isTouchLike() ? label : undefined}
    >
      {children}
    </button>
  );

  if (isTouchLike()) return btn;

  return (
    <OverlayTrigger
      placement="bottom"
      container={document.body}
      overlay={<Tooltip id={id}>{label}</Tooltip>}
    >
      {btn}
    </OverlayTrigger>
  );
}

export default function DashboardWidget({
  item,
  outerRef,
  outerAttrs,
  onDelete,
  onRename,
  onUpdateItem,
  onShare,
  onGoToConversation,
  onExpand,
  isLoading,
  order,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const cfg = item.config || {};
  const ui = cfg.ui || {};

  // Layout override (settings modal writes ui.layoutMode)
  const layoutMode = ui.layoutMode || (cfg.layout === "wide" ? "wide" : "auto");

  // Accent color preference
  const appearance = item?.config?.ui?.appearance || {};
  const colorKey =
    typeof appearance.color !== "undefined" ? appearance.color : null;
  const categoryKey =
    typeof appearance.category !== "undefined" ? appearance.category : null;

  const accent =
    (colorKey && COLOR_ACCENTS[colorKey]) ||
    (categoryKey && CATEGORY_ACCENTS[categoryKey]) ||
    null;

  const isTable = item.artifact_type === "table";
  const columns = (cfg.kv?.metadata?.columns || []).filter(Boolean);
  const autoWide = cfg.layout === "wide" || (isTable && columns.length >= 6);

  const isWide =
    layoutMode === "wide" ? true : layoutMode === "normal" ? false : autoWide;

  const captureRef = React.useRef(null);
  const vegaViewRef = React.useRef(null);

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [isSharing, setIsSharing] = React.useState(false);
  const sortOrder = order || "position";

  const stop = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleCardClick = () => {
    if (!onExpand) return;
    onExpand(item);
  };

  const handleConversationClick = (e) => {
    stop(e);

    if (onGoToConversation) {
      onGoToConversation(item.conversation_id, item.conversation_message_id);
      return;
    }
    if (item.conversation_id) {
      navigate(`/conversations/${item.conversation_id}`, {
        state: {
          initialScrollMessageId:
            item.conversation_message_id != null
              ? String(item.conversation_message_id)
              : null,
        },
      });
    }
  };

  const handleDelete = (e) => {
    stop(e);
    onDelete?.(item.id);
  };

  const handleOpenSettings = (e) => {
    stop(e);
    setSettingsOpen(true);
  };

  const handleShare = async (e) => {
    stop(e);
    if (!onShare) return;

    setIsSharing(true);
    try {
      let imageDataUrl = null;

      const shareSubtitle = item.conversation_id ? item.conversation_title : "";

      // Always use logo watermark. (Make sure shareWidgetImage.js embeds SVG safely for Firefox.)
      const watermarkPreset = WATERMARK_PRESETS.logoCenterBig;

      // Offscreen render for charts, deterministic export, avoids blank live-view images
      const renderOffscreenChartView = async (spec) => {
        const mod = await import("vega-embed");
        const vegaEmbed = mod?.default || mod;

        const W = 1200;
        const H = 700;

        const host = document.createElement("div");
        host.style.position = "fixed";
        host.style.left = "-10000px";
        host.style.top = "-10000px";
        host.style.width = `${W}px`;
        host.style.height = `${H}px`;
        host.style.pointerEvents = "none";
        host.style.opacity = "0";
        document.body.appendChild(host);

        const res = await vegaEmbed(host, spec, {
          actions: false,
          renderer: "canvas",
        });

        const view = res?.view;
        if (!view) {
          try {
            host.remove();
          } catch {}
          throw new Error("offscreen_view_missing");
        }

        // Firefox: force a layout pass and deterministic view size before rendering
        try {
          host.getBoundingClientRect();
        } catch {}

        try {
          view.width(W);
          view.height(H);
          view.resize();
        } catch {}

        await view.runAsync();
        return { view, host };
      };

      if (item.artifact_type === "chart") {
        // IMPORTANT: use the widget config spec, not the live view ref
        const spec = item?.config?.vegaSpec;

        if (!spec) {
          throw new Error("missing_chart_spec");
        }

        const { view, host } = await renderOffscreenChartView(spec);
        try {
          imageDataUrl = await exportChartAsPngDataUrl({
            vegaView: view,
            title: item.title,
            subtitle: shareSubtitle,
            titleBar: true,
            watermark: watermarkPreset,
            targetWidth: 1600,
          });
        } finally {
          try {
            view.finalize?.();
          } catch {}
          try {
            host.remove();
          } catch {}
        }

        if (!imageDataUrl) throw new Error("chart_export_failed");
      } else {
        const root = captureRef.current;

        const tableEl = root?.querySelector(".kv-table");
        const wrapperEl = root?.querySelector(".kv-table-wrapper");
        const targetEl = tableEl || wrapperEl || root;

        if (!targetEl) throw new Error("missing_capture_target");

        const prev = {};
        const applyTempStyles = (el) => {
          if (!el) return;
          prev.overflow = el.style.overflow;
          prev.height = el.style.height;
          prev.maxHeight = el.style.maxHeight;
          prev.width = el.style.width;
          prev.background = el.style.background;
          prev.color = el.style.color;

          el.style.overflow = "visible";
          el.style.height = "auto";
          el.style.maxHeight = "none";
          el.style.width = "max-content";
          el.style.background = "#ffffff";
          el.style.color = "#0f172a";
        };

        const restoreTempStyles = (el) => {
          if (!el) return;
          el.style.overflow = prev.overflow || "";
          el.style.height = prev.height || "";
          el.style.maxHeight = prev.maxHeight || "";
          el.style.width = prev.width || "";
          el.style.background = prev.background || "";
          el.style.color = prev.color || "";
        };

        const needsExpand = targetEl === wrapperEl || targetEl === root;

        try {
          if (needsExpand) applyTempStyles(targetEl);

          imageDataUrl = await exportElementAsPngDataUrl({
            element: targetEl,
            title: item.title,
            subtitle: shareSubtitle,
            titleBar: true,
            watermark: watermarkPreset,
            pixelRatio: 2,
          });
        } finally {
          if (needsExpand) restoreTempStyles(targetEl);
        }

        if (!imageDataUrl) throw new Error("element_export_failed");
      }

      onShare({
        title: item.title,
        imageDataUrl,
        hashtags: ["CAP", "Cardano", "Analytics"],
        message: item.source_query ? item.source_query : "",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[DashboardWidget] share export failed:", err);

      onShare({
        title: item.title,
        imageDataUrl: null,
        hashtags: ["CAP", "Cardano", "Analytics"],
        message: item.source_query ? item.source_query : "",
        error: "share_failed",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const cardClassName = [
    "dashboard-widget",
    isWide && "widget-wide",
    onExpand && "dashboard-widget-clickable",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Card
        ref={outerRef}
        {...outerAttrs}
        className={cardClassName}
        onClick={handleCardClick}
        style={accent ? { "--widget-accent": accent } : undefined}
      >
        <Card.Header className="dashboard-widget-header">
          <div className="dashboard-widget-headerRow">
            <div className="dashboard-widget-titleBlock">
              <div className="widget-title">{item.title}</div>

              <div className="widget-subtitle">
                {item.conversation_id ? (
                  <div className="widget-subtitle-row">
                    <button
                      type="button"
                      className="widget-subtitle-link"
                      onClick={handleConversationClick}
                      title={item.conversation_title || ""}
                    >
                      {item.conversation_title ||
                        t("dashboard.untitledConversation")}
                    </button>

                    <button
                      type="button"
                      className="widget-subtitle-iconBtn"
                      onClick={handleConversationClick}
                      title={t("dashboard.goToConversation")}
                    >
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
                    </button>
                  </div>
                ) : (
                  <span className="widget-subtitle-muted">
                    {t("dashboard.noConversationLinked")}
                  </span>
                )}
              </div>

              <div className="widget-metaTime">
                {item.updated_at
                  ? t("dashboard.lastUpdatedAt", {
                      ts: new Date(item.updated_at).toLocaleString(),
                    })
                  : item.created_at
                    ? t("dashboard.createdAt", {
                        ts: new Date(item.created_at).toLocaleString(),
                      })
                    : null}
              </div>
            </div>

            <div className="dashboard-widget-toolbar" onClick={stop}>
              <WidgetToolBtn
                id={`widget-share-${item.id}`}
                label={t("dashboard.widgetShare")}
                onClick={handleShare}
              >
                <FontAwesomeIcon icon={faShareAlt} />
              </WidgetToolBtn>

              <WidgetToolBtn
                id={`widget-settings-${item.id}`}
                label={t("dashboard.widgetSettings")}
                onClick={handleOpenSettings}
              >
                <FontAwesomeIcon icon={faPen} />
              </WidgetToolBtn>

              <WidgetToolBtn
                id={`widget-delete-${item.id}`}
                label={t("dashboard.widgetDelete")}
                onClick={handleDelete}
              >
                <FontAwesomeIcon icon={faTrash} />
              </WidgetToolBtn>
            </div>
          </div>
        </Card.Header>

        <Card.Body>
          <div className="dashboard-widget-inner">
            <div className="dashboard-widget-capture" ref={captureRef}>
              <DashboardWidgetContent
                item={item}
                onChartViewReady={(view) => {
                  vegaViewRef.current = view;
                }}
              />
            </div>
          </div>
        </Card.Body>
      </Card>

      <WidgetSettingsModal
        show={settingsOpen}
        item={item}
        onClose={() => setSettingsOpen(false)}
        canManualReorder={order === "position"}
        onSave={async (payload) => {
          // Preferred: generalized updater (supports configPatch + move)
          if (onUpdateItem) return await onUpdateItem(payload);

          // Fallback: only title via legacy rename callback
          if (payload?.title !== undefined) {
            return await onRename?.(payload.itemId || item.id, payload.title);
          }
          return false;
        }}
      />
    </>
  );
}
