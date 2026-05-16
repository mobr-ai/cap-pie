// src/utils/streamSanitizers.js

const NL_SENTINEL = "__NL__";

// Called for EACH streamed chunk
export function sanitizeChunk(chunk) {
  if (chunk == null) return "";

  let s = String(chunk);

  // Normalize CRLF/CR just in case
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Decode backend newline sentinel back into real newlines
  if (s.includes(NL_SENTINEL)) {
    s = s.split(NL_SENTINEL).join("\n");
  }

  // IMPORTANT:
  // - Do NOT trimStart(): it breaks markdown indentation (code blocks, lists)
  // - Do NOT trimEnd(): it can eat significant markdown whitespace / line breaks
  return s;
}

// Called once when stream is DONE (to finalize the full assistant message)
export function finalizeForRender(text) {
  if (text == null) return "";

  let s = String(text);

  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // In case any sentinel survived chunking, decode it here too
  if (s.includes(NL_SENTINEL)) {
    s = s.split(NL_SENTINEL).join("\n");
  }

  // Optional: collapse insane blank-line spam, but KEEP normal markdown newlines
  s = s.replace(/\n{4,}/g, "\n\n\n");

  // Collapse excessive blank lines (tighten)
  s = s.replace(/\n{3,}/g, "\n\n");

  // Keep trailing whitespace/newline minimal, without destroying markdown structure
  // (ReactMarkdown is fine with a trailing newline)
  return s;
}
