// src/components/landing/AgentAvatar.jsx
import React, { memo, useId } from "react";

const AgentAvatar = memo(function AgentAvatar({
  variant = "chat",
  className = "",
  label = "CAP agent",
}) {
  const uid = useId().replace(/:/g, "");

  const topId = `capCubeTop-${uid}`;
  const leftId = `capCubeLeft-${uid}`;
  const rightId = `capCubeRight-${uid}`;
  const edgeId = `capCubeEdge-${uid}`;

  const classes = [
    "cap-agent-avatar",
    `cap-agent-avatar--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} role="img" aria-label={label}>
      <svg
        className="cap-agent-avatar__svg"
        viewBox="0 0 80 80"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id={topId} x1="18" y1="12" x2="62" y2="38">
            <stop offset="0%" className="cap-agent-stop--ice" stopOpacity="0.95" />
            <stop offset="48%" className="cap-agent-stop--primary" stopOpacity="0.72" />
            <stop offset="100%" className="cap-agent-stop--ink" stopOpacity="0.9" />
          </linearGradient>

          <linearGradient id={leftId} x1="14" y1="28" x2="40" y2="68">
            <stop offset="0%" className="cap-agent-stop--primary" stopOpacity="0.72" />
            <stop offset="62%" className="cap-agent-stop--deep" stopOpacity="0.92" />
            <stop offset="100%" className="cap-agent-stop--ink" stopOpacity="0.98" />
          </linearGradient>

          <linearGradient id={rightId} x1="66" y1="27" x2="40" y2="68">
            <stop offset="0%" className="cap-agent-stop--ice" stopOpacity="0.82" />
            <stop offset="44%" className="cap-agent-stop--secondary" stopOpacity="0.68" />
            <stop offset="100%" className="cap-agent-stop--deep" stopOpacity="0.96" />
          </linearGradient>

          <linearGradient id={edgeId} x1="14" y1="14" x2="66" y2="66">
            <stop offset="0%" className="cap-agent-stop--ice" stopOpacity="0.95" />
            <stop offset="48%" className="cap-agent-stop--primary" stopOpacity="0.82" />
            <stop offset="100%" className="cap-agent-stop--secondary" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        <path
          className="cap-agent-avatar__shadow"
          d="M20 57L40 68L60 57L40 74Z"
        />

        <g className="cap-agent-avatar__cube">
          <polygon
            className="cap-agent-avatar__face cap-agent-avatar__face--top"
            points="40 11 64 26 40 41 16 26"
            fill={`url(#${topId})`}
          />
          <polygon
            className="cap-agent-avatar__face cap-agent-avatar__face--left"
            points="16 26 40 41 40 68 16 53"
            fill={`url(#${leftId})`}
          />
          <polygon
            className="cap-agent-avatar__face cap-agent-avatar__face--right"
            points="64 26 40 41 40 68 64 53"
            fill={`url(#${rightId})`}
          />

          <path
            className="cap-agent-avatar__glass"
            d="M29 26L40 19L51 26L40 33Z"
          />
          <path
            className="cap-agent-avatar__glass cap-agent-avatar__glass--left"
            d="M24 36L40 46V59L24 49Z"
          />
          <path
            className="cap-agent-avatar__glass cap-agent-avatar__glass--right"
            d="M56 36L40 46V59L56 49Z"
          />

          <path
            className="cap-agent-avatar__edge cap-agent-avatar__edge--outer"
            d="M40 11L64 26V53L40 68L16 53V26L40 11Z"
            fill="none"
            stroke={`url(#${edgeId})`}
          />
          <path
            className="cap-agent-avatar__edge cap-agent-avatar__edge--spine"
            d="M16 26L40 41L64 26M40 41V68"
            fill="none"
            stroke={`url(#${edgeId})`}
          />

          <path className="cap-agent-avatar__shine" d="M29 26L40 19L51 26" />
          <path className="cap-agent-avatar__shine cap-agent-avatar__shine--soft" d="M58 33V49" />
        </g>
      </svg>
    </span>
  );
});

export default AgentAvatar;
