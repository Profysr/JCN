import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  CheckSquare,
  ArrowRight,
  Loader2,
  Clock,
  UserPlus,
  Hash,
} from "lucide-react";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import api from "@/shared/lib/api";
import { NAV_ITEMS, workspaceUrl } from "@/shared/lib/navLinks";
import { cn } from "@/shared/lib/utils";
import { getPriority } from "@/shared/lib/constants";


// ── Recently viewed (localStorage) ────────────────────────────────────────────
const RV_KEY = "jcn_recently_viewed";

function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem(RV_KEY) || "[]");
  } catch {
    return [];
  }
}

function addToRecentlyViewed(item) {
  try {
    const prev = getRecentlyViewed().filter((r) => r.url !== item.url);
    localStorage.setItem(RV_KEY, JSON.stringify([item, ...prev].slice(0, 8)));
  } catch {}
}

// ── Query shortcuts parser ────────────────────────────────────────────────────
// Returns { cleanQuery, filters: { type, assignee, priority, special } }
function parseShortcuts(raw) {
  const tokens = raw.split(/\s+/).filter(Boolean);
  const filters = {};
  const rest = [];

  for (const tok of tokens) {
    if (tok.startsWith("#")) filters.type = tok.slice(1);
    else if (tok.startsWith("@")) filters.assignee = tok.slice(1);
    else if (tok.startsWith("!")) filters.priority = tok.slice(1);
    else if (tok.startsWith(">"))
      filters.special = tok.slice(1); // "overdue", "today"
    else rest.push(tok);
  }
  return { cleanQuery: rest.join(" "), filters };
}

const SEARCH_LIMIT = 25;

// ── Main component ────────────────────────────────────────────────────────────
export default function CommandPalette({ open, onClose, workspaceId }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Parse shortcuts from raw query
  const { cleanQuery, filters: shortcutFilters } = useMemo(
    () => parseShortcuts(query),
    [query],
  );
  // Value-based key so the search effect refires only when the parsed filters
  // actually change — not on every keystroke that recreates the object.
  const filterKey = JSON.stringify(shortcutFilters);

  const [results, setResults] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const abortRef = useRef(null);

  // Build shared filter params from the current query state (no cursor).
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (cleanQuery.trim()) params.set("q", cleanQuery.trim());
    if (shortcutFilters.type) params.set("task_type", shortcutFilters.type);
    if (shortcutFilters.assignee)
      params.set("assignee", shortcutFilters.assignee);
    if (shortcutFilters.priority)
      params.set("priority", shortcutFilters.priority);
    if (shortcutFilters.special === "overdue") params.set("overdue", "true");
    if (shortcutFilters.special === "today") params.set("today", "true");
    params.set("limit", String(SEARCH_LIMIT));
    return params;
    // shortcutFilters object is new each render; filterKey is the stable value-key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanQuery, filterKey]);

  // Fire a new search whenever the parsed query or shortcut filters change.
  // Each run aborts the previous in-flight request via AbortController.
  // Shortcut filters must have a non-empty value — bare "#" or "@" doesn't count.
  useEffect(() => {
    const hasTextQuery = cleanQuery.trim().length >= 3;
    const hasShortcuts = Object.values(shortcutFilters).some(Boolean);

    if (!hasTextQuery && !hasShortcuts) {
      if (abortRef.current) abortRef.current.abort();
      setResults(null);
      setIsFetching(false);
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsFetching(true);
    api
      .get(`/api/search/?${buildParams().toString()}`, {
        signal: controller.signal,
      })
      .then((r) => {
        setResults(r.data);
        setIsFetching(false);
      })
      .catch((err) => {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          setResults(null);
          setIsFetching(false);
        }
      });
  }, [cleanQuery, filterKey]);

  const handleLoadMore = useCallback(() => {
    if (!results?.next_cursor || isLoadingMore) return;
    const params = buildParams();
    params.set("cursor", results.next_cursor);
    setIsLoadingMore(true);
    api
      .get(`/api/search/?${params.toString()}`)
      .then((r) => {
        setResults((prev) => ({
          ...r.data,
          tasks: [...(prev?.tasks ?? []), ...r.data.tasks],
        }));
        setIsLoadingMore(false);
      })
      .catch(() => setIsLoadingMore(false));
  }, [results, isLoadingMore, buildParams]);

  // Abort pending request when palette closes or component unmounts
  useEffect(() => {
    if (!open && abortRef.current) {
      abortRef.current.abort();
      setResults(null);
      setIsFetching(false);
    }
  }, [open]);

  useEffect(() => () => abortRef.current?.abort(), []);
  const recentlyViewed = useMemo(
    () => (open ? getRecentlyViewed() : []),
    [open],
  );

  // Quick actions
  const quickActions = useMemo(() => {
    if (!workspaceId) return [];
    return [
      // {
      //   type: "action",
      //   icon: Plus,
      //   label: "Create task",
      //   desc: "New task in current board",
      //   action: () => {},
      //   hotkey: "C",
      // },
      {
        type: "action",
        icon: Hash,
        label: "Create board",
        desc: "New board in workspace",
        action: () => navigate(`/w/${workspaceId}/boards`),
        hotkey: "P",
      },
      {
        type: "action",
        icon: UserPlus,
        label: "Invite member",
        desc: "Add someone to this workspace",
        action: () => navigate(`/w/${workspaceId}/members`),
        hotkey: "I",
      },
    ];
  }, [workspaceId, navigate]);

  // Navigation links — derived from the same NAV_ITEMS used by AppLayout
  const navLinks = useMemo(() => {
    if (!workspaceId) return [];
    return NAV_ITEMS.map((item) => ({
      type: "nav",
      icon: item.icon,
      label: item.label,
      desc: item.desc,
      action: () => navigate(workspaceUrl(workspaceId, item.path)),
    }));
  }, [workspaceId, navigate]);

  const sections = useMemo(() => {
    const q = query.trim();
    const hasShortcuts = Object.values(shortcutFilters).some(Boolean);
    const hasTextQuery = cleanQuery.trim().length >= 3;

    // No input: show recently viewed + quick actions + navigation
    if (!q) {
      const rv = recentlyViewed.map((item) => ({
        type: "recent",
        icon:
          item.type === "task"
            ? CheckSquare
            : item.type === "board"
              ? Hash
              : Clock,
        label: item.title,
        desc: item.type,
        action: () => navigate(item.url),
      }));
      return [
        rv.length > 0 && { title: "Recent", items: rv },
        quickActions.length > 0 && {
          title: "Quick Actions",
          items: quickActions,
        },
        navLinks.length > 0 && { title: "Navigation", items: navLinks },
      ].filter(Boolean);
    }

    if (!hasTextQuery && !hasShortcuts)
      return [{ title: "Navigation", items: navLinks }];

    // Build task items — raw results from the API
    let taskItems = (results?.tasks || []).map((t) => ({
      type: "task",
      icon: CheckSquare,
      label: t.title,
      meta: `${t.board_name} · ${t.status_name || "No status"}`,
      priority: t.priority,
      url: `/w/${t.workspace_id}/boards/${t.board_id}?task=${t.id}`,
      task_type: t.task_type,
      assignee_name: t.assignee_name,
      due_date: t.due_date,
      action: () =>
        navigate(`/w/${t.workspace_id}/boards/${t.board_id}?task=${t.id}`),
    }));

    const boardItems = (results?.boards || []).map((p) => ({
      type: "board",
      board_type: p.board_type,
      label: p.name,
      meta: p.workspace_name,
      url: `/w/${p.workspace_id}/boards`,
      action: () => navigate(`/w/${p.workspace_id}/boards`),
    }));

    return [
      taskItems.length > 0 && { title: "Tasks", items: taskItems },
      boardItems.length > 0 && { title: "Boards", items: boardItems },
    ].filter(Boolean);
  }, [
    query,
    cleanQuery,
    shortcutFilters,
    results,
    recentlyViewed,
    quickActions,
    navLinks,
    navigate,
  ]);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Hint bar: show active shortcuts
  const hintText = useMemo(() => {
    if (shortcutFilters.type)
      return `Filtering by type: #${shortcutFilters.type}`;
    if (shortcutFilters.priority)
      return `Filtering by priority: !${shortcutFilters.priority}`;
    if (shortcutFilters.assignee)
      return `Filtering by assignee: @${shortcutFilters.assignee}`;
    if (shortcutFilters.special === "overdue") return "Showing overdue tasks";
    if (shortcutFilters.special === "today") return "Showing tasks due today";
    return null;
  }, [shortcutFilters]);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [sections]);

  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback(
    (item) => {
      if (item.url && (item.type === "task" || item.type === "board")) {
        addToRecentlyViewed({
          type: item.type,
          title: item.label,
          url: item.url,
        });
      }
      item.action();
      onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && flatItems[selectedIndex]) {
        e.preventDefault();
        execute(flatItems[selectedIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatItems, selectedIndex, execute, onClose]);

  if (!open) return null;

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full max-w-xl mx-4 bg-card border rounded-md shadow-2xl overflow-hidden flex flex-col animate-scale-in"
        style={{ maxHeight: "min(600px, 80vh)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b flex-shrink-0">
          {isFetching &&
          (cleanQuery.trim().length >= 3 ||
            Object.values(shortcutFilters).some(Boolean)) ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search, or try #bug  @name  !highest  >overdue"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border leading-none">
            Esc
          </kbd>
        </div>

        {/* Active filter hint */}
        {hintText && (
          <div className="px-4 py-1.5 bg-primary/5 border-b text-[11px] text-primary font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            {hintText}
            <button
              onClick={() => setQuery(cleanQuery)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Shortcut legend (shown when no query) */}
        {!query.trim() && (
          <div className="flex items-center gap-4 px-4 py-2 border-b bg-muted/20 flex-shrink-0">
            {[
              ["#bug", "Filter type"],
              ["@", "By assignee"],
              ["!highest", "By priority"],
              [">overdue", "Overdue"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setQuery(key + " ");
                  inputRef.current?.focus();
                }}
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <kbd className="bg-muted border border-border rounded px-1 py-0.5 font-mono text-[10px]">
                  {key}
                </kbd>
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {(cleanQuery.trim().length >= 3 ||
            Object.values(shortcutFilters).some(Boolean)) &&
          !isFetching &&
          flatItems.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                No results for{" "}
                <span className="font-medium text-foreground">
                  "{cleanQuery}"
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Try searching by task title, description, or board name
              </p>
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <div key={section.title}>
                  <p className="px-4 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </p>
                  {section.items.map((item) => {
                    const idx = globalIdx++;
                    const Icon = item.icon;
                    const isSel = selectedIndex === idx;
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
                        {item.type === "board" ? (
                          <BoardTypeIcon
                            board_type={item.board_type}
                            size="sm"
                          />
                        ) : (
                          <Icon
                            className={cn(
                              "w-4 h-4 flex-shrink-0",
                              item.type === "task"
                                ? getPriority(item.priority).textCls
                                : item.type === "action"
                                  ? "text-emerald-500"
                                  : "text-muted-foreground",
                            )}
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {item.label}
                          </p>
                          {(item.meta || item.desc) && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {item.meta || item.desc}
                            </p>
                          )}
                        </div>
                        {item.hotkey && (
                          <kbd className="text-[10px] text-muted-foreground bg-muted border border-border rounded px-1 py-0.5">
                            {item.hotkey}
                          </kbd>
                        )}
                        {isSel && !item.hotkey && (
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              {results?.next_cursor && (
                <LoadMoreButton
                  variant="row"
                  label="Load more results"
                  isLoading={isLoadingMore}
                  onClick={handleLoadMore}
                />
              )}
            </>
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
          <span className="text-[11px] text-muted-foreground">
            <Kbd>⌘ + K</Kbd>
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
