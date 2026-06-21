import axios from "axios";
import { BACKEND_URL } from "@/shared/lib/env";

// Instead of typing your complete backend URL (like https://api.myapp.com/api/...) every time you make a request, you create a custom instance called api. Now, you can just write api.get('/users'), and Axios automatically prepends your BACKEND_URL
const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { "Content-Type": "application/json" },
});

// validating token existence on every request and attaching it to the Authorization header if found. This way, you don't have to manually add the token to each request — it's handled globally by the interceptor.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Let axios set multipart/form-data (with boundary) automatically for FormData payloads
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res, // if the response is successful, just return it
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem("refresh_token");
      if (refresh) {
        try {
          const { data } = await axios.post(
            `${BACKEND_URL}/api/auth/token/refresh/`,
            { refresh },
          );
          localStorage.setItem("access_token", data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch {
          // Wipe all token storage variants before forcing re-login
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
    }
    return Promise.reject(error);
  },
);

export default api;
