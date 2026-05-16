// src/utils/waitlistClient.js
import i18n from "../i18n";

function mapWaitlistDetailToKey(detail) {
  if (!detail) return null;

  if (typeof detail === "string") {
    const d = detail.trim();

    if (d === "alreadyOnList" || d === "already_on_list")
      return "alreadyOnWaitListMsg";
    if (d.toLowerCase().includes("invalid email format"))
      return "invalidEmailFormat";
    if (d === "walletEmailAlreadySet") return "walletEmailAlreadySet";
    if (d === "userExistsError") return "userExistsError";

    if (/^[a-zA-Z0-9_]+$/.test(d)) return d;

    return null;
  }

  if (Array.isArray(detail)) {
    const asText = JSON.stringify(detail).toLowerCase();
    if (asText.includes('"email"') || asText.includes("email address")) {
      return "invalidEmailFormat";
    }
  }

  return null;
}

export async function postWaitlist({ email, ref, state, uid, wallet }) {
  const res = await fetch("/api/v1/wait_list", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email,
      ref,
      state: state || undefined,
      uid: uid || undefined,
      wallet: wallet || undefined,
      language: (i18n.language || "en").split("-")[0],
    }),
  });

  if (res.status === 201 || res.status === 200) return { kind: "success" };

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  const detail = data?.detail ?? data?.error ?? "";
  const mappedKey = mapWaitlistDetailToKey(detail);

  if (res.status === 418 || mappedKey === "alreadyOnWaitListMsg") {
    return { kind: "already" };
  }

  if (mappedKey) return { kind: "error", key: mappedKey };
  return { kind: "error", key: "errorWaitListMsg" };
}
