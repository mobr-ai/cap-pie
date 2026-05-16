// src/utils/waitlistParseParams.js
export function parseWaitlistParams(searchParams) {
  const state = (searchParams.get("state") || "").trim();
  const uid = (searchParams.get("uid") || "").trim();
  const walletRaw = searchParams.get("wallet") || "";
  const ref = (searchParams.get("ref") || "").trim();
  const prefillEmail = (searchParams.get("email") || "").trim();

  const wallet = normalizeWalletParam(walletRaw);

  const isWalletFlow =
    state === "wallet" && (wallet.length > 0 || uid.length > 0);

  // Important: OAuth "state" is not a waitlist state.
  // Any redirect with an email should trigger the auto-submit (unless wallet flow).
  const isEmailRedirectFlow = !isWalletFlow && prefillEmail.length > 0;

  return {
    state,
    uid,
    wallet,
    ref,
    prefillEmail,
    isWalletFlow,
    isEmailRedirectFlow,
  };
}

function normalizeWalletParam(raw) {
  const v = (raw || "").trim();
  if (!v) return "";
  try {
    return decodeURIComponent(v).trim().toLowerCase();
  } catch {
    return v.toLowerCase();
  }
}
