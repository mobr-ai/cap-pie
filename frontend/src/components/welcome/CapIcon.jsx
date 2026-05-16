// src/components/welcome/CapIcon.jsx
import React from "react";

export default function CapIcon({ name }) {
  if (name === "llm") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="CapIcon">
        <path
          fill="currentColor"
          d="M8.5 3A3.5 3.5 0 0 0 5 6.5V8H4a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1.5A3.5 3.5 0 0 0 8.5 18H10v1a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1h.5A3.5 3.5 0 0 0 19 14.5V13h1a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1V6.5A3.5 3.5 0 0 0 15.5 3H8.5Zm0 2h7A1.5 1.5 0 0 1 17 6.5V8H7V6.5A1.5 1.5 0 0 1 8.5 5ZM4 10h16v1H4v-1Zm3 3h10v1.5a1.5 1.5 0 0 1-1.5 1.5H15v3h-1v-3h-4v3H9v-3h-.5A1.5 1.5 0 0 1 7 14.5V13Z"
        />
      </svg>
    );
  }

  if (name === "kg") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="CapIcon">
        <path
          fill="currentColor"
          d="M12 2a3 3 0 0 0-3 3c0 .4.08.78.22 1.14L6.1 8.02A3 3 0 0 0 4 7a3 3 0 1 0 2.98 3.35l3.18 1.27a3.1 3.1 0 0 0 0 .76L6.98 13.65A3 3 0 1 0 8 16a3 3 0 0 0-.12-.83l3.18-1.27c.27.06.56.1.86.1s.59-.04.86-.1l3.18 1.27A3 3 0 1 0 16 16c0-.4.08-.78.22-1.14l-3.12-1.88a3.1 3.1 0 0 0 0-.96l3.12-1.88c.2.6.77 1.04 1.46 1.04a1.5 1.5 0 1 0-1.36-2.14L13.78 6.14c.14-.36.22-.74.22-1.14a3 3 0 0 0-3-3Zm0 2a1 1 0 1 1 0 2a1 1 0 0 1 0-2ZM4 9a1 1 0 1 1 0 2a1 1 0 0 1 0-2Zm8 4a1 1 0 1 1 0-2a1 1 0 0 1 0 2ZM6 16a1 1 0 1 1-2 0a1 1 0 0 1 2 0Zm14 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z"
        />
      </svg>
    );
  }

  if (name === "dash") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="CapIcon">
        <path
          fill="currentColor"
          d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm2 10h3v-5H6v5Zm5 0h3V8h-3v8Zm5 0h2v-3h-2v3Z"
        />
      </svg>
    );
  }

  if (name === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="CapIcon">
        <path fill="currentColor" d="M13 2 3 14h7l-1 8 12-14h-7l-1-6Z" />
      </svg>
    );
  }

  return null;
}
