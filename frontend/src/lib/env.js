/**
 * Central environment config — import from here, never access import.meta.env directly.
 * To change a value: edit frontend/.env (or frontend/.env.production).
 */

/** Django backend origin — used for all API calls. */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
export const FRONTEND_URL = import.meta.env.VITE_FRONTEND_URL;

/** WebSocket origin — auto-derived from BACKEND_URL (http→ws, https→wss). */
export const BACKEND_WS_URL = BACKEND_URL.replace(/^http/, "ws");
