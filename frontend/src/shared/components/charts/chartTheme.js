// Resolves Tailwind CSS variables to actual color strings usable by Canvas.
// Called each render — getComputedStyle on documentElement has no layout cost.
export function chartColors() {
  const s = getComputedStyle(document.documentElement);
  const h = (v) => `hsl(${s.getPropertyValue(v).trim()})`;
  const ha = (v, a) => `hsl(${s.getPropertyValue(v).trim()} / ${a})`;
  return {
    primary:         h('--primary'),
    border:          h('--border'),
    grid:            ha('--border', 0.45),
    muted:           h('--muted'),
    mutedForeground: h('--muted-foreground'),
    popover:         h('--popover'),
    foreground:      h('--foreground'),
    card:            h('--card'),
  };
}

// Convert a #rrggbb hex color to rgba with alpha.
export function hexAlpha(hex, a) {
  if (!hex?.startsWith('#')) return `rgba(99,102,241,${a})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
