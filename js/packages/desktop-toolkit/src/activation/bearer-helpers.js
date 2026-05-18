/**
 * Pure header-merging helper for activation bearer tokens.
 *
 * Split out of `bearer.js` so unit tests can import it without pulling
 * in the React / Tauri runtime dependencies of the main bearer module.
 *
 * @param {string} token -- raw bearer token (no `Bearer ` prefix)
 * @param {RequestInit} [init={}] -- baseline fetch init
 * @returns {RequestInit}
 */
export function buildBearerInit(token, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}
