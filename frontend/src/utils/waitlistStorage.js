// src/utils/waitlistStorage.js

const STORAGE_PREFIX = "cap_waitlist_wallet_claimed_v1:";

function makeWalletKey(wallet) {
  return `${STORAGE_PREFIX}wallet:${wallet}`;
}

function makeUidKey(uid) {
  return `${STORAGE_PREFIX}uid:${uid}`;
}

function safeSet(key, valueObj) {
  try {
    window.localStorage.setItem(key, JSON.stringify(valueObj));
  } catch {
    // ignore
  }
}

function safeGet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getWalletStorageKey(wallet) {
  if (!wallet) return null;
  return makeWalletKey(wallet);
}

export function getUidStorageKey(uid) {
  if (!uid) return null;
  return makeUidKey(uid);
}

/**
 * Persist a "claimed" marker for wallet/uid.
 * IMPORTANT: include email so wallet-only redirects don't mistakenly show "already"
 * unless a real submission happened.
 */
export function markClaimed({
  walletStorageKey,
  uidStorageKey,
  uid,
  wallet,
  email,
}) {
  const payload = {
    claimed: true,
    ts: Date.now(),
    uid: uid || null,
    wallet: wallet || null,
    email: (email || "").trim() || null,
  };

  if (walletStorageKey) safeSet(walletStorageKey, payload);
  if (uidStorageKey) safeSet(uidStorageKey, payload);
}

/**
 * Returns true if a valid claimed record exists.
 * For wallet flow, we require an email in the stored record; otherwise ignore.
 */
export function isClaimedLocally({
  walletStorageKey,
  uidStorageKey,
  requireEmail = false,
}) {
  const check = (k) => {
    if (!k) return false;
    const v = safeGet(k);
    if (!v?.claimed) return false;
    if (requireEmail && !(v.email && String(v.email).trim().length > 0)) {
      return false;
    }
    return true;
  };

  if (check(walletStorageKey)) return true;
  if (check(uidStorageKey)) return true;
  return false;
}
