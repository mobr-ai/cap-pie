import i18n from "../i18n";

export function getSessionUserId(session) {
  if (!session || typeof session !== "object") return null;

  // Common flat shapes
  const direct =
    session.user_id ?? session.userId ?? session.id ?? session.uid ?? null;
  if (direct != null) return direct;

  // Common nested shapes: { user: { id/user_id/... } }
  const u = session.user;
  if (u && typeof u === "object") {
    return u.user_id ?? u.userId ?? u.id ?? u.uid ?? null;
  }

  return null;
}

export function isValidEmail(s) {
  if (typeof s !== "string") return false;
  const v = s.trim();
  if (v.length < 3) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function normalizeApiErrorKey(err) {
  const detail = err?.detail ?? err?.error ?? err;

  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const asText = JSON.stringify(detail).toLowerCase();
    if (asText.includes('"email"') || asText.includes("email address")) {
      return "invalidEmailFormat";
    }
    return "requestInvalid";
  }

  if (detail && typeof detail === "object") {
    const asText = JSON.stringify(detail).toLowerCase();
    if (asText.includes('"email"') || asText.includes("email address")) {
      return "invalidEmailFormat";
    }
    return "requestInvalid";
  }

  return "loginError";
}

export function currentLang() {
  return (
    i18n.language?.split("-")[0] ||
    window.localStorage.i18nextLng?.split("-")[0] ||
    "en"
  );
}

export function passwordStrengthKey(pwRaw) {
  const pw = (pwRaw || "").trim();
  const n = pw.length;

  if (n === 0) return "passwordStrengthEmpty";
  if (n < 8) return "passwordStrengthWeak";
  if (n < 12) return "passwordStrengthOk";
  return "passwordStrengthStrong";
}
