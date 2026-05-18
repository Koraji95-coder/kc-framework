import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { DashboardOverview } from "@chamber-19/desktop-toolkit/dashboard";

/**
 * Standalone dev preview for <DashboardOverview>. Lets the toolkit
 * developer iterate on the component without booting launcher.
 *
 * Configure broker URL + API key via the controls in the header. Both
 * persist to localStorage so a reload picks up the last values.
 */
function App() {
  const [brokerUrl, setBrokerUrl] = useState(
    () => localStorage.getItem("dashboard-preview.brokerUrl") || "http://127.0.0.1:57420",
  );
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("dashboard-preview.apiKey") || "",
  );

  function update(field, value, setter) {
    setter(value);
    localStorage.setItem(`dashboard-preview.${field}`, value);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "10px 16px",
          background: "#0d0d0f",
          borderBottom: "1px solid #27272a",
          fontFamily: "monospace",
          fontSize: 12,
        }}
      >
        <span style={{ color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 11 }}>
          Dashboard Preview
        </span>
        <input
          type="text"
          value={brokerUrl}
          onChange={(e) => update("brokerUrl", e.target.value, setBrokerUrl)}
          placeholder="http://127.0.0.1:57420"
          style={{
            flex: 1,
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 4,
            padding: "4px 8px",
            color: "#fafafa",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        />
        <input
          type="text"
          value={apiKey}
          onChange={(e) => update("apiKey", e.target.value, setApiKey)}
          placeholder="X-Foundry-Api-Key (optional)"
          style={{
            flex: 1,
            background: "#18181b",
            border: "1px solid #27272a",
            borderRadius: 4,
            padding: "4px 8px",
            color: "#fafafa",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <DashboardOverview brokerUrl={brokerUrl} apiKey={apiKey || undefined} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);