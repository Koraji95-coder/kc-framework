/**
 * Short-lived bearer-token helpers for backend HTTP auth.
 *
 * The toolkit's Rust `toolkit_get_bearer_token` Tauri command issues a
 * compact HMAC-signed token of the shape
 * `v1.{machine_id}.{minute_ts}.{base64-hmac}`.  Consumers attach the
 * returned string as `Authorization: Bearer <token>` on outbound fetches;
 * backends verify with the matching Python helper
 * `chamber19_desktop_toolkit.auth.verify_toolkit_bearer`.
 *
 * Token TTL is ~60 seconds. Always fetch a fresh token per request rather
 * than caching the result -- the Rust side is cheap (single HMAC) and the
 * verifier window is small.
 *
 * Usage (vanilla fetch):
 *
 * ```js
 * import { withToolkitBearer } from "@chamber-19/desktop-toolkit/activation/bearer";
 * const init = await withToolkitBearer({ method: "POST", body: ... });
 * const res = await fetch("/api/secret", init);
 * ```
 *
 * Usage (React hook):
 *
 * ```jsx
 * import { useToolkitBearer } from "@chamber-19/desktop-toolkit/activation/bearer";
 * const getBearer = useToolkitBearer();
 * const token = await getBearer();  // fresh per call
 * ```
 */

import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Fetch a fresh bearer token from the toolkit.  Resolves with the raw token
 * string (no `Bearer ` prefix).  Rejects if the user is not activated, the
 * local activation token is tampered, machine-bound to a different host,
 * or expired.
 *
 * @returns {Promise<string>}
 */
export async function getToolkitBearer() {
  return await invoke("toolkit_get_bearer_token");
}

/**
 * React hook returning a stable callback that fetches a fresh bearer token.
 * Stable identity makes it safe to include in useEffect / useCallback
 * dependency arrays.
 *
 * @returns {() => Promise<string>}
 */
export function useToolkitBearer() {
  return useCallback(getToolkitBearer, []);
}

/**
 * Wrap a `fetch` init object so the resulting request carries a fresh
 * `Authorization: Bearer <toolkit-bearer>` header.  Preserves any other
 * headers on the input init.  Throws if the toolkit refuses to issue a
 * bearer (typically because the user is not activated).
 *
 * @param {RequestInit} [init={}] -- baseline fetch init
 * @returns {Promise<RequestInit>}
 */
export async function withToolkitBearer(init = {}) {
  const token = await getToolkitBearer();
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}