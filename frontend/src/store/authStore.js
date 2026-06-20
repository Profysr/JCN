import { create } from "zustand"; // Zustand is a lightweight, fast, and scalable state management library for React. Alternative to Redux, MobX, etc. It uses hooks and has a minimal API.
import { persist } from "zustand/middleware";
import api from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setTokens: (access, refresh) => {
        localStorage.setItem("access_token", access);
        if (refresh) localStorage.setItem("refresh_token", refresh);
        set({ accessToken: access, refreshToken: refresh });
      },

      setUser: (user) => set({ user }),

      login: async (email, password) => {
        queryClient.clear(); // Wipe previous user's cache before loading new session data
        const { data } = await api.post("/api/auth/login/", {
          email,
          password,
        });
        get().setTokens(data.access, data.refresh);
        set({ user: data.user });
        return data;
      },

      register: async (email, password1, password2, full_name) => {
        queryClient.clear();
        const { data } = await api.post("/api/auth/registration/", {
          email, password1, password2, full_name,
        });
        get().setTokens(data.access, data.refresh);
        set({ user: data.user });
        return data;
      },

      logout: async () => {
        // Grab the refresh token before we wipe storage
        const refresh =
          localStorage.getItem("refresh_token") ||
          localStorage.getItem("refreshToken");
        try {
          if (refresh) await api.post("/api/auth/logout/", { refresh });
        } catch {}

        // Wipe every known token/auth key — both naming conventions used across
        // api.js (snake_case) and Zustand persist (camelCase inside "auth" JSON)
        const STORAGE_KEYS = [
          "access_token", "refresh_token",   // api.js interceptor keys
          "accessToken",  "refreshToken",    // camelCase variants
          "auth",                            // Zustand persist root key — removes
        ];
        STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
        queryClient.clear();
        set({ user: null, accessToken: null, refreshToken: null });
      },

      googleLogin: async (accessToken) => {
        queryClient.clear();
        const { data } = await api.post("/api/auth/google/", {
          access_token: accessToken,
        });
        get().setTokens(data.access, data.refresh);
        set({ user: data.user });
        // Return pending invite token if one was stored before the OAuth redirect
        const pending = localStorage.getItem("pendingInvite");
        if (pending) localStorage.removeItem("pendingInvite");
        return { ...data, pendingInviteToken: pending || null };
      },

      fetchMe: async () => {
        const { data } = await api.get("/api/users/me/");
        set({ user: data });
        return data;
      },
    }),
    {
      name: "auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);
