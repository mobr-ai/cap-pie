// src/hooks/useConversations.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * useConversations
 *
 * Supports BOTH calling styles:
 *  1) useConversations(authFetch, enabled)
 *  2) useConversations({ authFetch, enabled, showToast, t, limit })
 *
 * Backend (cap/api/conversation.py):
 *  - GET    /api/v1/conversations/?limit=50   -> List[ConversationSummary]
 *  - PATCH  /api/v1/conversations/{id}        -> ConversationSummary
 *  - DELETE /api/v1/conversations/{id}        -> 204 No Content
 *
 * Events:
 *  - cap:conversation-created  detail: { conversation: { id, title, _justCreated: true, ... } }
 *  - cap:conversation-touched  detail: { conversation: { id, updated_at } }
 */
export function useConversations(arg1, arg2) {
  const opts = useMemo(() => {
    if (typeof arg1 === "function") {
      return {
        authFetch: arg1,
        enabled: arg2 !== false,
        limit: 50,
        showToast: null,
        t: null,
      };
    }

    const o = arg1 || {};
    return {
      authFetch: o.authFetch,
      enabled: o.enabled !== false,
      limit: typeof o.limit === "number" ? o.limit : 50,
      showToast: o.showToast || null,
      t: o.t || null,
    };
  }, [arg1, arg2]);

  const { authFetch, enabled, limit, showToast, t } = opts;

  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);

  // Tracks timers that clear _justCreated after typing animation
  const typingTimersRef = useRef({});

  const hasAnyRef = useRef(false);

  useEffect(() => {
    hasAnyRef.current =
      Array.isArray(conversations) && conversations.length > 0;
  }, [conversations]);

  const safeToast = useCallback(
    (msg, variant) => {
      if (typeof showToast === "function") showToast(msg, variant);
    },
    [showToast]
  );

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  const normalizeConversation = useCallback((c) => {
    if (!c || typeof c !== "object") return null;

    const id = c.id;
    if (id === null || typeof id === "undefined") return null;

    // Only include fields that are actually present in payload.
    // This prevents events like {id, updated_at} from nulling title.
    const out = { ...c, id };

    if (hasOwn(c, "title")) out.title = c.title ?? null;
    if (hasOwn(c, "created_at")) out.created_at = c.created_at ?? null;
    if (hasOwn(c, "updated_at")) out.updated_at = c.updated_at ?? null;
    if (hasOwn(c, "last_message_preview"))
      out.last_message_preview = c.last_message_preview ?? null;

    if (hasOwn(c, "_justCreated")) out._justCreated = !!c._justCreated;

    return out;
  }, []);

  const parseTs = (v) => {
    if (!v) return 0;

    if (typeof v === "number") return Number.isFinite(v) ? v : 0;

    const s = String(v).trim();
    if (!s) return 0;

    // "YYYY-MM-DD HH:mm:ss" (common backend) -> treat as UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
      const iso = s.replace(" ", "T") + "Z";
      const t = Date.parse(iso);
      return Number.isFinite(t) ? t : 0;
    }

    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  };

  const sortConversations = useCallback((items) => {
    const arr = Array.isArray(items) ? items.slice() : [];

    arr.sort((a, b) => {
      // 1) Prefer local stamps if present (guarantees immediate bump)
      const aLocal = Number(a?._localUpdatedAt || 0);
      const bLocal = Number(b?._localUpdatedAt || 0);
      if (aLocal !== bLocal) return bLocal - aLocal;

      // 2) Fallback to parsed timestamps
      const aTs = parseTs(a?.updated_at) || parseTs(a?.created_at);
      const bTs = parseTs(b?.updated_at) || parseTs(b?.created_at);
      return bTs - aTs;
    });

    return arr;
  }, []);

  const scheduleClearJustCreated = useCallback((convId, titleLen = 20) => {
    const idKey = String(convId);

    if (typingTimersRef.current[idKey]) {
      clearTimeout(typingTimersRef.current[idKey]);
    }

    // visible duration: ~55ms per char, clamped
    const ms = Math.max(1800, Math.min(5000, Math.round(titleLen * 55)));

    typingTimersRef.current[idKey] = window.setTimeout(() => {
      if (!mountedRef.current) return;

      setConversations((prev) =>
        (Array.isArray(prev) ? prev : []).map((c) =>
          String(c.id) === idKey ? { ...c, _justCreated: false } : c
        )
      );

      delete typingTimersRef.current[idKey];
    }, ms);
  }, []);

  const upsertConversation = useCallback(
    (raw) => {
      const incoming = normalizeConversation(raw);
      if (!incoming) return;

      setConversations((prev) => {
        const next = Array.isArray(prev) ? prev.slice() : [];
        const idx = next.findIndex((x) => String(x.id) === String(incoming.id));

        if (idx >= 0) {
          const existing = next[idx];

          // Merge WITHOUT overwriting with null/undefined for key fields.
          next[idx] = {
            ...existing,
            ...incoming,
            _justCreated:
              typeof incoming._justCreated === "undefined"
                ? existing._justCreated
                : incoming._justCreated,
            _localUpdatedAt:
              typeof incoming._localUpdatedAt === "undefined"
                ? existing._localUpdatedAt
                : incoming._localUpdatedAt,
            title:
              incoming.title === null || typeof incoming.title === "undefined"
                ? existing.title
                : incoming.title,
            last_message_preview:
              typeof incoming.last_message_preview === "undefined" ||
              incoming.last_message_preview === null
                ? existing.last_message_preview
                : incoming.last_message_preview,
            created_at:
              typeof incoming.created_at === "undefined" ||
              incoming.created_at === null
                ? existing.created_at
                : incoming.created_at,
            updated_at:
              typeof incoming.updated_at === "undefined" ||
              incoming.updated_at === null
                ? existing.updated_at
                : incoming.updated_at,
          };
        } else {
          next.unshift(incoming);
        }

        return sortConversations(next);
      });

      if (incoming._justCreated) {
        const len = String(incoming.title || "").length || 20;
        scheduleClearJustCreated(incoming.id, len);
      }
    },
    [normalizeConversation, scheduleClearJustCreated, sortConversations]
  );

  const updateConversationTitle = useCallback((id, title) => {
    if (!id) return;
    const nextTitle = String(title || "").trim();

    setConversations((prev) =>
      (Array.isArray(prev) ? prev : []).map((c) =>
        String(c.id) === String(id)
          ? {
              ...c,
              title: nextTitle ? nextTitle : null,
              updated_at: new Date().toISOString(),
            }
          : c
      )
    );
  }, []);

  const removeConversation = useCallback((id) => {
    if (!id) return;
    setConversations((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (c) => String(c.id) !== String(id)
      )
    );
  }, []);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled) return;
      if (typeof authFetch !== "function") return;

      if (!force && inFlightRef.current) return;
      inFlightRef.current = true;

      const shouldShowLoading = mountedRef.current && !hasAnyRef.current;
      if (shouldShowLoading) setIsLoading(true);

      try {
        const url = `/api/v1/conversations/?limit=${encodeURIComponent(limit)}`;
        const res = await authFetch(url, { method: "GET" });

        if (!res?.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text || `Failed to load conversations (${res?.status})`
          );
        }

        const data = await res.json().catch(() => null);
        const items = Array.isArray(data) ? data : [];

        const normalized = items.map(normalizeConversation).filter(Boolean);

        if (mountedRef.current) {
          setConversations((prev) => {
            const prevArr = Array.isArray(prev) ? prev : [];
            const prevById = new Map(prevArr.map((c) => [String(c.id), c]));

            const merged = normalized.map((c) => {
              const old = prevById.get(String(c.id));
              if (!old) return c;

              return {
                ...c,
                // preserve local-only flags/stamps if backend doesn't have them
                _localUpdatedAt: c._localUpdatedAt || old._localUpdatedAt || 0,
                _justCreated: c._justCreated || old._justCreated || false,
              };
            });

            // also keep any purely-local conversations not in backend response yet
            const mergedIds = new Set(merged.map((c) => String(c.id)));
            for (const old of prevArr) {
              if (!mergedIds.has(String(old.id))) merged.push(old);
            }

            return sortConversations(merged);
          });
        }
      } catch (err) {
        console.error("useConversations.load error:", err);
        safeToast(
          (t &&
            t("nav.conversationsLoadFailed", "Failed to load conversations")) ||
            "Failed to load conversations",
          "danger"
        );
      } finally {
        inFlightRef.current = false;
        if (shouldShowLoading && mountedRef.current) setIsLoading(false);
      }
    },
    [
      authFetch,
      enabled,
      limit,
      normalizeConversation,
      safeToast,
      sortConversations,
      t,
    ]
  );

  const renameConversation = useCallback(
    async (id, nextTitle) => {
      if (!enabled) return;
      if (typeof authFetch !== "function") return;

      const title = String(nextTitle || "").trim();
      if (!id || !title) return;

      // optimistic
      updateConversationTitle(id, title);

      try {
        const res = await authFetch(`/api/v1/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });

        if (!res?.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text || `Failed to rename conversation (${res?.status})`
          );
        }

        const updated = await res.json().catch(() => null);
        if (updated) upsertConversation(updated);
        else load({ force: true });
      } catch (err) {
        console.error("useConversations.renameConversation error:", err);
        load({ force: true });

        safeToast(
          (t && t("nav.renameFailed", "Failed to rename conversation")) ||
            "Failed to rename conversation",
          "danger"
        );
      }
    },
    [
      authFetch,
      enabled,
      load,
      safeToast,
      t,
      upsertConversation,
      updateConversationTitle,
    ]
  );

  const deleteConversation = useCallback(
    async (id) => {
      if (!enabled) return;
      if (typeof authFetch !== "function") return;
      if (!id) return;

      // optimistic
      removeConversation(id);

      try {
        const res = await authFetch(`/api/v1/conversations/${id}`, {
          method: "DELETE",
        });

        if (!res?.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(
            text || `Failed to delete conversation (${res?.status})`
          );
        }
      } catch (err) {
        console.error("useConversations.deleteConversation error:", err);
        load({ force: true });

        safeToast(
          (t && t("nav.deleteFailed", "Failed to delete conversation")) ||
            "Failed to delete conversation",
          "danger"
        );
      }
    },
    [authFetch, enabled, load, removeConversation, safeToast, t]
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;

      // cleanup typing timers
      const timers = typingTimersRef.current || {};
      Object.keys(timers).forEach((k) => clearTimeout(timers[k]));
      typingTimersRef.current = {};
    };
  }, []);

  // initial load
  useEffect(() => {
    if (!enabled) return;
    if (typeof authFetch !== "function") return;
    load({ force: true });
  }, [enabled, authFetch, load]);

  // created event: used for typing animation
  useEffect(() => {
    if (!enabled) return;

    const onCreated = (e) => {
      const detail = e?.detail;
      const conv = detail?.conversation || detail;

      if (conv) upsertConversation(conv);
      else load({ force: true });
    };

    window.addEventListener("cap:conversation-created", onCreated);
    return () =>
      window.removeEventListener("cap:conversation-created", onCreated);
  }, [enabled, load, upsertConversation]);

  // touched event: used to bump recency after stream ends
  useEffect(() => {
    if (!enabled) return;

    const onTouched = (e) => {
      const detail = e?.detail;
      const conv = detail?.conversation || detail;
      if (!conv?.id) return;

      // touched events must not mutate title (or other fields),
      // only bump recency.
      upsertConversation({
        id: conv.id,
        _localUpdatedAt: Date.now(),
        updated_at: conv.updated_at || new Date().toISOString(),
        // do not include title / last_message_preview / etc here
      });
    };

    window.addEventListener("cap:conversation-touched", onTouched);
    return () =>
      window.removeEventListener("cap:conversation-touched", onTouched);
  }, [enabled, upsertConversation]);

  return {
    conversations,
    isLoading,
    reload: () => load({ force: true }),
    upsertConversation,
    renameConversation,
    deleteConversation,
    removeConversation,
    updateConversationTitle,
  };
}

export default useConversations;
