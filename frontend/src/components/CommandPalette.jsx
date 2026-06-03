import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Search, LayoutDashboard, FolderKanban, Users, Settings, Map, BarChart2,
  CheckSquare, ArrowRight, Loader2, Hash, Clock, Plus, UserPlus,
} from "lucide-react";
import { useSearch } from "@/hooks/useSearch";
import { cn } from "@/lib/utils";

const PRIORITY_COLOR = {
  urgent: "text-red-500", high: "text-orange-500", medium: "text-yellow-500",
  low: "text-blue-400",   no_priority: "text-muted-foreground",
};

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

function applyShortcutFilters(tasks, filters) {
  let result = tasks;
  if (filters.type)     result = result.filter(t => t.task_type?.toLowerCase().includes(filters.type.toLowerCase()));
  if (filters.priority) result = result.filter(t => t.priority?.toLowerCase().includes(filters.priority.toLowerCase()));
  if (filters.assignee) result = result.filter(t =>
    (t.assignee_name || "").toLowerCase().includes(filters.assignee.toLowerCase()),
  );
  if (filters.special === "overdue") {
    const today = new Date().toISOString().slice(0, 10);
    result = result.filter(t => t.due_date && t.due_date < today);
  }
  if (filters.special === "today") {
    const today = new Date().toISOString().slice(0, 10);
    result = result.filter(t => t.due_date === today);
  }
  return result;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [query,         setQuery]         = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef  = useRef(null);

  const workspaceSlug = location.pathname.match(/\/w\/([^/]+)/)?.[1];

  // Parse shortcuts from raw query
  const { cleanQuery, filters: shortcutFilters } = useMemo(() => parseShortcuts(query), [query]);

  // Search against actual text (without shortcut tokens)
  const { data: results, isFetching } = useSearch(cleanQuery || (Object.keys(shortcutFilters).length ? " " : ""));

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

  // Navigation links
  const navLinks = useMemo(() => {
    if (!workspaceSlug) return [];
    return [
      { type: "nav", icon: LayoutDashboard, label: "Dashboard",  desc: "Workspace overview",       action: () => navigate(`/w/${workspaceSlug}`) },
      { type: "nav", icon: FolderKanban,    label: "Projects",   desc: "All projects",             action: () => navigate(`/w/${workspaceSlug}/projects`) },
      { type: "nav", icon: Map,             label: "Roadmap",    desc: "Sprint timeline",          action: () => navigate(`/w/${workspaceSlug}/roadmap`) },
      { type: "nav", icon: BarChart2,       label: "Analytics",  desc: "Team & project metrics",   action: () => navigate(`/w/${workspaceSlug}/analytics`) },
      { type: "nav", icon: Users,           label: "Members",    desc: "Manage team members",      action: () => navigate(`/w/${workspaceSlug}/members`) },
      { type: "nav", icon: Settings,        label: "Settings",   desc: "Workspace settings",       action: () => navigate(`/w/${workspaceSlug}/settings`) },
    ];
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

    // Shortcut-only (e.g. "#bug" with no text) — show hint
    if (hasShortcuts && !hasTextQuery && !isFetching) {
      const hint = [
        shortcutFilters.type     && `type: ${shortcutFilters.type}`,
        shortcutFilters.assignee && `assignee: @${shortcutFilters.assignee}`,
        shortcutFilters.priority && `priority: !${shortcutFilters.priority}`,
        shortcutFilters.special  && `filter: >${shortcutFilters.special}`,
      ].filter(Boolean).join(", ");
      return [{ title: `Filters active — ${hint}`, items: navLinks }];
    }

    if (!hasTextQuery && !hasShortcuts) return [{ title: "Navigation", items: navLinks }];

    // Search results with shortcut filtering
    let taskItems = (results?.tasks || []).map(t => ({
      type: "task", icon: CheckSquare,
      label: t.title,
      meta: `${t.project_name} · ${t.status_name || "No status"}`,
      priority: t.priority,
      action: () => navigate(`/w/${t.workspace_slug}/projects/${t.project_id}?task=${t.id}`),
      raw: t,
    }));

    if (hasShortcuts) taskItems = applyShortcutFilters(taskItems.map(i => ({ ...i, ...i.raw })), shortcutFilters).map(t => ({
      type: "task", icon: CheckSquare,
      label: t.title || t.label,
      meta: t.meta || `${t.project_name} · ${t.status_name || ""}`,
      priority: t.priority,
      action: t.action || (() => navigate(`/w/${t.workspace_slug}/projects/${t.project_id}?task=${t.id}`)),
    }));

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
        className="relative w-full max-w-xl mx-4 bg-card border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ maxHeight: "min(600px, 80vh)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b flex-shrink-0">
          {isFetching && cleanQuery.length >= 2
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
            {[["#type", "Filter type"], ["@name", "By assignee"], ["!priority", "By priority"], [">overdue", "Overdue"]].map(([key, label]) => (
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
          {cleanQuery.length >= 2 && !isFetching && flatItems.length === 0 ? (
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
          <span className="text-[11px] text-muted-foreground"><Kbd>⌘K</Kbd></span>
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
