// Single-instance pollers per "key" (e.g., "dashboard", "dashboard-items").
const g = typeof window !== "undefined" ? window : globalThis;
if (!g.__CAP_POLLERS__) g.__CAP_POLLERS__ = new Map();

function now() {
  return Date.now();
}

export function getPoller(key, opts) {
  const {
    interval = 15_000, // base cadence
    maxInterval = 120_000, // cap for backoff
    visibleOnly = true, // pause when tab hidden
    runImmediately = true,
  } = opts || {};

  if (g.__CAP_POLLERS__.has(key)) return g.__CAP_POLLERS__.get(key);

  let timer = null;
  let inFlight = false;
  let failCount = 0;
  let lastError = null;
  let lastOkAt = 0;
  let subscribers = new Set(); // (data, err) => void
  let fetchFn = null; // async () => data

  const computeDelay = () => {
    if (failCount === 0) return interval;
    const backoff = Math.min(
      maxInterval,
      interval * 2 ** Math.min(failCount, 6)
    );
    return backoff;
  };

  const tick = async () => {
    if (!fetchFn) return;
    if (visibleOnly && typeof document !== "undefined" && document.hidden) {
      timer = setTimeout(tick, interval);
      return;
    }
    if (inFlight) {
      // never overlap
      timer = setTimeout(tick, 250);
      return;
    }

    inFlight = true;
    try {
      const data = await fetchFn();
      lastOkAt = now();
      failCount = 0;
      lastError = null;
      for (const cb of subscribers) cb(data, null);
    } catch (e) {
      failCount += 1;
      lastError = e;
      for (const cb of subscribers) cb(null, e);
    } finally {
      inFlight = false;
      timer = setTimeout(tick, computeDelay());
    }
  };

  const api = {
    key,
    setFetcher(fn) {
      fetchFn = fn;
    },
    subscribe(cb) {
      subscribers.add(cb);
      if (runImmediately && subscribers.size === 1) {
        // start loop on first subscriber
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
      }
      return () => {
        subscribers.delete(cb);
        if (subscribers.size === 0) {
          clearTimeout(timer);
          timer = null;
          inFlight = false;
          failCount = 0;
          lastError = null;
          lastOkAt = 0;
        }
      };
    },
    forceRefresh() {
      if (!inFlight) {
        clearTimeout(timer);
        timer = setTimeout(tick, 0);
      }
    },
    stats() {
      return { inFlight, failCount, lastOkAt, lastError };
    },
  };

  g.__CAP_POLLERS__.set(key, api);
  return api;
}
