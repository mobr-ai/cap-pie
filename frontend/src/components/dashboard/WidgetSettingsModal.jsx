// src/components/dashboard/WidgetSettingsModal.jsx
import React from "react";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useTranslation } from "react-i18next";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUp,
  faArrowDown,
  faGripLines,
  faCircleInfo,
} from "@fortawesome/free-solid-svg-icons";

const CATEGORY_OPTIONS = [
  // { key: null, labelKey: "dashboard.settings.categoryDefault" },
  { key: "governance", labelKey: "dashboard.settings.categoryGovernance" },
  { key: "spo", labelKey: "dashboard.settings.categorySPO" },
  { key: "tokens", labelKey: "dashboard.settings.categoryTokens" },
  // { key: "defi", labelKey: "dashboard.settings.categoryDeFi" },
  // { key: "treasury", labelKey: "dashboard.settings.categoryTreasury" },
  { key: "wallets", labelKey: "dashboard.settings.categoryWallets" },
  { key: "network", labelKey: "dashboard.settings.categoryNetwork" },
  { key: "nft", labelKey: "dashboard.settings.categoryNFT" },
  // { key: "markets", labelKey: "dashboard.settings.categoryMarkets" },
  { key: "metadata", labelKey: "dashboard.settings.categoryMetadata" },
];

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

const COLOR_OPTIONS = [
  { key: null, labelKey: "dashboard.settings.colorDefault", swatch: "default" },
  { key: "blue", labelKey: "dashboard.settings.colorBlue", swatch: "blue" },
  { key: "green", labelKey: "dashboard.settings.colorGreen", swatch: "green" },
  {
    key: "purple",
    labelKey: "dashboard.settings.colorPurple",
    swatch: "purple",
  },
  {
    key: "orange",
    labelKey: "dashboard.settings.colorOrange",
    swatch: "orange",
  },
  { key: "pink", labelKey: "dashboard.settings.colorPink", swatch: "pink" },
  { key: "teal", labelKey: "dashboard.settings.colorTeal", swatch: "teal" },
  { key: "gray", labelKey: "dashboard.settings.colorGray", swatch: "gray" },
];

const LAYOUT_OPTIONS = [
  { key: "auto", labelKey: "dashboard.settings.layoutAuto" },
  { key: "normal", labelKey: "dashboard.settings.layoutNormal" },
  { key: "wide", labelKey: "dashboard.settings.layoutWide" },
];

export default function WidgetSettingsModal({
  show,
  item,
  onClose,
  onSave,
  canManualReorder,
}) {
  const { t } = useTranslation();

  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState("");

  const lastSentRef = React.useRef(null);
  const saveTimerRef = React.useRef(null);

  // Visual order support (dense grid flow)
  const [visualOrder, setVisualOrder] = React.useState([]);

  React.useEffect(() => {
    if (!show) return;

    // Pull current snapshot
    const initial =
      Array.isArray(window.__capDashboardVisualOrder) &&
      window.__capDashboardVisualOrder.length > 0
        ? window.__capDashboardVisualOrder
        : [];

    setVisualOrder(initial);

    // Subscribe for updates
    const onVisualOrder = (e) => {
      const next = Array.isArray(e?.detail) ? e.detail : [];
      setVisualOrder(next);
    };

    window.addEventListener("cap:dashboard-visual-order", onVisualOrder);
    return () => {
      window.removeEventListener("cap:dashboard-visual-order", onVisualOrder);
    };
  }, [show]);

  const buildConfigPatchFromDraft = (d) => {
    const patch = {
      ui: {
        layoutMode: d.layoutMode,
        appearance: {
          color: d.color ?? null,
          category: d.category ?? null,
        },
      },
    };

    // Only mutate legacy `layout` when user explicitly chose a size.
    if (d.layoutMode === "wide") {
      patch.layout = "wide";
    } else if (d.layoutMode === "normal") {
      patch.layout = null;
    }
    // if layoutMode === "auto" -> leave `layout` untouched (do not include it)

    return patch;
  };

  const sendPatch = React.useCallback(
    async (nextDraft, { immediate = false } = {}) => {
      if (!item || saving) return;

      const nextTitle = String(nextDraft?.title || "").trim();
      if (!nextTitle) return;

      const payload = {
        itemId: item.id,
        title: nextTitle,
        configPatch: buildConfigPatchFromDraft(nextDraft),
        silent: true,
      };

      const sig = JSON.stringify(payload);
      if (!immediate && lastSentRef.current === sig) return;

      if (immediate) setSaving(true);
      setErrorMsg("");

      try {
        const ok = await onSave?.(payload);
        if (ok === false) {
          setErrorMsg(t("dashboard.settings.saveFailed"));
          return;
        }
        lastSentRef.current = sig;
      } catch {
        setErrorMsg(t("dashboard.settings.saveFailed"));
      } finally {
        if (immediate) setSaving(false);
      }
    },
    [item, saving, onSave, t],
  );

  const readInitial = React.useCallback(() => {
    const cfg = item?.config || {};
    const ui = cfg.ui || {};
    const legacyWide = cfg.layout === "wide";
    const layoutMode = ui.layoutMode || (legacyWide ? "wide" : "auto");

    const appearance = ui.appearance || {};
    const category =
      typeof appearance.category !== "undefined" ? appearance.category : null;
    const color =
      typeof appearance.color !== "undefined" ? appearance.color : null;

    return {
      title: item?.title || "",
      layoutMode,
      category,
      color,
    };
  }, [item]);

  const titleInputRef = React.useRef(null);
  const [draft, setDraft] = React.useState(readInitial);

  const prevShowRef = React.useRef(false);
  const prevItemIdRef = React.useRef(null);

  React.useEffect(() => {
    if (!show) {
      prevShowRef.current = false;
      prevItemIdRef.current = null;
      return;
    }

    const currentId = item?.id ?? null;
    const justOpened = !prevShowRef.current;
    const switchedItem = prevItemIdRef.current !== currentId;

    // Only reset local draft when the modal is opened (or the user switched items),
    // not on every upstream item update caused by autosave.
    if (justOpened || switchedItem) {
      setErrorMsg("");
      setDraft(readInitial());

      requestAnimationFrame(() => {
        const el = titleInputRef.current;
        if (!el) return;
        // optional: put caret at end on open
        try {
          const end = el.value?.length ?? 0;
          el.setSelectionRange(end, end);
          el.scrollLeft = el.scrollWidth;
        } catch {
          // ignore
        }
      });
    }

    prevShowRef.current = true;
    prevItemIdRef.current = currentId;
  }, [show, item?.id, readInitial]);

  const update = (patch, { flush = false } = {}) => {
    setErrorMsg("");

    let computedNext = null;

    setDraft((d) => {
      computedNext = { ...d, ...patch };
      return computedNext;
    });

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    if (flush) {
      queueMicrotask(() => {
        if (computedNext) sendPatch(computedNext, { immediate: false });
      });
      return;
    }

    saveTimerRef.current = setTimeout(() => {
      if (computedNext) {
        sendPatch(computedNext, { immediate: false });
      } else {
        setDraft((d) => {
          sendPatch(d, { immediate: false });
          return d;
        });
      }
    }, 450);
  };

  const handleClose = () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    sendPatch(draft, { immediate: true }).finally(() => {
      onClose?.();
    });
  };

  // Position logic: prefer dense visual order (what user sees)
  const itemId = Number(item?.id);
  const visualIdx =
    Number.isFinite(itemId) && Array.isArray(visualOrder)
      ? visualOrder.indexOf(itemId)
      : -1;

  const hasVisual =
    visualIdx >= 0 &&
    Array.isArray(visualOrder) &&
    Number.isFinite(itemId) &&
    visualOrder.length > 0;

  const posMinVisual = hasVisual ? visualIdx + 1 : null;
  const posMaxVisual = hasVisual ? visualOrder.length : null;

  // Fallback to backend-supplied position range if visual order not available
  const posMinBackend = Number(item?.position_min);
  const posMaxBackend = Number(item?.position_max);
  const hasPosRangeBackend =
    Number.isFinite(posMinBackend) && Number.isFinite(posMaxBackend);

  const positionText = hasVisual
    ? `${posMinVisual} / ${posMaxVisual}`
    : t("dashboard.settings.positionUnknown");

  // Move enablement based on manual mode + visual order
  const canMoveUp =
    !!canManualReorder &&
    hasVisual &&
    Number.isFinite(posMinVisual) &&
    posMinVisual > 1;

  const canMoveDown =
    !!canManualReorder &&
    hasVisual &&
    Number.isFinite(posMinVisual) &&
    Number.isFinite(posMaxVisual) &&
    posMinVisual < posMaxVisual;

  const handleMove = async (dir) => {
    if (!item || saving) return;
    if (!canManualReorder) return;
    if (!hasVisual) return;

    const neighborId =
      dir === "up" ? visualOrder[visualIdx - 1] : visualOrder[visualIdx + 1];

    if (!neighborId) return;

    setSaving(true);
    setErrorMsg("");
    try {
      const ok = await onSave?.({
        itemId: item.id,
        swap_with_id: neighborId,
        silent: true,
      });
      if (ok === false) {
        setErrorMsg(t("dashboard.settings.moveFailed"));
      }
    } catch {
      setErrorMsg(t("dashboard.settings.moveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const MaybeTooltip = ({ tooltip, children, id }) => {
    if (!tooltip) return children;

    return (
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip id={id}>{tooltip}</Tooltip>}
      >
        <span className="d-inline-block">{children}</span>
      </OverlayTrigger>
    );
  };

  const moveUpTip = !canManualReorder
    ? t("dashboard.settings.moveDisabledManualOnly")
    : !hasVisual
      ? t("dashboard.settings.positionUnknown")
      : posMinVisual <= 1
        ? t("dashboard.settings.moveUpDisabled")
        : null;

  const moveDownTip = !canManualReorder
    ? t("dashboard.settings.moveDisabledManualOnly")
    : !hasVisual
      ? t("dashboard.settings.positionUnknown")
      : posMinVisual >= posMaxVisual
        ? t("dashboard.settings.moveDownDisabled")
        : null;

  return (
    <Modal
      show={show}
      onHide={handleClose}
      centered
      animation
      contentClassName="dashboard-settings-modal"
      dialogClassName="dashboard-settings-modal-dialog"
      backdropClassName="dashboard-settings-modal-backdrop"
    >
      <Modal.Header closeButton={!saving}>
        <Modal.Title>{t("dashboard.settings.title")}</Modal.Title>
      </Modal.Header>

      <Modal.Body className="dashboard-settings-body">
        {errorMsg ? (
          <div className="dashboard-settings-error">
            <FontAwesomeIcon icon={faCircleInfo} /> {errorMsg}
          </div>
        ) : null}

        <div className="dashboard-settings-block">
          <div className="dashboard-settings-sectionTitle">
            {t("dashboard.settings.sectionGeneral")}
          </div>

          <Form.Group>
            <Form.Label className="small text-muted">
              {t("dashboard.settings.widgetTitleLabel")}
            </Form.Label>
            <Form.Control
              ref={titleInputRef}
              type="text"
              value={draft.title}
              onChange={(e) => update({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  sendPatch(draft, { immediate: true });
                }
              }}
              disabled={saving}
              autoFocus
              maxLength={150}
              placeholder={t("dashboard.settings.widgetTitlePlaceholder")}
            />
          </Form.Group>
        </div>

        <div className="dashboard-settings-block">
          <div className="dashboard-settings-sectionTitle">
            {t("dashboard.settings.sectionLayout")}
          </div>

          {!canManualReorder ? (
            <div className="dashboard-settings-hint">
              <FontAwesomeIcon icon={faCircleInfo} />{" "}
              {t("dashboard.settings.reorderOnlyManualHint")}
            </div>
          ) : null}

          <div className="dashboard-settings-layoutRow">
            <div className="dashboard-settings-positionInfo">
              <div className="dashboard-settings-positionTitle">
                <FontAwesomeIcon icon={faGripLines} />{" "}
                {t("dashboard.settings.positionLabel")}
              </div>
              <div className="dashboard-settings-positionValue">
                {positionText}
              </div>
            </div>
          </div>

          <div className="dashboard-settings-moveRow">
            <MaybeTooltip tooltip={moveUpTip} id="tip-move-up">
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={saving || !canMoveUp}
                onClick={() => handleMove("up")}
                className="dashboard-settings-moveBtn"
              >
                <FontAwesomeIcon icon={faArrowUp} />{" "}
                {t("dashboard.settings.moveUp")}
              </Button>
            </MaybeTooltip>

            <MaybeTooltip tooltip={moveDownTip} id="tip-move-down">
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={saving || !canMoveDown}
                onClick={() => handleMove("down")}
                className="dashboard-settings-moveBtn"
              >
                <FontAwesomeIcon icon={faArrowDown} />{" "}
                {t("dashboard.settings.moveDown")}
              </Button>
            </MaybeTooltip>
          </div>

          <Form.Group className="dashboard-settings-layoutSelect">
            <Form.Label className="small text-muted">
              {t("dashboard.settings.layoutModeLabel")}
            </Form.Label>
            <Form.Select
              value={draft.layoutMode}
              onChange={(e) => update({ layoutMode: e.target.value })}
              disabled={saving}
            >
              {LAYOUT_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </div>

        <div className="dashboard-settings-block">
          <div className="dashboard-settings-sectionTitle">
            {t("dashboard.settings.sectionAppearance")}
          </div>

          <div className="dashboard-settings-appearanceGrid">
            <div className="dashboard-settings-appearanceCol">
              <Form.Label className="small text-muted">
                {t("dashboard.settings.widgetColorLabel")}
              </Form.Label>

              <div className="dashboard-colorGrid dashboard-colorGrid--compact">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.key)}
                    type="button"
                    className={[
                      "dashboard-colorChip",
                      "dashboard-colorChip--compact",
                      draft.color === opt.key && "is-selected",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => {
                      if (opt.key === null) {
                        update(
                          { color: null, category: null },
                          { flush: true },
                        );
                      } else {
                        update(
                          { color: opt.key, category: null },
                          { flush: true },
                        );
                      }
                    }}
                    disabled={saving}
                  >
                    <span
                      className="dashboard-colorSwatch dashboard-colorSwatch--compact"
                      data-color={opt.swatch}
                    />
                    <span className="dashboard-colorLabel">
                      {t(opt.labelKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="dashboard-settings-appearanceCol">
              <Form.Label className="small text-muted">
                {t("dashboard.settings.categoryLabel")}
              </Form.Label>

              <div className="dashboard-pillRow dashboard-pillRow--compact">
                {CATEGORY_OPTIONS.map((opt) => {
                  const accent =
                    opt.key && CATEGORY_ACCENTS[opt.key]
                      ? CATEGORY_ACCENTS[opt.key]
                      : null;

                  return (
                    <button
                      key={String(opt.key)}
                      type="button"
                      className={[
                        "dashboard-pill",
                        "dashboard-pill--compact",
                        draft.category === opt.key && "is-selected",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={accent ? { "--pill-accent": accent } : undefined}
                      onClick={() =>
                        update(
                          { category: opt.key, color: null },
                          { flush: true },
                        )
                      }
                      disabled={saving}
                    >
                      <span className="dashboard-pillDot" />
                      {t(opt.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Modal.Body>
    </Modal>
  );
}
