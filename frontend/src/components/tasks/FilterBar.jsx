import { useState, useRef, useEffect } from "react";
import { Search, X, Bookmark, BookmarkPlus, SlidersHorizontal, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { PRIORITIES, TASK_TYPES } from "@/lib/constants";

// FilterBar needs active/idle chip classes — derive from PRIORITIES
const PRIORITY_OPTIONS = PRIORITIES
  .filter(p => p.value !== "no_priority")
  .map(p => ({
    value:  p.value,
    label:  p.label,
    active: p.filterActiveCls,
    idle:   "border-border text-muted-foreground",
  }));

const DUE_OPTIONS = [
  { value: "overdue",    label: "Overdue" },
  { value: "today",      label: "Due today" },
  { value: "this_week",  label: "This week" },
  { value: "no_date",    label: "No due date" },
];

function useClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (e) => { if (ref.current && !ref.current.contains(e.target)) handler(); };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [ref, handler]);
}

/* ── Assignee stacker + picker ───────────────────────────────────────────── */
function AssigneeFilter({ members, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);

  const visibleAvatars = members.filter((m) => selected.includes(m.user?.id));
  const unselected     = members.filter((m) => !selected.includes(m.user?.id));

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Selected avatars — stacked */}
      {visibleAvatars.length > 0 && (
        <div className="flex -space-x-1.5">
          {visibleAvatars.map((m) => (
            <button
              key={m.user?.id}
              onClick={() => toggle(m.user?.id)}
              title={`Remove ${m.user?.display_name || m.user?.email}`}
              className="ring-2 ring-background rounded-full hover:ring-destructive/50 transition-all"
            >
              <Avatar
                name={m.user?.display_name || m.user?.full_name || m.user?.email}
                src={m.user?.avatar}
                size="sm"
              />
            </button>
          ))}
        </div>
      )}

      {/* Picker trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
          selected.length > 0
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        )}
      >
        <span>Assignee</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 bg-popover border rounded-xl shadow-popover py-1 min-w-[180px]">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Filter by assignee
          </p>
          {members.map((m) => {
            const active = selected.includes(m.user?.id);
            return (
              <button
                key={m.user?.id}
                onClick={() => toggle(m.user?.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
              >
                <Avatar
                  name={m.user?.display_name || m.user?.full_name || m.user?.email}
                  src={m.user?.avatar}
                  size="sm"
                />
                <span className="text-sm flex-1 truncate">
                  {m.user?.display_name || m.user?.full_name || m.user?.email}
                </span>
                {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            );
          })}
          {members.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No members</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Advanced filters dropdown ───────────────────────────────────────────── */
function AdvancedFilters({ filters, onChange, labels }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const toggleArr = (key, val) => {
    const arr = filters[key] || [];
    onChange({ ...filters, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] });
  };

  const advancedActive =
    (filters.types?.length  || 0) +
    (filters.labels?.length || 0) +
    (filters.due?.length    || 0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
          advancedActive > 0
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
        )}
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Filters</span>
        {advancedActive > 0 && (
          <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center">
            {advancedActive}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 z-50 bg-popover border rounded-xl shadow-popover p-3 w-64 space-y-4">

          {/* Task type */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Task type</p>
            <div className="flex flex-wrap gap-1.5">
              {TASK_TYPES.map((t) => {
                const active = (filters.types || []).includes(t.value);
                return (
                  <button
                    key={t.value}
                    onClick={() => toggleArr("types", t.value)}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium border transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Due date */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Due date</p>
            <div className="flex flex-wrap gap-1.5">
              {DUE_OPTIONS.map((d) => {
                const active = (filters.due || []).includes(d.value);
                return (
                  <button
                    key={d.value}
                    onClick={() => toggleArr("due", d.value)}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium border transition-colors",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Labels */}
          {labels.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Labels</p>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const active = (filters.labels || []).includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleArr("labels", l.id)}
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium border transition-colors",
                        active ? "opacity-100" : "opacity-50 hover:opacity-75"
                      )}
                      style={{
                        borderColor: l.color,
                        color: l.color,
                        backgroundColor: active ? l.color + "22" : "transparent",
                      }}
                    >
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Clear advanced */}
          {advancedActive > 0 && (
            <button
              onClick={() => {
                onChange({ ...filters, types: [], labels: [], due: [] });
                setOpen(false);
              }}
              className="w-full text-center text-xs text-muted-foreground hover:text-destructive transition-colors pt-1 border-t"
            >
              Clear advanced filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main FilterBar ──────────────────────────────────────────────────────── */
export default function FilterBar({ filters, onChange, members = [], labels = [], savedViews = [], onSaveView, onDeleteView, inline = false }) {
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const hasFilters =
    filters.search ||
    filters.priorities?.length > 0 ||
    filters.assignees?.length > 0 ||
    filters.labels?.length > 0 ||
    filters.types?.length > 0 ||
    filters.due?.length > 0;

  const toggleArr = (key, val) => {
    const arr = filters[key] || [];
    onChange({ ...filters, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] });
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!savingName.trim()) return;
    onSaveView?.({ name: savingName.trim(), filters });
    setSavingName(""); setShowSaveInput(false);
  };

  const clearAll = () =>
    onChange({ search: "", priorities: [], assignees: [], labels: [], types: [], due: [] });

  return (
    <div className={cn(
      "flex items-center gap-2.5 px-3 py-1.5 flex-shrink-0 flex-wrap flex-1 min-w-0",
      !inline && "border-b bg-background min-h-[46px]"
    )}>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          className="pl-8 pr-3 py-1.5 text-xs border rounded-md bg-background outline-none focus:ring-1 focus:ring-ring w-44 placeholder:text-muted-foreground"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Priority chips */}
      <div className="flex items-center gap-1">
        {PRIORITY_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => toggleArr("priorities", p.value)}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
              (filters.priorities || []).includes(p.value) ? p.active : `${p.idle} hover:bg-accent`
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Assignee stacker */}
      {members.length > 0 && (
        <AssigneeFilter
          members={members}
          selected={filters.assignees || []}
          onChange={(assignees) => onChange({ ...filters, assignees })}
        />
      )}

      {/* Advanced filters */}
      <AdvancedFilters filters={filters} onChange={onChange} labels={labels} />

      {/* Save view */}
      {hasFilters && onSaveView && (
        showSaveInput ? (
          <form onSubmit={handleSave} className="flex items-center gap-1.5">
            <input
              autoFocus
              className="text-xs border rounded-md px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring w-28"
              placeholder="View name…"
              value={savingName}
              onChange={(e) => setSavingName(e.target.value)}
              onBlur={() => { if (!savingName) setShowSaveInput(false); }}
            />
            <button type="submit" className="text-xs text-primary font-medium">Save</button>
          </form>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookmarkPlus className="w-3.5 h-3.5" /> Save view
          </button>
        )
      )}

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
                onClick={() => onChange({ search: "", priorities: [], assignees: [], labels: [], types: [], due: [], ...v.filters })}
                className="flex items-center gap-1 text-xs px-2 py-1 border rounded-md hover:bg-accent transition-colors"
              >
                <Bookmark className="w-3 h-3" /> {v.name}
              </button>
              <button onClick={() => onDeleteView?.(v.id)} className="text-muted-foreground hover:text-destructive p-0.5 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
