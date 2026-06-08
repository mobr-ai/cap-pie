// src/hooks/useAdminDataConsole.js
import { useCallback, useRef, useState } from "react";

function graphPath(graphUri) {
  return `/api/v1/graphs/${encodeURIComponent(String(graphUri || "").trim())}`;
}

function normalizeJson(value) {
  if (value == null || value === "") return {};
  if (typeof value === "object") return value;
  return JSON.parse(value);
}

async function parseResponse(res) {
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }

  if (!res.ok) {
    throw new Error(data?.detail || data?.message || `HTTP ${res.status}`);
  }

  return data;
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function useAdminDataConsole(authFetch, showToast, t) {
  const [loadingKey, setLoadingKey] = useState(null);
  const [longRunningKey, setLongRunningKey] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const authFetchRef = useRef(authFetch);
  const showToastRef = useRef(showToast);
  const tRef = useRef(t);

  authFetchRef.current = authFetch;
  showToastRef.current = showToast;
  tRef.current = t;

  const runAction = useCallback(async (key, fn, options = {}) => {
    const af = authFetchRef.current;
    if (!af) return null;

    const timeoutMs = options.timeoutMs ?? 45000;
    const tr = tRef.current;
    const timeoutMessage =
      options.timeoutMessage ||
      tr?.("admin.dataConsoleRequestTimeout") ||
      "Request timed out";

    let longRunningTimer = null;

    setLoadingKey(key);
    setLongRunningKey(null);
    setError(null);

    longRunningTimer = window.setTimeout(() => {
      setLongRunningKey(key);

      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) {
        toast(
          tr("admin.dataConsoleLongRunningToast", { action: key }),
          "warning",
        );
      }
    }, 4000);

    try {
      const data = await withTimeout(fn(af), timeoutMs, timeoutMessage);
      setResult({ key, data, at: new Date().toISOString() });
      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) toast(tr("admin.dataConsoleToastSuccess"), "success");
      return data;
    } catch (err) {
      const msg = err?.message || "Unknown error";
      setError(msg);
      setResult({ key, error: msg, at: new Date().toISOString() });
      const toast = showToastRef.current;
      const tr = tRef.current;
      if (toast && tr) toast(`${tr("admin.dataConsoleToastError")}: ${msg}`, "danger");
      return null;
    } finally {
      if (longRunningTimer) window.clearTimeout(longRunningTimer);
      setLoadingKey(null);
      setLongRunningKey(null);
    }
  }, []);

  const executeSparql = useCallback((query, type = "SELECT") => {
    return runAction("sparql", async (af) => {
      const res = await af("/api/v1/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, type }),
      });
      return parseResponse(res);
    });
  }, [runAction]);

  const readGraph = useCallback((graphUri) => {
    return runAction("graphRead", async (af) => {
      const res = await af(graphPath(graphUri), { method: "GET" });
      return parseResponse(res);
    });
  }, [runAction]);

  const createGraph = useCallback((graphUri, turtleData) => {
    return runAction("graphCreate", async (af) => {
      const res = await af("/api/v1/graphs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph_uri: graphUri, turtle_data: turtleData }),
      });
      return parseResponse(res);
    });
  }, [runAction]);

  const updateGraph = useCallback((graphUri, insertData, deleteData, prefixes) => {
    return runAction("graphUpdate", async (af) => {
      const payload = {
        insert_data: insertData || null,
        delete_data: deleteData || null,
        prefixes: normalizeJson(prefixes),
      };
      const res = await af(graphPath(graphUri), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseResponse(res);
    });
  }, [runAction]);

  const deleteGraph = useCallback((graphUri) => {
    return runAction("graphDelete", async (af) => {
      const res = await af(graphPath(graphUri), { method: "DELETE" });
      return parseResponse(res);
    });
  }, [runAction]);

  const cacheInfo = useCallback(() => {
    return runAction("cacheInfo", async (af) => {
      const res = await af("/api/v1/admin/cache/info", { method: "GET" });
      return parseResponse(res);
    });
  }, [runAction]);

  const nlCacheInfo = useCallback(() => {
    return runAction("nlCacheInfo", async (af) => {
      const res = await af("/api/v1/admin/cache/info/nl", { method: "GET" });
      return parseResponse(res);
    });
  }, [runAction]);

  const clearCache = useCallback(() => {
    return runAction("cacheClear", async (af) => {
      const res = await af("/api/v1/admin/cache/clear", { method: "DELETE" });
      return parseResponse(res);
    });
  }, [runAction]);

  const precacheFromFile = useCallback((filePath, ttl) => {
    return runAction("precacheFile", async (af) => {
      const payload = { file_path: filePath };
      if (ttl !== "" && ttl != null) payload.ttl = Number(ttl);
      const res = await af("/api/v1/admin/cache/precache/file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return parseResponse(res);
    });
  }, [runAction]);

  const precacheUpload = useCallback((file, ttl) => {
    return runAction(
      "precacheUpload",
      async (af) => {
        const form = new FormData();
        form.append("file", file);
        if (ttl !== "" && ttl != null) form.append("ttl", String(ttl));
        const res = await af("/api/v1/admin/cache/precache/upload", {
          method: "POST",
          body: form,
        });
        return parseResponse(res);
      },
      {
        timeoutMs: 60000,
        timeoutMessage:
          tRef.current?.("admin.dataConsoleUploadTimeout") ||
          "Upload/pre-cache request is taking too long",
      },
    );
  }, [runAction]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return {
    loadingKey,
    longRunningKey,
    result,
    error,
    executeSparql,
    readGraph,
    createGraph,
    updateGraph,
    deleteGraph,
    cacheInfo,
    nlCacheInfo,
    clearCache,
    precacheFromFile,
    precacheUpload,
    clearResult,
  };
}
