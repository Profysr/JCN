import axios from "axios";
import { BACKEND_URL } from "@/shared/lib/env";

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Let axios set multipart/form-data (with boundary) automatically for FormData payloads
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

/**
 * Normalize a DRF error body into a single human-readable string.
 * Handles: { detail }, { non_field_errors }, { field: [msg] }, plain strings.
 */
function extractApiMessage(data) {
  if (!data) return "Something went wrong. Please try again.";
  if (typeof data === "string") return data;
  if (data.detail) return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
  if (Array.isArray(data.non_field_errors) && data.non_field_errors.length)
    return data.non_field_errors[0];
  // Field-level errors — return the first message found
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && val.length) return val[0];
  }
  return "Something went wrong. Please try again.";
}

// Shared across every failed request so N concurrent 401s (e.g. on page
// refresh, where several queries fire at once) trigger exactly one
// /token/refresh/ call — the rest await this same promise instead of each
// racing their own.
let refreshPromise = null;

function refreshAccessToken() {
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return Promise.reject(new Error("No refresh token"));
  return axios
    .post(`${BACKEND_URL}/api/auth/token/refresh/`, { refresh })
    .then(({ data }) => {
      localStorage.setItem("access_token", data.access);
      return data.access;
    });
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const access = await refreshPromise;
        original.headers.Authorization = `Bearer ${access}`;
        return api(original);
      } catch {
        [
          "access_token",
          "refresh_token",
          "accessToken",
          "refreshToken",
          "auth",
        ].forEach((k) => localStorage.removeItem(k));
        window.location.href = "/login";
      }
    }

    // Normalize error surface — use these instead of reaching into response.data manually:
    //   err.message → human-readable string (handles all DRF error shapes)
    //   err.data    → raw response body (for field-level form validation)
    error.message = extractApiMessage(error.response?.data);
    error.data = error.response?.data ?? {};
    return Promise.reject(error);
  },
);

export default api;
