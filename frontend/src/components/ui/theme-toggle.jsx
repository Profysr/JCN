import { useState } from "react";
import { Sun, Moon, Eclipse, Palette, AlignJustify, ChevronRight } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";
import { useThemeStore, ACCENT_COLORS, DENSITIES, THEMES } from "@/store/themeStore";

const THEME_ICONS = {
  light:    <Sun className="w-3.5 h-3.5" />,
  dark:     <Moon className="w-3.5 h-3.5" />,
  midnight: <Eclipse className="w-3.5 h-3.5" />,
};

const THEME_LABELS = { light: "Light", dark: "Dark", midnight: "Midnight" };
const DENSITY_LABELS = { comfortable: "Comfortable", compact: "Compact", cozy: "Cozy" };

export function ThemeToggle({ collapsed = false }) {
  const { theme, accent, density, setTheme, setAccent, setDensity } = useThemeStore();
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          title="Appearance"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-muted-foreground",
            "hover:bg-accent hover:text-foreground transition-colors active:scale-[0.97]",
            "w-full",
          )}
        >
          <Palette className="w-3.5 h-3.5 flex-shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Appearance</span>
              <ChevronRight className="w-3 h-3 opacity-50" />
            </>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="right"
          sideOffset={8}
          align="end"
          className={cn(
            "w-52 rounded-xl border bg-popover shadow-popover p-3 space-y-3",
            "animate-scale-in",
            "z-[200]"
          )}
        >
          {/* Theme */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-0.5">
              Theme
            </p>
            <div className="grid grid-cols-3 gap-1">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] font-medium",
                    "transition-colors active:scale-[0.97]",
                    theme === t
                      ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {THEME_ICONS[t]}
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-0.5">
              Accent
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(ACCENT_COLORS).map(([key, { hex }]) => (
                <button
                  key={key}
                  title={key}
                  onClick={() => setAccent(key)}
                  className={cn(
                    "w-5 h-5 rounded-full transition-transform active:scale-[0.97]",
                    accent === key
                      ? "ring-2 ring-offset-2 ring-offset-popover scale-110"
                      : "hover:scale-110"
                  )}
                  style={{
                    backgroundColor: hex,
                    ringColor: hex,
                    outlineColor: accent === key ? hex : undefined,
                    outline: accent === key ? `2px solid ${hex}` : undefined,
                    outlineOffset: accent === key ? "2px" : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Density */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-0.5">
              Density
            </p>
            <div className="space-y-0.5">
              {DENSITIES.map((d) => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium",
                    "transition-colors active:scale-[0.97]",
                    density === d
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {DENSITY_LABELS[d]}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
