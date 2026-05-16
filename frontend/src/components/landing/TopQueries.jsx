// src/components/landing/TopQueries.jsx
import React from "react";

export default function TopQueries({
  title,
  topQueries = [],
  isProcessing = false,
  onSelectQuery,
}) {
  function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  return (
    <>
      <div className="empty-state-examples-title">{title}</div>

      <div className="examples">
        {topQueries.map((q, i) => (
          <button
            key={`${q.query}-${i}`}
            className={`example-chip ${isProcessing ? "disabled" : ""}`}
            // title={q.frequency ? `Asked ${q.frequency} times` : undefined}
            onClick={() => {
              if (!isProcessing) onSelectQuery?.(q);
            }}
          >
            {capitalizeFirstLetter(q.query)}
          </button>
        ))}
      </div>
    </>
  );
}
