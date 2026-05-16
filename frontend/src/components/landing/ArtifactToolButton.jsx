// src/components/landing/ArtifactToolButton.jsx
import React from "react";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";

const isTouchLike = () => {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(hover: none) and (pointer: coarse)")?.matches ||
    "ontouchstart" in window
  );
};

export default function ArtifactToolButton({
  id,
  label,
  onClick,
  children,
  disabled = false,
}) {
  const btn = (
    <button
      type="button"
      className="artifact-toolBtn"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={isTouchLike() ? label : undefined}
    >
      {children}
    </button>
  );

  if (isTouchLike()) return btn;

  return (
    <OverlayTrigger
      placement="top"
      container={document.body}
      overlay={<Tooltip id={id}>{label}</Tooltip>}
    >
      {btn}
    </OverlayTrigger>
  );
}
