import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  X,
  Bookmark,
  BookmarkPlus,
  SlidersHorizontal,
  ChevronDown,
  Check,
  ShieldCheck,
  Plus,
  Layers,
  Calendar,
  TrendingUp,
  Tag,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/components/ui/avatar";
import { PRIORITIES, TASK_TYPES } from "@/shared/lib/constants";

const DUE_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "this_week", label: "This week" },
  { value: "no_date", label: "No due date" },
];

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => {
      if (ref.current && !ref.current.contains(e.target)) handler();
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

/* ── Interactive Assignee Avatar Stack ───────────────────────────────────── */
const MAX_VISIBLE = 5;

function AssigneeFilter({ members, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useClickOutside(ref, () => { setOpen(false); setSearch(""); });

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const visibleMembers = members.slice(0, MAX_VISIBLE);
  const overflowCount = members.length - MAX_VISIBLE;
  const hasSelection = selected.length > 0;

  const filtered = search
    ? members.filter((m) =>
        (m.user?.full_name || m.user?.email || "").toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  return (
    <div ref={ref} className="relative flex items-center gap-1">
      {/* Clickable avatar stack */}
      <div className="flex -space-x-1.5">
        {visibleMembers.map((m) => {
          const isSelected = selected.includes(m.user?.id);
          const isDimmed = hasSelection && !isSelected;
          return (
            <button
              key={m.user?.id}
              onClick={() => toggle(m.user?.id)}
              title={m.user?.full_name || m.user?.email}
              className={cn(
                "relative rounded-full ring-2 transition-all hover:scale-110 hover:z-10 focus:outline-none focus:z-10",
                isDimmed ? "opacity-30 ring-background" : "opacity-100 ring-background",
                isSelected && "ring-primary",
              )}
            >
              <Avatar
                user={m.user}
                name={m.user?.full_name || m.user?.email}
                src={m.user?.avatar}
                size="sm"
              />
              {isSelected && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary flex items-center justify-center ring-1 ring-background">
                  <Check className="w-1.5 h-1.5 text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Overflow badge / add button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={overflowCount > 0 ? `${overflowCount} more members` : "Filter by assignee"}
        className={cn(
          "flex items-center justify-center transition-all rounded-full focus:outline-none",
          overflowCount > 0
            ? "w-6 h-6 bg-muted ring-2 ring-background text-muted-foreground text-[10px] font-bold hover:bg-accent"
            : "w-6 h-6 border-2 border-dashed border-border bg-muted/60 text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5",
        )}
      >
        {overflowCount > 0 ? `+${overflowCount}` : <Plus className="w-3 h-3" />}
      </button>

      {/* Member dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden w-56">
          <div className="px-3 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full pl-7 pr-2.5 py-1.5 text-xs bg-muted/50 border border-border rounded-md outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.map((m) => {
              const isActive = selected.includes(m.user?.id);
              const name = m.user?.full_name || m.user?.email;
              return (
                <button
                  key={m.user?.id}
                  onClick={() => toggle(m.user?.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 transition-colors text-left",
                    isActive ? "bg-primary/5" : "hover:bg-accent",
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Avatar user={m.user} name={name} src={m.user?.avatar} size="sm" />
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary flex items-center justify-center ring-1 ring-background">
                        <Check className="w-1.5 h-1.5 text-white" />
                      </span>
                    )}
                  </div>
                  <span className={cn("text-sm flex-1 truncate", isActive && "font-medium text-primary")}>
                    {name}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-3 text-xs text-muted-foreground text-center">No members found</p>
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t px-3 py-2">
              <button
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-xs text-muted-foreground hover:text-destructive transition-colors w-full text-center"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Jira-style Two-panel Advanced Filters ───────────────────────────────── */
const FILTER_FIELDS = [
  { key: "priorities", label: "Priority", Icon: TrendingUp },
  { key: "types",      label: "Work type", Icon: Layers },
  { key: "due",        label: "Due date",  Icon: Calendar },
  { key: "labels",     label: "Labels",    Icon: Tag },
];

function AdvancedFilters({ filters = {}, onChange, labels = [], currentUserId }) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);

  // Click-outside that works across the portal boundary
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current?.contains(e.target) || dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
      setActiveKey(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Listen for the global Shift+F shortcut dispatched by AppLayout
  useEffect(() => {
    const handler = () => {
      setOpen((v) => {
        if (!v && btnRef.current) {
          const rect = btnRef.current.getBoundingClientRect();
          setDropdownPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
        }
        if (v) setActiveKey(null);
        return !v;
      });
    };
    window.addEventListener("jcn:open-filters", handler);
    return () => window.removeEventListener("jcn:open-filters", handler);
  }, []);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    } else {
      setActiveKey(null);
    }
    setOpen((v) => !v);
  };

  const activeCount =
    (filters.priorities?.length || 0) +
    (filters.types?.length || 0) +
    (filters.due?.length || 0) +
    (filters.labels?.length || 0) +
    (filters.pendingMyApproval ? 1 : 0);

  // Returns full constant objects so chips get icon + color metadata
  const getOptions = (key) => {
    if (key === "priorities") return PRIORITIES;
    if (key === "types") return TASK_TYPES;
    if (key === "due") return DUE_OPTIONS;
    if (key === "labels") return labels.map((l) => ({ value: l.id, label: l.name, color: l.color }));
    return [];
  };

  const toggleArr = (key, val) => {
    const arr = filters[key] || [];
    onChange({ ...filters, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] });
  };

  const handleClearAll = () => {
    onChange({ ...filters, priorities: [], types: [], due: [], labels: [], pendingMyApproval: false });
    setOpen(false);
    setActiveKey(null);
  };

  const renderChip = (opt) => {
    const isSelected = (filters[activeKey] || []).includes(opt.value);

    if (activeKey === "priorities") {
      const Icon = opt.icon;
      return (
        <button
          key={opt.value}
          onClick={() => toggleArr(activeKey, opt.value)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
            isSelected
              ? opt.filterActiveCls
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className={cn("w-3 h-3 flex-shrink-0", opt.textCls)} />
          {opt.label}
        </button>
      );
    }

    if (activeKey === "types") {
      const Icon = opt.icon;
      return (
        <button
          key={opt.value}
          onClick={() => toggleArr(activeKey, opt.value)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
            isSelected
              ? cn(opt.bg, opt.color, "border-transparent")
              : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className={cn("w-3 h-3 flex-shrink-0", opt.color)} />
          {opt.label}
        </button>
      );
    }

    if (activeKey === "labels") {
      return (
        <button
          key={opt.value}
          onClick={() => toggleArr(activeKey, opt.value)}
          className={cn(
            "px-2 py-1 rounded-full text-[10px] font-medium border transition-all",
            !isSelected && "opacity-55 hover:opacity-80",
          )}
          style={{
            borderColor: opt.color,
            color: isSelected ? opt.color : undefined,
            backgroundColor: isSelected ? `${opt.color}22` : "transparent",
            opacity: isSelected ? 1 : undefined,
          }}
        >
          {opt.label}
        </button>
      );
    }

    // Due date — plain chips
    return (
      <button
        key={opt.value}
        onClick={() => toggleArr(activeKey, opt.value)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
          isSelected
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        {isSelected && <Check className="w-3 h-3" />}
        {opt.label}
      </button>
    );
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={cn(
          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
          activeCount > 0 || open
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
        <ChevronDown className={cn("w-3 h-3 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="fixed bg-popover border rounded-lg shadow-lg flex overflow-hidden"
          style={{ top: dropdownPos.top, right: dropdownPos.right, minWidth: 460, zIndex: "var(--z-dropdown)" }}
        >
          {/* Left panel — field list */}
          <div className="w-48 border-r flex flex-col shrink-0">
            <p className="px-3 pt-3 pb-1.5 text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Filter by
            </p>
            <div className="flex-1 py-1">
              {FILTER_FIELDS.map(({ key, label, Icon }) => {
                const count = (filters[key] || []).length;
                const isActive = activeKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => setActiveKey(isActive ? null : key)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                    {count > 0 && (
                      <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Pending my approval — inline toggle, no right-panel */}
              {currentUserId && (
                <button
                  onClick={() =>
                    onChange({ ...filters, pendingMyApproval: !filters.pendingMyApproval })
                  }
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors text-left",
                    filters.pendingMyApproval
                      ? "bg-amber-500/10 text-amber-700"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 leading-tight">Pending my approval</span>
                  {filters.pendingMyApproval && (
                    <span className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              )}
            </div>

            <div className="border-t px-3 py-2.5 space-y-1.5">
              {activeCount > 0 && (
                <button
                  onClick={handleClearAll}
                  className="w-full text-left text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear all
                </button>
              )}
              <p className="text-[9px] text-muted-foreground/40 leading-tight">
                Press{" "}
                <kbd className="font-mono bg-muted px-0.5 rounded text-[9px]">Shift+F</kbd>{" "}
                to open and close
              </p>
            </div>
          </div>

          {/* Right panel — options */}
          <div className="flex-1 p-4 min-w-[240px]">
            {!activeKey ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-2">
                <SlidersHorizontal className="w-7 h-7 text-muted-foreground/20" />
                <p className="text-[10px] text-muted-foreground">Select a field to start creating a filter.</p>
              </div>
            ) : activeKey === "labels" && labels.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-2">
                <Tag className="w-7 h-7 text-muted-foreground/20" />
                <p className="text-[10px] text-muted-foreground">No labels have been created for this board yet.</p>
              </div>
            ) : (
              <div>
                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {FILTER_FIELDS.find((f) => f.key === activeKey)?.label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getOptions(activeKey).map((opt) => renderChip(opt))}
                </div>

                {(filters[activeKey] || []).length > 0 && (
                  <button
                    onClick={() => onChange({ ...filters, [activeKey]: [] })}
                    className="mt-3 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear {FILTER_FIELDS.find((f) => f.key === activeKey)?.label.toLowerCase()}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Main FilterBar ──────────────────────────────────────────────────────── */
export default function FilterBar({
  filters,
  onChange,
  members = [],
  labels = [],
  savedViews = [],
  onSaveView,
  onDeleteView,
  inline = false,
  hideSearch = false,
  currentUserId,
}) {
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("jcn:focus-search", handler);
    return () => window.removeEventListener("jcn:focus-search", handler);
  }, []);

  const hasFilters =
    filters.search ||
    filters.priorities?.length > 0 ||
    filters.assignees?.length > 0 ||
    filters.labels?.length > 0 ||
    filters.types?.length > 0 ||
    filters.due?.length > 0 ||
    filters.pendingMyApproval;

  const handleSave = (e) => {
    e.preventDefault();
    if (!savingName.trim()) return;
    onSaveView?.({ name: savingName.trim(), filters });
    setSavingName("");
    setShowSaveInput(false);
  };

  const clearAll = () =>
    onChange({
      search: "",
      priorities: [],
      assignees: [],
      labels: [],
      types: [],
      due: [],
      pendingMyApproval: false,
    });

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-1.5 flex-shrink-0 flex-wrap flex-1 min-w-0",
        !inline && "border-b bg-background min-h-[46px]",
      )}
    >
      {/* Search */}
      {!hideSearch && (
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              ref={searchRef}
              className="pl-8 pr-3 py-1.5 text-xs border rounded-md bg-background outline-none focus:ring-1 focus:ring-ring w-44 placeholder:text-muted-foreground"
              placeholder="Search tasks…"
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
            />
          </div>

          <div className="w-px h-4 bg-border" />
        </>
      )}

      {/* Assignee avatar stack */}
      {members.length > 0 && (
        <AssigneeFilter
          members={members}
          selected={filters.assignees || []}
          onChange={(assignees) => onChange({ ...filters, assignees })}
        />
      )}

      <div className="w-px h-4 bg-border" />

      {/* Jira-style filter dropdown */}
      <AdvancedFilters
        filters={filters}
        onChange={onChange}
        labels={labels}
        currentUserId={currentUserId}
      />

      {/* Save view */}
      {hasFilters &&
        onSaveView &&
        (showSaveInput ? (
          <form onSubmit={handleSave} className="flex items-center gap-1.5">
            <input
              autoFocus
              className="text-xs border rounded-md px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring w-28"
              placeholder="View name…"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onBlur={() => { if (!savingName) setShowSaveInput(false); }}
            />
            <button type="submit" className="text-xs text-primary font-medium">
              Save
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" /> Save view
          </button>
        ))}

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}

      {/* Saved views */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-1.5 border-l pl-2.5 ml-1">
          {savedViews.map((v) => (
            <div key={v.id} className="flex items-center gap-0.5">
              <button
                onClick={() =>
                  onChange({
                    search: "",
                    priorities: [],
                    assignees: [],
                    labels: [],
                    types: [],
                    due: [],
                    ...v.filters,
                  })
                }
                className="flex items-center gap-1 text-xs px-2 py-1 border rounded-md hover:bg-accent transition-colors"
              >
                <Bookmark className="w-3 h-3" /> {v.name}
              </button>
              <button
                onClick={() => onDeleteView?.(v.id)}
                className="text-muted-foreground hover:text-destructive p-0.5 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
