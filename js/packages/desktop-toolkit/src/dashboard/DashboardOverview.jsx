import { useState } from "react";
import { useFoundryDashboard } from "./useFoundryDashboard.js";
import "./DashboardOverview.css";

/**
 * Drop-in dashboard view for the Foundry broker. Polls every 5s by default;
 * renders broker health, registered lanes (sorted by cost), recent usage,
 * and provider reachability in a list/card layout matching the deep-dive
 * aesthetic.
 *
 * Apps that want a custom layout should call `useFoundryDashboard()`
 * directly and compose their own UI from the returned data shape.
 *
 * @param {object} props
 * @param {string} props.brokerUrl
 *   Base URL for the Foundry broker, e.g. `"http://127.0.0.1:57420"`.
 * @param {string} [props.apiKey]
 *   Optional `X-Foundry-Api-Key` header. Required to populate the lane list.
 * @param {number} [props.pollIntervalMs=5000]
 *   Refresh interval. 0 = no polling, fetch once on mount only.
 * @param {("1h"|"24h"|"7d"|"30d"|"all")} [props.defaultWindow="24h"]
 *   Initial usage time window. Driven through the in-header picker.
 * @param {{ lanes?: string[] }} [props.filter]
 *   Optional narrowing -- show only specific lanes.
 * @param {string} [props.className]
 */
export function DashboardOverview({
  brokerUrl,
  apiKey,
  pollIntervalMs = 5000,
  defaultWindow = "24h",
  filter,
  className,
}) {
  const [timeWindow, setTimeWindow] = useState(defaultWindow);

  const { data, isLoading, error, refresh, lastUpdated } = useFoundryDashboard({
    brokerUrl,
    apiKey,
    pollIntervalMs,
    window: timeWindow,
    filter,
  });

  return (
    <div className={`ch-dash ${className ?? ""}`.trim()}>
      <Header
        brokerUrl={brokerUrl}
        identity={data?.identity}
        lastUpdated={lastUpdated}
        onRefresh={refresh}
        isLoading={isLoading}
        timeWindow={timeWindow}
        onTimeWindowChange={setTimeWindow}
      />

      {error && <div className="ch-dash-error">connection error: {error}</div>}

      {isLoading && !data ? (
        <div className="ch-dash-empty">Loading broker state...</div>
      ) : data ? (
        <>
          <StatGrid metrics={data.metrics} usage={data.usage} lanesCount={data.lanes.length} timeWindow={timeWindow} />
          <LanesPanel lanes={data.lanes} usage={data.usage} />
          <ProvidersPanel providers={data.providers} />
        </>
      ) : null}
    </div>
  );
}

function Header({ brokerUrl, identity, lastUpdated, onRefresh, isLoading, timeWindow, onTimeWindowChange }) {
  return (
    <div className="ch-dash-header">
      <div className="ch-dash-header-main">
        <h2 className="ch-dash-title">Foundry broker</h2>
        <span className="ch-dash-broker-url">{brokerUrl}</span>
        {identity && <span className="ch-dash-identity">as {identity}</span>}
      </div>
      <div className="ch-dash-header-actions">
        <TimeWindowPicker value={timeWindow} onChange={onTimeWindowChange} />
        {lastUpdated && (
          <span className="ch-dash-stale">
            updated {formatRelative(lastUpdated)}
          </span>
        )}
        <button
          type="button"
          className="ch-dash-refresh"
          onClick={onRefresh}
          disabled={isLoading}
        >
          refresh
        </button>
      </div>
    </div>
  );
}

const WINDOW_OPTIONS = [
  { value: "1h",  label: "1h"  },
  { value: "24h", label: "24h" },
  { value: "7d",  label: "7d"  },
  { value: "30d", label: "30d" },
  { value: "all", label: "all" },
];

function TimeWindowPicker({ value, onChange }) {
  return (
    <div className="ch-dash-window" role="group" aria-label="Usage time window">
      {WINDOW_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={opt.value === value ? "ch-dash-window-btn ch-dash-window-btn-active" : "ch-dash-window-btn"}
          aria-pressed={opt.value === value}
          onClick={() => onChange && onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function StatGrid({ metrics, usage, lanesCount, timeWindow }) {
  const uptimeSec = metrics?.broker?.uptimeSeconds ?? 0;
  const activeStreams = metrics?.streams?.activeTotal ?? 0;
  const totalRequests = usage?.totalRequests ?? usage?.requestCount ?? 0;
  const totalCost = usage?.totalCost ?? usage?.totalCostUsd ?? 0;
  const windowLabel = timeWindow === "all" ? "lifetime" : timeWindow;

  return (
    <div className="ch-dash-stats">
      <Stat label="Lanes"                                value={lanesCount} />
      <Stat label="Active streams"                       value={activeStreams} dot={activeStreams > 0 ? "emerald" : null} />
      <Stat label={`Requests (${windowLabel})`}          value={totalRequests.toLocaleString()} />
      <Stat label={`Cost (${windowLabel})`}              value={formatCost(totalCost)} />
      <Stat label="Uptime"                               value={formatUptime(uptimeSec)} />
    </div>
  );
}

function Stat({ label, value, dot }) {
  return (
    <div className="ch-dash-stat">
      <div className="ch-dash-stat-label">
        {dot && <span className={`ch-dash-dot ch-dash-dot-${dot}`} aria-hidden />}
        {label}
      </div>
      <div className="ch-dash-stat-value">{value}</div>
    </div>
  );
}

function LanesPanel({ lanes, usage }) {
  if (lanes.length === 0) {
    return (
      <Panel title="Lanes">
        <div className="ch-dash-empty">No lanes visible to this identity.</div>
      </Panel>
    );
  }

  // Normalize the LaneSummaryRow / UsageAggregate shapes the broker returns
  // into a single per-lane stat row keyed by lane name.
  const usageByLane = new Map();
  if (Array.isArray(usage?.byLane)) {
    for (const row of usage.byLane) {
      const lane = row.lane ?? row.Lane ?? row.key;
      if (!lane) continue;
      usageByLane.set(lane, {
        requests:     row.requestCount      ?? row.requests     ?? 0,
        cost:         row.totalCostUsd      ?? row.costUsd      ?? 0,
        inputTokens:  row.totalInputTokens  ?? row.inputTokens  ?? 0,
        outputTokens: row.totalOutputTokens ?? row.outputTokens ?? 0,
      });
    }
  }

  // Sort by cost descending so the most expensive lanes surface first;
  // lanes with no usage fall to the bottom in their original order.
  const sortedLanes = [...lanes].sort((a, b) => {
    const ua = usageByLane.get(a.name);
    const ub = usageByLane.get(b.name);
    return (ub?.cost ?? -1) - (ua?.cost ?? -1);
  });

  return (
    <Panel title="Lanes">
      <ul className="ch-dash-list">
        {sortedLanes.map((lane) => {
          const u = usageByLane.get(lane.name);
          return (
            <li key={lane.name} className="ch-dash-row">
              <span className="ch-dash-dot ch-dash-dot-blue" aria-hidden />
              <div className="ch-dash-row-main">
                <div className="ch-dash-row-title">{lane.name}</div>
                <div className="ch-dash-row-sub">
                  {lane.model}
                  {lane.allowModelOverride && (
                    <span className="ch-dash-tag">override</span>
                  )}
                </div>
                {lane.description && (
                  <div className="ch-dash-row-desc">{lane.description}</div>
                )}
              </div>
              {u && (
                <div className="ch-dash-row-stats">
                  <span className="ch-dash-row-stat-primary">{formatCost(u.cost)}</span>
                  <span className="ch-dash-row-stat-secondary">
                    {u.requests.toLocaleString()} req
                  </span>
                  {(u.inputTokens > 0 || u.outputTokens > 0) && (
                    <span className="ch-dash-row-stat-secondary">
                      {formatTokens(u.inputTokens)} in / {formatTokens(u.outputTokens)} out
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ProvidersPanel({ providers }) {
  if (!providers?.providers || providers.providers.length === 0) {
    return null;
  }

  return (
    <Panel title="Providers">
      <ul className="ch-dash-list">
        {providers.providers.map((p) => (
          <li key={p.id} className="ch-dash-row">
            <span
              className={`ch-dash-dot ${p.reachable ? "ch-dash-dot-emerald" : "ch-dash-dot-red"}`}
              aria-hidden
            />
            <div className="ch-dash-row-main">
              <div className="ch-dash-row-title">{p.label ?? p.id}</div>
              <div className="ch-dash-row-sub">
                {p.id} · {p.reachable ? "reachable" : "unreachable"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Panel({ title, children }) {
  return (
    <section className="ch-dash-panel">
      <h3 className="ch-dash-panel-title">{title}</h3>
      {children}
    </section>
  );
}

// -- Formatting helpers ---------------------------------------------------

function formatCost(cost) {
  if (typeof cost !== "number" || Number.isNaN(cost)) return "—";
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n) {
  if (typeof n !== "number" || Number.isNaN(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatUptime(seconds) {
  if (typeof seconds !== "number" || seconds <= 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatRelative(date) {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}
