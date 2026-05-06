/**
 * ActivationGate.jsx — Full-screen PIN entry gate.
 *
 * Drop around the app root in any consumer:
 *
 *   import { ActivationGate } from '@chamber-19/desktop-toolkit/activation';
 *
 *   <ActivationGate>
 *     <App />
 *   </ActivationGate>
 *
 * Renders a full-screen PIN form when the machine is not activated.
 * Renders children once activation succeeds.
 * Shows a dismissible warning banner when within 5 days of expiry.
 *
 * No external dependencies beyond React and @tauri-apps/api (peer dep).
 */

import { useState, useCallback } from "react";
import { useActivation } from "./useActivation.js";
import "./activation.css";

const isTauri =
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

// ── Anvil SVG (inline, no external asset dep) ─────────────────────────────
function AnvilMark({ className }) {
  return (
    <svg
      className={className}
      viewBox="72 104 374 380"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Chamber 19 mark"
    >
      <rect x="86"  y="104" width="340" height="86"  rx="10" fill="#C4884D" />
      <rect x="226" y="190" width="60"  height="170"         fill="#C4884D" />
      <path d="M 72,360 H 412 L 446,374 L 446,396 L 412,410 H 72 Z"        fill="#C4884D" />
      <rect x="98"  y="410" width="316" height="14"          fill="#C4884D" />
      <path d="M 196,424 H 316 L 304,452 H 208 Z"                          fill="#C4884D" />
      <rect x="128" y="452" width="256" height="32"  rx="4"  fill="#C4884D" />
    </svg>
  );
}

// ── PIN form ──────────────────────────────────────────────────────────────
function PinForm({ onSuccess }) {
  const [pin, setPin]       = useState("");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(null);
  const { activate }        = useActivation();

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      if (!pin.trim()) return;
      setError(null);
      setBusy(true);
      try {
        const result = await activate(pin.trim());
        if (result?.valid) {
          onSuccess(result);
        } else {
          setError("Activation failed. Check your PIN and try again.");
        }
      } catch (err) {
        const msg = typeof err === "string" ? err : (err?.message ?? String(err));
        setError(msg || "Activation failed. Check your PIN and try again.");
      } finally {
        setBusy(false);
      }
    },
    [pin, activate, onSuccess]
  );

  return (
    <div className="activation-root">
      <AnvilMark className="activation-logo" />

      <div className="activation-card">
        <h1 className="activation-heading">Activate your licence</h1>
        <p className="activation-subtext">
          Enter the PIN issued to you by your administrator. The PIN is verified
          once and cached locally — no network call is needed after first activation.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "contents" }}>
          <label className="activation-input-label">
            <span>Licence PIN</span>
            <input
              className="activation-input"
              type="text"
              value={pin}
              onChange={(e) => setPin(e.target.value.toUpperCase())}
              placeholder="R3P-XXXX-XXXX"
              autoComplete="off"
              autoFocus
              disabled={busy}
              spellCheck={false}
            />
          </label>

          {error && <div className="activation-error">{error}</div>}

          <button className="activation-btn" type="submit" disabled={busy || !pin.trim()}>
            {busy ? (
              <>
                <span className="activation-spinner" aria-hidden="true" />
                Verifying…
              </>
            ) : (
              "Activate"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Warning banner ────────────────────────────────────────────────────────
function ExpiryWarning({ daysRemaining }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="activation-warning-banner" role="alert" style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 9998, maxWidth: 420, width: "calc(100% - 32px)" }}>
      <span>⚠</span>
      <span style={{ flex: 1 }}>
        Your activation expires in {daysRemaining} day{daysRemaining !== 1 ? "s" : ""}.
        Contact your administrator to renew your PIN.
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: "0 4px", opacity: 0.6 }}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

// ── Gate ──────────────────────────────────────────────────────────────────
export function ActivationGate({ children }) {
  const { activated, checking, warning, daysRemaining, recheck } = useActivation();

  // Non-Tauri context: always pass through (Vite dev, Storybook, etc.)
  if (!isTauri) return children;

  if (checking) {
    // Blank screen while we read the token — prevents a flash of the PIN form
    // on already-activated machines.
    return <div className="activation-root" aria-label="Loading…" />;
  }

  if (!activated) {
    return <PinForm onSuccess={recheck} />;
  }

  return (
    <>
      {warning && <ExpiryWarning daysRemaining={daysRemaining} />}
      {children}
    </>
  );
}
