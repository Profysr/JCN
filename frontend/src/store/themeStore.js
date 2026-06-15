import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";
import { ACCENT_COLORS, DENSITIES } from "@/lib/constants";
import { useAuthStore } from "@/store/authStore";

// Patch authStore.user in place so hydrateTheme() on next refresh
// doesn't overwrite themeStore with stale preferences.
function syncAuthUser(patch) {
  const { user, setUser } = useAuthStore.getState();
  if (user) setUser({ ...user, ...patch });
}

function applyTheme(theme, accent, density) {
  const root = document.documentElement;

  root.classList.remove("dark", "midnight");
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "midnight") root.classList.add("midnight");

  Object.keys(ACCENT_COLORS).forEach((a) => root.classList.remove(`accent-${a}`));
  root.classList.add(`accent-${accent}`);

  DENSITIES.forEach((d) => root.classList.remove(`density-${d.value}`));
  root.classList.add(`density-${density}`);
}

export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: "light",
      accent: "indigo",
      density: "comfortable",

      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme, get().accent, get().density);
        api.patch("/api/users/me/", { theme })
          .then(() => syncAuthUser({ theme }))
          .catch(() => {});
      },

      setAccent: (accent) => {
        set({ accent });
        applyTheme(get().theme, accent, get().density);
        api.patch("/api/users/me/", { accent_color: accent })
          .then(() => syncAuthUser({ accent_color: accent }))
          .catch(() => {});
      },

      setDensity: (density) => {
        set({ density });
        applyTheme(get().theme, get().accent, density);
        api.patch("/api/users/me/", { density_mode: density })
          .then(() => syncAuthUser({ density_mode: density }))
          .catch(() => {});
      },

      init: () => {
        const { theme, accent, density } = get();
        applyTheme(theme, accent, density);
      },

      // Apply server-provided preferences locally WITHOUT persisting them back.
      hydrate: (prefs = {}) => {
        const next = {
          theme: prefs.theme ?? get().theme,
          accent: prefs.accent_color ?? get().accent,
          density: prefs.density_mode ?? get().density,
        };
        set(next);
        applyTheme(next.theme, next.accent, next.density);
      },
    }),
    { name: "jcn-theme" },
  ),
);
