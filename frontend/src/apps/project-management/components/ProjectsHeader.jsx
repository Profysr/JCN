import { Search } from "lucide-react";

/**
 * Header for the Project Management app. Owns the search / command-palette
 * trigger that used to live in the generic Sidebar — Sidebar is shared by
 * every app and shouldn't assume every app wants a search bar there.
 *
 * Dispatches "jcn:open-palette", handled by AppLayout (same command palette
 * instance ⌘K already opens).
 */
export default function ProjectsHeader() {
  return (
    <header className="flex-shrink-0 border-b border-border/40 px-4 py-2 flex items-center gap-3">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jcn:open-palette"))}
        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground bg-background border border-border/70 hover:border-border hover:text-foreground shadow-sm transition-all active:scale-[0.98] w-full max-w-sm"
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="text-[10px] font-semibold bg-muted border border-border rounded px-1 py-0.5 leading-none font-mono">
          ⌘ + K
        </kbd>
      </button>
    </header>
  );
}
