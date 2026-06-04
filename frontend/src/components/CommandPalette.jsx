import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, CheckSquare, ArrowRight, Loader2, Hash, Clock, Plus, UserPlus,
} from "lucide-react";
import api from "@/lib/api";
import { NAV_ITEMS, workspaceUrl } from "@/lib/navLinks";
import { cn } from "@/lib/utils";

import { getPriority } from "@/lib/constants";
const PRIORITY_COLOR = Object.fromEntries(
  ["urgent","high","medium","low","no_priority"].map(v => [v, getPriority(v).textCls])
);

// ── Recently viewed (localStorage) ────────────────────────────────────────────
const RV_KEY = "jcn_recently_viewed";
const MAX_RV = 8;

export function trackRecentlyViewed(item) {
  // item: { type: "task"|"project"|"page", id, title, url }
  try {
    const list = JSON.parse(localStorage.getItem(RV_KEY) || "[]");
    const filtered = list.filter(i => !(i.type === item.type && i.id === item.id));
    filtered.unshift(item);
    localStorage.setItem(RV_KEY, JSON.stringify(filtered.slice(0, MAX_RV)));
  } catch {}
}

function getRecentlyViewed() {
  try { return JSON.parse(localStorage.getItem(RV_KEY) || "[]"); } catch { return []; }
}

// ── Query shortcuts parser ────────────────────────────────────────────────────
// Returns { cleanQuery, filters: { type, assignee, priority, special } }
function parseShortcuts(raw) {
  const tokens = raw.split(/\s+/).filter(Boolean);
  const filters = {};
  const rest    = [];

  for (const tok of tokens) {
    if (tok.startsWith("#"))       filters.type     = tok.slice(1);
    else if (tok.startsWith("@"))  filters.assignee = tok.slice(1);
    else if (tok.startsWith("!"))  filters.priority = tok.slice(1);
    else if (tok.startsWith(">"))  filters.special  = tok.slice(1); // "overdue", "today"
    else                           rest.push(tok);
  }
  return { cleanQuery: rest.join(" "), filters };
}

// All shortcut filters are now applied server-side via query params.
// This function is kept only as a safety net — the server already
// pre-filters results, so this is a no-op in normal usage.
function applyShortcutFilters(tasks) {
  return tasks;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery]         = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const workspaceSlug = location.pathname.match(/\/w\/([^/]+)/)?.[1];

  // Parse shortcuts from raw query
  const { cleanQuery, filters: shortcutFilters } = useMemo(() => parseShortcuts(query), [query]);

  const [results, setResults]       = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const abortRef = useRef(null);

  // Fire a new search whenever the parsed query or shortcut filters change.
  // Each run aborts the previous in-flight request via AbortController.
  useEffect(() => {
    const hasTextQuery = cleanQuery.trim().length >= 2;
    const hasShortcuts = Object.keys(shortcutFilters).length > 0;

    if (!hasTextQuery && !hasShortcuts) {
      if (abortRef.current) abortRef.current.abort();
      setResults(null);
      setIsFetching(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = new URLSearchParams();
    if (cleanQuery.trim())                      params.set("q",         cleanQuery.trim());
    if (shortcutFilters.type)                   params.set("task_type", shortcutFilters.type);
    if (shortcutFilters.assignee)               params.set("assignee",  shortcutFilters.assignee);
    if (shortcutFilters.priority)               params.set("priority",  shortcutFilters.priority);
    if (shortcutFilters.special === "overdue")  params.set("overdue",   "true");
    if (shortcutFilters.special === "today")    params.set("today",     "true");

    setIsFetching(true);
    api.get(`/api/search/?${params.toString()}`, { signal: controller.signal })
      .then((r) => { setResults(r.data); setIsFetching(false); })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          setResults(null);
          setIsFetching(false);
        }
        // Aborted — a newer request is already in flight, don't touch state
      });
  }, [cleanQuery, shortcutFilters.type, shortcutFilters.assignee, shortcutFilters.priority, shortcutFilters.special]);

  // Abort pending request when palette closes or component unmounts
  useEffect(() => {
    if (!open && abortRef.current) { abortRef.current.abort(); setResults(null); setIsFetching(false); }
  }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);
  const recentlyViewed = useMemo(() => open ? getRecentlyViewed() : [], [open]);

  // Quick actions
  const quickActions = useMemo(() => {
    if (!workspaceSlug) return [];
    return [
      { type: "action", icon: Plus,    label: "Create task",    desc: "New task in current project",  action: () => {}, hotkey: "C" },
      { type: "action", icon: Hash,    label: "Create project", desc: "New project in workspace",      action: () => navigate(`/w/${workspaceSlug}/projects`), hotkey: "P" },
      { type: "action", icon: UserPlus,label: "Invite member",  desc: "Add someone to this workspace", action: () => navigate(`/w/${workspaceSlug}/members`), hotkey: "I" },
    ];
  }, [workspaceSlug, navigate]);

  // Navigation links — derived from the same NAV_ITEMS used by AppLayout
  const navLinks = useMemo(() => {
    if (!workspaceSlug) return [];
    return NAV_ITEMS.map(item => ({
      type:   "nav",
      icon:   item.icon,
      label:  item.label,
      desc:   item.desc,
      action: () => navigate(workspaceUrl(workspaceSlug, item.path)),
    }));
  }, [workspaceSlug, navigate]);

  const sections = useMemo(() => {
    const q = query.trim();
    const hasShortcuts = Object.keys(shortcutFilters).length > 0;
    const hasTextQuery = cleanQuery.length >= 2;

    // No input: show recently viewed + quick actions + navigation
    if (!q) {
      const rv = recentlyViewed.map(item => ({
        type: "recent",
        icon: item.type === "task" ? CheckSquare : item.type === "project" ? Hash : Clock,
        label: item.title,
        desc: item.type,
        action: () => navigate(item.url),
      }));
      return [
        rv.length     > 0 && { title: "Recent",       items: rv            },
        quickActions.length > 0 && { title: "Quick Actions", items: quickActions },
        navLinks.length > 0 && { title: "Navigation",  items: navLinks      },
      ].filter(Boolean);
    }

    if (!hasTextQuery && !hasShortcuts) return [{ title: "Navigation", items: navLinks }];

    // Build task items — raw results from the API
    let taskItems = (results?.tasks || []).map(t => ({
      type: "task", icon: CheckSquare,
      label: t.title,
      meta: `${t.project_name} · ${t.status_name || "No status"}`,
      priority: t.priority,
      // keep all raw fields for shortcut filtering
      task_type:     t.task_type,
      assignee_name: t.assignee_name,
      due_date:      t.due_date,
      action: () => navigate(`/w/${t.workspace_slug}/projects/${t.project_id}?task=${t.id}`),
    }));

    // Apply shortcut filters client-side
    if (hasShortcuts) {
      taskItems = applyShortcutFilters(taskItems, shortcutFilters);
    }

    const projectItems = (results?.projects || []).map(p => ({
      type: "project", icon: Hash,
      label: p.name,
      meta: p.workspace_name,
      action: () => navigate(`/w/${p.workspace_slug}/projects`),
    }));

    return [
      taskItems.length    > 0 && { title: "Tasks",    items: taskItems    },
      projectItems.length > 0 && { title: "Projects", items: projectItems },
    ].filter(Boolean);
  }, [query, cleanQuery, shortcutFilters, results, isFetching, recentlyViewed, quickActions, navLinks, navigate]);

  const flatItems = useMemo(() => sections.flatMap(s => s.items), [sections]);

  // Hint bar: show active shortcuts
  const hintText = useMemo(() => {
    if (shortcutFilters.type)     return `Filtering by type: #${shortcutFilters.type}`;
    if (shortcutFilters.priority) return `Filtering by priority: !${shortcutFilters.priority}`;
    if (shortcutFilters.assignee) return `Filtering by assignee: @${shortcutFilters.assignee}`;
    if (shortcutFilters.special === "overdue") return "Showing overdue tasks";
    if (shortcutFilters.special === "today")   return "Showing tasks due today";
    return null;
  }, [shortcutFilters]);

  // Reset when opened
  useEffect(() => {
    if (open) { setQuery(""); setSelectedIndex(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => { setSelectedIndex(0); }, [sections]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback((item) => { item.action(); onClose(); }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); }
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
        className="relative w-full max-w-xl mx-4 bg-card border rounded-md shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ maxHeight: "min(600px, 80vh)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b flex-shrink-0">
          {isFetching && (cleanQuery.trim().length >= 2 || Object.keys(shortcutFilters).length > 0)
            ? <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
            : <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search, or try #bug  @name  !urgent  >overdue"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border leading-none">Esc</kbd>
        </div>

        {/* Active filter hint */}
        {hintText && (
          <div className="px-4 py-1.5 bg-primary/5 border-b text-[11px] text-primary font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {hintText}
            <button onClick={() => setQuery(cleanQuery)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
              Clear filter
            </button>
          </div>
        )}

        {/* Shortcut legend (shown when no query) */}
        {!query.trim() && (
          <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/20 flex-shrink-0">
            {[["#bug", "Filter type"], ["@name", "By assignee"], ["!urgent", "By priority"], [">overdue", "Overdue"]].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setQuery(key + " "); inputRef.current?.focus(); }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono text-[10px]">{key}</kbd>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {(cleanQuery.trim().length >= 2 || Object.keys(shortcutFilters).length > 0) && !isFetching && flatItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No results for <span className="font-medium text-foreground">"{cleanQuery}"</span></p>
              <p className="text-xs text-muted-foreground mt-1">Try searching by task title, description, or project name</p>
            </div>
          ) : (
            sections.map(section => (
              <div key={section.title}>
                <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </p>
                {section.items.map(item => {
                  const idx    = globalIdx++;
                  const Icon   = item.icon;
                  const isSel  = selectedIndex === idx;
                  return (
                    <button
                      key={idx}
                      data-index={idx}
                      onClick={() => execute(item)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isSel ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <Icon className={cn(
                        "w-4 h-4 flex-shrink-0",
                        item.type === "task"    ? (PRIORITY_COLOR[item.priority] || "text-primary") :
                        item.type === "project" ? "text-primary" :
                        item.type === "action"  ? "text-emerald-500" :
                        "text-muted-foreground",
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        {(item.meta || item.desc) && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.meta || item.desc}</p>
                        )}
                      </div>
                      {item.hotkey && (
                        <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1 py-0.5">{item.hotkey}</kbd>
                      )}
                      {isSel && !item.hotkey && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
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
            <span className="flex items-center gap-1"><Kbd>↑↓</Kbd> Navigate</span>
            <span className="flex items-center gap-1"><Kbd>↵</Kbd> Open</span>
            <span className="flex items-center gap-1"><Kbd>Esc</Kbd> Close</span>
          </div>
          <span className="text-[11px] text-muted-foreground"><Kbd>⌘ + K</Kbd></span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="bg-muted border border-border rounded px-1 py-0.5 text-[10px] leading-none font-mono">{children}</kbd>
  );
}
