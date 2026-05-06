/**
 * useActivation.js — React hook for activation state.
 *
 * Exposes { activated, checking, warning, daysRemaining, result, activate, deactivate }
 * for use in settings panels or anywhere that needs to read or change activation state.
 *
 * isTauri guard: all IPC calls are no-ops in a plain browser so the hook is
 * safe to render during Vite dev without Tauri present.
 */

import { useState, useEffect, useCallback } from "react";

const isTauri =
  typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);

async function invokeIfTauri(cmd, args) {
  if (!isTauri) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke(cmd, args);
  } catch (e) {
    throw e;
  }
}

export function useActivation() {
  const [checking, setChecking] = useState(true);
  const [activated, setActivated] = useState(false);
  const [warning, setWarning] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState(null);
  const [result, setResult] = useState(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      const status = await invokeIfTauri("toolkit_activation_status");
      if (status) {
        setActivated(status.valid);
        setWarning(status.warning);
        setDaysRemaining(status.days_remaining);
        setResult(status);
      } else {
        // Non-Tauri context: treat as activated for dev convenience.
        setActivated(true);
      }
    } catch {
      setActivated(false);
      setResult(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activate = useCallback(async (pin) => {
    const res = await invokeIfTauri("toolkit_activate_with_pin", { pin });
    if (res) {
      setActivated(res.valid);
      setWarning(res.warning);
      setDaysRemaining(res.days_remaining);
      setResult(res);
    }
    return res;
  }, []);

  const deactivate = useCallback(async () => {
    await invokeIfTauri("toolkit_deactivate");
    setActivated(false);
    setWarning(false);
    setDaysRemaining(null);
    setResult(null);
  }, []);

  return { activated, checking, warning, daysRemaining, result, activate, deactivate, recheck: refresh };
}
