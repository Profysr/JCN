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
    <header className="flex-shrink-0 border-b border-border bg-background backdrop-blur-sm px-4 py-2.5 flex items-center">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("jcn:open-palette"))}
        className="group flex items-center gap-2.5 rounded-sm pl-4 pr-2 py-2 text-sm text-muted-foreground bg-muted/40 hover:bg-muted/70 border border-border/40 hover:border-border shadow-sm hover:shadow transition-all duration-150 active:scale-[0.98] w-full max-w-md"
      >
        <Search className="w-4 h-4 flex-shrink-0 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
        <span className="flex-1 text-left truncate">Search boards, tasks, people…</span>
        <kbd className="text-[10px] font-semibold bg-background border border-border/70 rounded-md px-1.5 py-1 leading-none font-mono text-muted-foreground/80 group-hover:text-foreground transition-colors">
          ⌘ + K
        </kbd>
      </button>
    </header>
  );
}
