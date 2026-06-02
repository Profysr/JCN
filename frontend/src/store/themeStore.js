import { create } from "zustand";
import { persist } from "zustand/middleware";
import api from "@/lib/api";

export const THEMES = ["light", "dark", "midnight"];
export const ACCENTS = ["indigo", "blue", "violet", "pink", "rose", "amber", "emerald", "cyan", "slate"];
export const DENSITIES = ["comfortable", "compact", "cozy"];

export const ACCENT_COLORS = {
  indigo:  { label: "Indigo",   hex: "#6366f1" },
  blue:    { label: "Blue",     hex: "#3b82f6" },
  violet:  { label: "Violet",   hex: "#8b5cf6" },
  pink:    { label: "Pink",     hex: "#ec4899" },
  rose:    { label: "Rose",     hex: "#f43f5e" },
  amber:   { label: "Amber",    hex: "#f59e0b" },
  emerald: { label: "Emerald",  hex: "#10b981" },
  cyan:    { label: "Cyan",     hex: "#06b6d4" },
  slate:   { label: "Slate",    hex: "#64748b" },
};

function applyTheme(theme, accent, density) {
  const root = document.documentElement;

  // Remove theme classes
  root.classList.remove("dark", "midnight");
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "midnight") root.classList.add("midnight");

  // Remove accent classes
  ACCENTS.forEach((a) => root.classList.remove(`accent-${a}`));
  root.classList.add(`accent-${accent}`);

  // Remove density classes
  DENSITIES.forEach((d) => root.classList.remove(`density-${d}`));
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
        api.patch("/api/users/me/", { theme }).catch(() => {});
      },

      setAccent: (accent) => {
        set({ accent });
        applyTheme(get().theme, accent, get().density);
        api.patch("/api/users/me/", { accent_color: accent }).catch(() => {});
      },

      setDensity: (density) => {
        set({ density });
        applyTheme(get().theme, get().accent, density);
        api.patch("/api/users/me/", { density_mode: density }).catch(() => {});
      },

      init: () => {
        const { theme, accent, density } = get();
        applyTheme(theme, accent, density);
      },
    }),
    { name: "jcn-theme" }
  )
);
