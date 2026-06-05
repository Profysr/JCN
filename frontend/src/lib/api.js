import axios from "axios";
import { BACKEND_URL } from "@/lib/env";

const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${BACKEND_URL}/api/auth/token/refresh/`,
            { refresh }
          );
          localStorage.setItem("access_token", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          // Wipe all token storage variants before forcing re-login
          ["access_token", "refresh_token", "accessToken", "refreshToken", "auth"]
            .forEach((k) => localStorage.removeItem(k));
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
