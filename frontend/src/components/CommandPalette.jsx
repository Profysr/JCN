import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, LayoutDashboard, FolderKanban, Users, Settings,
  CheckSquare, ArrowRight, Loader2, Hash,
} from "lucide-react";
import { useSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";

const PRIORITY_COLOR = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-400",
  no_priority: "text-muted-foreground",
};

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const { data: results, isFetching } = useSearch(query);

  // Extract current workspace from URL
  const workspaceSlug = location.pathname.match(/\/w\/([^/]+)/)?.[1];

  const quickLinks = useMemo(() => {
    if (!workspaceSlug) return [];
    return [
      { type: "nav", icon: LayoutDashboard, label: "Dashboard",         desc: "Workspace overview",      action: () => navigate(`/w/${workspaceSlug}`) },
      { type: "nav", icon: FolderKanban,    label: "Projects",           desc: "All projects",            action: () => navigate(`/w/${workspaceSlug}/projects`) },
      { type: "nav", icon: Users,           label: "Members",            desc: "Manage team members",     action: () => navigate(`/w/${workspaceSlug}/members`) },
      { type: "nav", icon: Settings,        label: "Settings",           desc: "Workspace settings",      action: () => navigate(`/w/${workspaceSlug}/settings`) },
    ];
  }, [workspaceSlug, navigate]);

  const sections = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) {
      return [{ title: "Navigation", items: quickLinks }];
    }
    const taskItems = (results?.tasks || []).map((t) => ({
      type: "task",
      icon: CheckSquare,
      label: t.title,
      meta: `${t.project_name} · ${t.status_name || "No status"}`,
      priority: t.priority,
      action: () => navigate(`/w/${t.workspace_slug}/projects/${t.project_id}?task=${t.id}`),
    }));
    const projectItems = (results?.projects || []).map((p) => ({
      type: "project",
      icon: Hash,
      label: p.name,
      meta: p.workspace_name,
      action: () => navigate(`/w/${p.workspace_slug}/projects`),
    }));
    return [
      taskItems.length    > 0 && { title: "Tasks",    items: taskItems },
      projectItems.length > 0 && { title: "Projects", items: projectItems },
    ].filter(Boolean);
  }, [query, results, quickLinks, navigate]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Reset selected index when results change
  useEffect(() => { setSelectedIndex(0); }, [sections]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback((item) => {
    item.action();
    onClose();
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && flatItems[selectedIndex]) { e.preventDefault(); execute(flatItems[selectedIndex]); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatItems, selectedIndex, execute, onClose]);

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 bg-card border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ maxHeight: "min(580px, 80vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b flex-shrink-0">
          {isFetching && query.trim().length >= 2
            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            : <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          }
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search tasks, projects… or jump to a page"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border leading-none">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {query.trim().length >= 2 && !isFetching && flatItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No results for <span className="font-medium text-foreground">"{query}"</span></p>
              <p className="text-xs text-muted-foreground mt-1">Try searching by task title or project name</p>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </p>
                {section.items.map((item) => {
                  const idx = globalIdx++;
                  const Icon = item.icon;
                  const isSelected = selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      data-index={idx}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isSelected ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <Icon className={cn(
                        "w-4 h-4 flex-shrink-0",
                        item.type === "task"    ? (PRIORITY_COLOR[item.priority] || "text-primary") :
                        item.type === "project" ? "text-primary" :
                        "text-muted-foreground"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {(item.meta || item.desc) && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {item.meta || item.desc}
                          </p>
                        )}
                      </div>
                      {isSelected && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd>↑↓</Kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> Open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Kbd>⌘K</Kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] leading-none font-mono">
      {children}
    </kbd>
  );
}
