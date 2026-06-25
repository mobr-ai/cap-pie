// src/components/admin/AdminTabs.jsx
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export function AdminTabs({ activeTab, onChange, t, tabs: providedTabs }) {
  const tabs = useMemo(() => {
    const labels = {
      overview: t("admin.tabOverview"),
      users: t("admin.tabUsers"),
      billing: t("admin.tabBilling"),
      metrics: t("admin.tabMetrics"),
      "beta-program": t("admin.tabBetaProgram"),
      "data-console": t("admin.tabDataConsole"),
      system: t("admin.tabSystem"),
      alerts: t("admin.tabAlerts"),
    };

    const source =
      Array.isArray(providedTabs) && providedTabs.length
        ? providedTabs
        : [
            { key: "overview" },
            { key: "users" },
            { key: "billing" },
            { key: "metrics" },
            { key: "data-console" },
            { key: "system" },
            { key: "alerts" },
          ];

    return source.map((tab) => ({
      ...tab,
      label: tab.label || labels[tab.key] || tab.key,
    }));
  }, [providedTabs, t]);

  const shellRef = useRef(null); // non-scrolling outer pill
  const scrollerRef = useRef(null); // scrolling row
  const btnRefs = useRef({});
  const rafRef = useRef(0);

  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const recalcIndicator = () => {
    const scroller = scrollerRef.current;
    const shell = shellRef.current;
    const el = btnRefs.current[activeTab];
    if (!scroller || !shell || !el) return;

    // button position in scroller content coords
    const leftInScroller = el.offsetLeft;

    // translate to shell coords (scroller might have padding/offset inside shell)
    const leftInShell =
      leftInScroller - scroller.scrollLeft + (scroller.offsetLeft || 0);

    setIndicator({
      left: leftInShell,
      width: el.offsetWidth,
    });
  };

  const ensureActiveVisible = () => {
    const scroller = scrollerRef.current;
    const el = btnRefs.current[activeTab];
    if (!scroller || !el) return;

    const pad = 10;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;

    const viewLeft = scroller.scrollLeft;
    const viewRight = viewLeft + scroller.clientWidth;

    let next = null;

    if (right + pad > viewRight) next = right - scroller.clientWidth + pad;
    else if (left - pad < viewLeft) next = Math.max(0, left - pad);

    if (next !== null) {
      scroller.scrollTo({ left: next, behavior: "smooth" });
      requestAnimationFrame(() => recalcIndicator());
    }
  };

  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      recalcIndicator();
    });
  };

  useLayoutEffect(() => {
    recalcIndicator();
    requestAnimationFrame(() => ensureActiveVisible());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tabs]);

  useEffect(() => {
    const scroller = scrollerRef.current;

    const onResize = () => recalcIndicator();

    window.addEventListener("resize", onResize);
    if (scroller)
      scroller.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", onResize);
      if (scroller) scroller.removeEventListener("scroll", onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return (
    <div
      ref={shellRef}
      className="admin-tabs admin-tabs--animated"
      data-swipe-tabs-disabled="true"
    >
      <span
        className="admin-tab-indicator"
        style={{
          width: `${indicator.width}px`,
          transform: `translate3d(${indicator.left}px, 0, 0)`,
        }}
        aria-hidden="true"
      />

      <div ref={scrollerRef} className="admin-tabs-scroller">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            ref={(node) => {
              if (node) btnRefs.current[tab.key] = node;
            }}
            className={
              activeTab === tab.key
                ? "admin-tab admin-tab--active"
                : "admin-tab"
            }
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
