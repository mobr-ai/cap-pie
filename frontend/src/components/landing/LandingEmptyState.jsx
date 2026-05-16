import React, { useEffect, useMemo, useRef, useState } from "react";

const ROBOT = "\uD83E\uDD16"; // unicode escape

function capitalizeFirstLetter(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildRotationLines({ topQueries, t }) {
  const extras = [
    t?.("landing.emptySubtitle") || "",
    t?.("landing.emptyRotating.0") || "",
    t?.("landing.emptyRotating.1") || "",
    t?.("landing.emptyRotating.2") || "",
    t?.("landing.emptyRotating.3") || "",
    t?.("landing.emptyRotating.4") || "",
  ].filter((s) => typeof s === "string" && s.trim().length > 0);

  const dynamic = (topQueries || [])
    .map((q) => (typeof q === "string" ? q : q?.query))
    .filter((s) => typeof s === "string" && s.trim().length > 0);

  // extras first, then dynamic; de-dupe while preserving order
  const seen = new Set();
  return [...extras, ...dynamic]
    .map((s) => capitalizeFirstLetter(s))
    .filter((s) => {
      const k = s.trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export default function LandingEmptyState({
  t,
  topQueries = [],
  isProcessing = false,

  // typing feel
  typingMsPerChar = 18,

  // rotation feel (slower display)
  pauseAfterTypedMs = 2200,
  fadeMs = 220,
}) {
  const lines = useMemo(
    () => buildRotationLines({ topQueries, t }),
    [topQueries, t]
  );

  const [lineIndex, setLineIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [isFading, setIsFading] = useState(false);

  const timersRef = useRef([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => {
    clearTimers();

    if (!lines.length) {
      setTyped("");
      return () => clearTimers();
    }

    const full = String(lines[lineIndex] || "");
    setTyped("");
    setIsFading(false);

    let i = 0;

    const tick = () => {
      if (i >= full.length) {
        // keep caret blinking during the pause
        timersRef.current.push(
          setTimeout(() => {
            setIsFading(true);
            timersRef.current.push(
              setTimeout(() => {
                setIsFading(false);
                setLineIndex((prev) => (prev + 1) % lines.length);
              }, fadeMs)
            );
          }, pauseAfterTypedMs)
        );
        return;
      }

      i += 1;
      setTyped(full.slice(0, i));
      timersRef.current.push(setTimeout(tick, typingMsPerChar));
    };

    timersRef.current.push(setTimeout(tick, typingMsPerChar));

    return () => clearTimers();
  }, [lineIndex, lines, typingMsPerChar, pauseAfterTypedMs, fadeMs]);

  // optional: freeze animation while processing to keep page calm
  useEffect(() => {
    if (!isProcessing) return;
    clearTimers();
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProcessing]);

  const showCaret = true;

  return (
    <div className="landing-empty">
      <div className="landing-empty-robotWrap" aria-hidden="true">
        <div className="landing-empty-robotBadge">
          <span className="landing-empty-robot">{ROBOT}</span>
        </div>
      </div>

      <div className={`landing-empty-line ${isFading ? "is-fading" : ""}`}>
        <span className="landing-empty-typed">{typed}</span>
        {showCaret ? <span className="landing-empty-caret" /> : null}
      </div>
    </div>
  );
}
