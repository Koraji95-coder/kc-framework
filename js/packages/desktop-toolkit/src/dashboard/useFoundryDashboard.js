import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Headless React hook that polls Foundry broker endpoints and aggregates the
 * results into a single dashboard data shape. Drop into any consumer app or
 * the standalone preview to power a live dashboard.
 *
 * @param {object} options
 * @param {string} options.brokerUrl
 *   Base URL for the Foundry broker, e.g. `"http://127.0.0.1:57420"`. No
 *   trailing slash required.
 * @param {string} [options.apiKey]
 *   Optional `X-Foundry-Api-Key` header. Required for `/api/lanes` (the lane
 *   list is gated by identity). Other endpoints (metrics, usage summary,
 *   providers) are not auth-gated on loopback by default.
 * @param {number} [options.pollIntervalMs=5000]
 *   How often to refetch. Default 5s. Pass 0 to disable polling (fetch once
 *   on mount only).
 * @param {("1h"|"24h"|"7d"|"30d"|"all")} [options.window="24h"]
 *   Time window for /api/usage/summary aggregates. "all" omits the from/to
 *   filter and asks the broker for the full lifetime summary.
 * @param {{ lanes?: string[], apps?: string[] }} [options.filter]
 *   Optional narrowing. Currently only `lanes` is honored -- restricts the
 *   returned lane list to those names. `apps` is reserved for the future
 *   node-graph view.
 *
 * @returns {{
 *   data: ?object,
 *   isLoading: boolean,
 *   error: ?string,
 *   refresh: () => Promise<void>,
 *   lastUpdated: ?Date,
 * }}
 *
 * The `data` shape:
 * ```
 * {
 *   lanes:     [{ name, description, model, allowModelOverride }],
 *   identity:  string | null,            // the resolved X-Foundry-Api-Key identity
 *   metrics:   { broker, process, streams },
 *   usage:     { totalRequests, totalCost, byLane: [...] },
 *   providers: { knownPrefixes: [...], providers: [{ id, label, reachable }] },
 * }
 * ```
 */
export function useFoundryDashboard({
  brokerUrl,
  apiKey,
  pollIntervalMs = 5000,
  window: timeWindow = "24h",
  filter,
} = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const cancelledRef = useRef(false);
  const pollTimerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    if (!brokerUrl) {
      setError("brokerUrl is required");
      setIsLoading(false);
      return;
    }

    const base = brokerUrl.replace(/\/$/, "");
    // The broker's LaneAuthMiddleware gates /api/lanes, /api/metrics,
    // /api/providers, /api/usage/* (and /api/chat/*) all behind the same
    // X-Foundry-Api-Key header. Pass it to every dashboard endpoint when
    // present -- otherwise three of the four fetches 401 in production and
    // the dashboard renders with empty stat cards.
    const authHeaders = apiKey ? { "X-Foundry-Api-Key": apiKey } : {};
    const authInit = apiKey ? { headers: authHeaders } : undefined;

    try {
      const [lanesRes, metricsRes, usageRes, providersRes] = await Promise.all([
        // /api/lanes is auth-gated; if no key is provided, skip it gracefully.
        apiKey
          ? fetch(`${base}/api/lanes`, authInit)
          : Promise.resolve(null),
        fetch(`${base}/api/metrics`, authInit),
        fetch(`${base}/api/usage/summary${windowToQuery(timeWindow)}`, authInit),
        fetch(`${base}/api/providers`, authInit),
      ]);

      const lanesBody = lanesRes?.ok ? await lanesRes.json() : { lanes: [], identity: null };
      const metricsBody = metricsRes.ok ? await metricsRes.json() : null;
      const usageBody = usageRes.ok ? await usageRes.json() : null;
      const providersBody = providersRes.ok ? await providersRes.json() : null;

      let lanes = lanesBody.lanes ?? [];
      if (filter?.lanes && filter.lanes.length > 0) {
        const allow = new Set(filter.lanes);
        lanes = lanes.filter((l) => allow.has(l.name));
      }

      if (!cancelledRef.current) {
        setData({
          lanes,
          identity: lanesBody.identity ?? null,
          metrics: metricsBody,
          usage: usageBody,
          providers: providersBody,
        });
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, [brokerUrl, apiKey, timeWindow, filter?.lanes]);

  useEffect(() => {
    cancelledRef.current = false;
    setIsLoading(true);

    fetchAll();

    if (pollIntervalMs > 0) {
      pollTimerRef.current = setInterval(fetchAll, pollIntervalMs);
    }

    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchAll, pollIntervalMs]);

  return { data, isLoading, error, refresh: fetchAll, lastUpdated };
}

// -- Helpers -------------------------------------------------------------

/**
 * Translate a friendly window label into a `?from=...&to=...` query string
 * matching the broker's /api/usage/summary contract. "all" returns an
 * empty string so the broker's lifetime aggregation is used.
 */
function windowToQuery(window) {
  if (!window || window === "all") return "";
  const now = new Date();
  const hoursMap = { "1h": 1, "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };
  const hours = hoursMap[window];
  if (!hours) return "";
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);
  // The broker accepts ISO-8601 instants; trim ms for cleaner URLs.
  const isoTrim = (d) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  return `?from=${encodeURIComponent(isoTrim(from))}&to=${encodeURIComponent(isoTrim(now))}`;
}
