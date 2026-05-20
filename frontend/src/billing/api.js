const API_BASE = "/api/v1";

function getSessionToken(session) {
  return session?.access_token || session?.token || null;
}

async function parseJsonResponse(res) {
  const text = await res.text();

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!res.ok) {
    const detail = data?.detail || data?.error || `Request failed (${res.status})`;
    const err = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  return data;
}

function authHeaders(session) {
  const token = getSessionToken(session);

  if (!token) {
    throw new Error("Missing authentication token");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchBillingPlans() {
  const res = await fetch(`${API_BASE}/billing/plans`);
  return parseJsonResponse(res);
}

export async function fetchMyEntitlements(session) {
  const token = getSessionToken(session);

  if (!token) {
    return { entitlements: [] };
  }

  const res = await fetch(`${API_BASE}/billing/entitlements/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseJsonResponse(res);
}

export async function fetchMyCreditBalance(session) {
  const token = getSessionToken(session);

  if (!token) {
    return { balance: { currency: "lovelace", balance: 0, balance_lovelace: 0 } };
  }

  const res = await fetch(`${API_BASE}/billing/balance/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return parseJsonResponse(res);
}

export async function fetchMyBillingTransactions(session, limit = 20) {
  const res = await fetch(`${API_BASE}/billing/transactions/me?limit=${limit}`, {
    headers: authHeaders(session),
  });

  return parseJsonResponse(res);
}

export async function createCardanoPaymentSession(
  session,
  options = "cap_premium_access",
) {
  const payload =
    typeof options === "string"
      ? { kind: "plan_purchase", plan_code: options }
      : {
          kind: options?.kind || "plan_purchase",
          plan_code: options?.planCode || options?.plan_code || "cap_premium_access",
          amount_lovelace: options?.amountLovelace ?? options?.amount_lovelace,
        };

  const res = await fetch(`${API_BASE}/billing/cardano/session`, {
    method: "POST",
    headers: {
      ...authHeaders(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(res);
}

export async function verifyCardanoPayment(session, sessionId, txHash) {
  const res = await fetch(`${API_BASE}/billing/cardano/verify`, {
    method: "POST",
    headers: {
      ...authHeaders(session),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
      tx_hash: txHash,
    }),
  });

  return parseJsonResponse(res);
}

export function hasEntitlement(entitlements, entitlementCode = "cap_premium_access") {
  return (entitlements || []).some(
    (item) =>
      item?.entitlement_code === entitlementCode &&
      item?.status === "active",
  );
}
