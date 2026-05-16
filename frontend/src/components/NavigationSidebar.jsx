// src/components/NavigationSidebar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHouse,
  faGaugeHigh,
  faCog,
  faArrowRightFromBracket,
  faChevronLeft,
  faShieldHalved,
  faChevronRight,
  faEllipsis,
  faPenToSquare,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import "../styles/NavigationSidebar.css";

const LS_KEY = "cap.sidebar.isOpen";

function SidebarTypingTitle({ title, isJustCreated, onDone }) {
  const FULL = String(title || "");

  const [shown, setShown] = useState(isJustCreated ? "" : FULL);

  const typingRef = useRef(false);
  const startedRef = useRef(false);
  const timerRef = useRef(null);

  // Freeze the text we type when typing begins
  const frozenTextRef = useRef(FULL);

  // Avoid effect re-runs from callback identity changes
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  // Keep title in sync ONLY when we're not typing a just-created item
  useEffect(() => {
    if (typingRef.current) return;
    if (isJustCreated) return;
    setShown(FULL);
  }, [FULL, isJustCreated]);

  useEffect(() => {
    // Start typing only once per "just created" lifecycle
    if (!isJustCreated) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    if (!FULL) return;

    startedRef.current = true;
    typingRef.current = true;

    frozenTextRef.current = FULL; // freeze snapshot at start
    setShown("");

    const TYPE_MS = 20;
    let i = 0;

    const tick = () => {
      i += 1;
      setShown(frozenTextRef.current.slice(0, i));

      if (i < frozenTextRef.current.length) {
        timerRef.current = window.setTimeout(tick, TYPE_MS);
      } else {
        typingRef.current = false;
        timerRef.current = null;
        if (typeof onDoneRef.current === "function") onDoneRef.current();
      }
    };

    timerRef.current = window.setTimeout(tick, TYPE_MS);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      typingRef.current = false;
    };
  }, [isJustCreated, FULL]);

  return <>{shown}</>;
}

export default function NavigationSidebar({
  isOpen,
  setIsOpen,
  handleLogout,
  user,
  conversations = [],
  conversationsLoading = false,
  // optional callbacks (pass from parent where you use useConversations)
  onRenameConversation,
  onDeleteConversation,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [typedDoneById, setTypedDoneById] = useState({});

  // Desktop only
  if (typeof window !== "undefined" && window.innerWidth < 1024) {
    return null;
  }

  // restore persisted open state once
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (!setIsOpen || restoredOnceRef.current) return;
    restoredOnceRef.current = true;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw === "true") setIsOpen(true);
      if (raw === "false") setIsOpen(false);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, String(!!isOpen));
    } catch {
      // ignore
    }
  }, [isOpen]);

  const collapsed = !isOpen;
  const handleNav = (path) => navigate(path);
  const isActive = (path, exact = false) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);
  const isConversationActive = (id) =>
    location.pathname === `/conversations/${id}`;

  const [processingConversationId, setProcessingConversationId] =
    useState(null);

  const setGlobalProcessingId = (cid) => {
    // Keep a single source of truth that survives route changes.
    window.__capProcessingConversationId = cid ?? null;
    // Optional: notify late subscribers if you want
    window.dispatchEvent(
      new CustomEvent("cap:stream-state", {
        detail: { conversationId: cid ?? null },
      }),
    );
  };

  useEffect(() => {
    const onStart = (e) => {
      const cid = e?.detail?.conversationId
        ? Number(e.detail.conversationId)
        : null;
      if (cid && !Number.isNaN(cid)) {
        setProcessingConversationId(cid);
        setGlobalProcessingId(cid);
      }
    };

    const onEnd = (e) => {
      const cid = e?.detail?.conversationId
        ? Number(e.detail.conversationId)
        : null;
      setProcessingConversationId((prev) => {
        if (!cid) return null;
        const next = prev === cid ? null : prev;
        if (prev === cid) setGlobalProcessingId(null);
        return next;
      });
    };

    window.addEventListener("cap:stream-start", onStart);
    window.addEventListener("cap:stream-end", onEnd);

    return () => {
      window.removeEventListener("cap:stream-start", onStart);
      window.removeEventListener("cap:stream-end", onEnd);
    };
  }, []);

  // Shift the app layout using #page-wrap padding (NOT navbar margin hacks)
  useEffect(() => {
    const pageWrap = document.getElementById("page-wrap");
    if (!pageWrap) return;

    pageWrap.classList.add("has-static-sidebar");

    if (collapsed) {
      pageWrap.classList.add("sidebar-collapsed");
      pageWrap.classList.remove("sidebar-expanded");
    } else {
      pageWrap.classList.add("sidebar-expanded");
      pageWrap.classList.remove("sidebar-collapsed");
    }

    return () => {
      pageWrap.classList.remove(
        "has-static-sidebar",
        "sidebar-expanded",
        "sidebar-collapsed",
      );
    };
  }, [collapsed]);

  const toggleSidebar = () => setIsOpen(!isOpen);

  // Hover logic for collapsed expand affordance (only when hovering NOT on items)
  const [hoverExpandZone, setHoverExpandZone] = useState(false);

  const isInteractiveTarget = (target) => {
    if (!target) return false;
    return (
      !!target.closest?.(".sidebar-item") ||
      !!target.closest?.(".sidebar-header-main") ||
      !!target.closest?.(".sidebar-header-collapse") ||
      !!target.closest?.(".sidebar-conversation") ||
      !!target.closest?.(".sidebar-conv-menu-btn") ||
      !!target.closest?.(".sidebar-conv-menu") ||
      !!target.closest?.(".sidebar-conv-rename")
    );
  };

  const handleSidebarClick = (e) => {
    if (!collapsed) return;
    if (isInteractiveTarget(e.target)) return;
    setIsOpen(true);
  };

  const handleSidebarMouseMove = (e) => {
    if (!collapsed) return;
    setHoverExpandZone(!isInteractiveTarget(e.target));
  };

  const handleSidebarMouseLeave = () => {
    setHoverExpandZone(false);
  };

  const safeConvos = useMemo(
    () => (Array.isArray(conversations) ? conversations : []),
    [conversations],
  );

  // Whenever conversations change, ensure the "done" flag is sane:
  // - if convo is just created => done=false (unless already true)
  // - if not just created => done=true (so preview can show normally)
  useEffect(() => {
    setTypedDoneById((prev) => {
      const next = { ...prev };
      for (const c of safeConvos) {
        const id = c?.id;
        if (!id) continue;
        const isJustCreated = c._justCreated === true;
        if (isJustCreated) {
          if (next[id] !== true) next[id] = false;
        } else {
          next[id] = true;
        }
      }
      return next;
    });
  }, [safeConvos]);

  // ---- conversation menu + rename ----
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);

  useEffect(() => {
    if (!renamingId) return;
    window.setTimeout(() => renameInputRef.current?.focus?.(), 0);
  }, [renamingId]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!menuOpenId) return;
      const inMenu = e.target?.closest?.(".sidebar-conv-menu");
      const inBtn = e.target?.closest?.(".sidebar-conv-menu-btn");
      if (!inMenu && !inBtn) setMenuOpenId(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenuOpenId(null);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpenId]);

  const startRename = (c) => {
    setMenuOpenId(null);
    setRenamingId(c.id);
    setRenameValue(String(c.title || t("nav.untitledConversation")));
  };

  const commitRename = async (c) => {
    const nextTitle = String(renameValue || "").trim();
    setRenamingId(null);

    if (!nextTitle) return;

    // call parent hook if provided (recommended)
    if (onRenameConversation) {
      await onRenameConversation(c.id, nextTitle);
    }
  };

  const doDelete = async (c) => {
    setMenuOpenId(null);
    const ok = window.confirm(
      t("nav.confirmDeleteConversation", "Delete this conversation?"),
    );
    if (!ok) return;

    if (onDeleteConversation) {
      await onDeleteConversation(c.id);
    }

    if (isConversationActive(c.id)) {
      navigate("/", { replace: true });
    }
  };

  return (
    <div className="cap-sidebar-shell">
      <aside
        className={`cap-sidebar ${collapsed ? "collapsed" : "expanded"} ${
          collapsed && hoverExpandZone ? "expand-cursor" : ""
        }`}
        aria-label={t("nav.sidebarAriaLabel")}
        onClick={handleSidebarClick}
        onMouseMove={handleSidebarMouseMove}
        onMouseLeave={handleSidebarMouseLeave}
      >
        {/* HEADER (logo only) */}
        <div className="sidebar-header">
          <button
            type="button"
            className="sidebar-header-main"
            onClick={toggleSidebar}
            title={
              collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")
            }
          >
            {collapsed && hoverExpandZone ? (
              <FontAwesomeIcon
                icon={faChevronRight}
                className="sidebar-expand-chevron"
              />
            ) : (
              <img src="/icons/logo.png" alt="CAP" className="sidebar-logo" />
            )}
          </button>

          {!collapsed && (
            <button
              type="button"
              className="sidebar-header-collapse"
              onClick={toggleSidebar}
              aria-label={t("nav.collapseSidebar")}
              title={t("nav.collapseSidebar")}
            >
              <FontAwesomeIcon icon={faChevronLeft} />
            </button>
          )}
        </div>

        {/* NAVIGATION */}
        <nav className="sidebar-nav">
          <Link
            to="/"
            onClick={() => handleNav("/")}
            className={`sidebar-item ${isActive("/", true) ? "active" : ""}`}
            title={t("nav.home")}
          >
            <FontAwesomeIcon icon={faHouse} />
            <span>{t("nav.home")}</span>
          </Link>

          {user?.is_admin && (
            <Link
              to="/admin"
              onClick={() => handleNav("/admin")}
              className={`sidebar-item ${isActive("/admin") ? "active" : ""}`}
              title={t("nav.admin")}
            >
              <FontAwesomeIcon icon={faShieldHalved} />
              <span>{t("nav.admin")}</span>
            </Link>
          )}

          <Link
            to="/dashboard"
            onClick={() => handleNav("/dashboard")}
            className={`sidebar-item ${isActive("/dashboard") ? "active" : ""}`}
            title={t("nav.dashboard")}
          >
            <FontAwesomeIcon icon={faGaugeHigh} />
            <span>{t("nav.dashboard")}</span>
          </Link>

          <Link
            to="/settings"
            onClick={() => handleNav("/settings")}
            className={`sidebar-item ${
              isActive("/settings", true) ? "active" : ""
            }`}
            title={t("nav.settings")}
          >
            <FontAwesomeIcon icon={faCog} />
            <span>{t("nav.settings")}</span>
          </Link>

          {/* Conversations only when expanded */}
          {user && !collapsed && (
            <div className="sidebar-section sidebar-section-conversations">
              <div className="sidebar-section-header">
                <span className="sidebar-section-title">
                  {t("nav.recentAnalyses")}
                </span>
              </div>

              <div className="sidebar-conversations-list">
                {conversationsLoading && safeConvos.length === 0 && (
                  <div className="sidebar-conversations-placeholder">
                    <span className="thinking-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </span>
                    <span>{t("nav.loadingConversations")}</span>
                  </div>
                )}

                {!conversationsLoading && safeConvos.length === 0 && (
                  <div className="sidebar-conversations-empty">
                    {t("nav.noConversations")}
                  </div>
                )}

                {!conversationsLoading &&
                  safeConvos.map((c) => {
                    const title = c.title || t("nav.untitledConversation");
                    const preview = c.last_message_preview;

                    const isActiveConv = isConversationActive(c.id);
                    const isProcessingConv = processingConversationId === c.id;
                    const isJustCreated = c._justCreated === true;
                    const typingDone = typedDoneById[c.id] === true;
                    const shouldShowPreview =
                      preview &&
                      renamingId !== c.id &&
                      (!isJustCreated || typingDone);

                    return (
                      <div
                        key={c.id}
                        className={`sidebar-conv-row ${
                          isActiveConv ? "active" : ""
                        }`}
                      >
                        <button
                          type="button"
                          className={`sidebar-conversation ${
                            isActiveConv ? "active" : ""
                          } ${isProcessingConv ? "processing" : ""}`}
                          onClick={() => handleNav(`/conversations/${c.id}`)}
                          title={preview || title}
                        >
                          <div className="sidebar-conversation-main">
                            {renamingId === c.id ? (
                              <input
                                ref={renameInputRef}
                                className="sidebar-conv-rename"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename(c);
                                  if (e.key === "Escape") setRenamingId(null);
                                }}
                                onBlur={() => commitRename(c)}
                                maxLength={255}
                              />
                            ) : (
                              <span className="sidebar-conversation-title">
                                <SidebarTypingTitle
                                  title={title}
                                  isJustCreated={isJustCreated}
                                  onDone={() =>
                                    setTypedDoneById((prev) => ({
                                      ...prev,
                                      [c.id]: true,
                                    }))
                                  }
                                />
                              </span>
                            )}
                          </div>

                          {shouldShowPreview && (
                            <div className="sidebar-conversation-preview">
                              {preview}
                            </div>
                          )}
                        </button>

                        <button
                          type="button"
                          className={`sidebar-conv-menu-btn ${
                            menuOpenId === c.id ? "open" : ""
                          }`}
                          title={t("nav.conversationOptions", "Options")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenId((prev) =>
                              prev === c.id ? null : c.id,
                            );
                          }}
                        >
                          <FontAwesomeIcon icon={faEllipsis} />
                        </button>

                        {menuOpenId === c.id && (
                          <div
                            className="sidebar-conv-menu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="sidebar-conv-menu-item"
                              onClick={() => startRename(c)}
                            >
                              <FontAwesomeIcon icon={faPenToSquare} />
                              <span>{t("nav.rename", "Rename")}</span>
                            </button>

                            <button
                              type="button"
                              className="sidebar-conv-menu-item danger"
                              onClick={() => doDelete(c)}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                              <span>{t("nav.delete", "Delete")}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="sidebar-spacer" />

          {/* Logout bottom */}
          {user && (
            <button
              className="sidebar-item logout"
              onClick={() => {
                if (handleLogout) handleLogout();
                setIsOpen(false);
              }}
              title={t("nav.logout")}
            >
              <FontAwesomeIcon icon={faArrowRightFromBracket} />
              <span>{t("nav.logout")}</span>
            </button>
          )}
        </nav>

        <footer className="sidebar-footer">
          <span>v0.1.0</span>
          <span className="muted">© MOBR Systems</span>
        </footer>
      </aside>
    </div>
  );
}
