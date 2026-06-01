import { useState } from "react";
import { Search, X, Bookmark, BookmarkPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_OPTIONS = [
  { value: "urgent", label: "Urgent", active: "text-red-600 bg-red-50 border-red-300",   idle: "border-input text-muted-foreground" },
  { value: "high",   label: "High",   active: "text-orange-600 bg-orange-50 border-orange-300", idle: "border-input text-muted-foreground" },
  { value: "medium", label: "Medium", active: "text-yellow-600 bg-yellow-50 border-yellow-300", idle: "border-input text-muted-foreground" },
  { value: "low",    label: "Low",    active: "text-blue-600 bg-blue-50 border-blue-300",  idle: "border-input text-muted-foreground" },
];

export default function FilterBar({ filters, onChange, members = [], labels = [], savedViews = [], onSaveView, onDeleteView }) {
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const hasFilters =
    filters.search ||
    filters.priorities.length > 0 ||
    filters.assignees.length > 0 ||
    filters.labels.length > 0;

  const handleSave = (e) => {
    e.preventDefault();
    if (!savingName.trim()) return;
    onSaveView?.({ name: savingName.trim(), filters });
    setSavingName("");
    setShowSaveInput(false);
  };

  const toggleArr = (key, val) => {
    const arr = filters[key];
    onChange({ ...filters, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] });
  };

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b bg-background flex-shrink-0 flex-wrap min-h-[44px]">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          className="pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background outline-none focus:ring-1 focus:ring-ring w-48"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </div>

      {/* Priority chips */}
      <div className="flex items-center gap-1">
        {PRIORITY_OPTIONS.map((p) => (
          <button
            key={p.value}
            onClick={() => toggleArr("priorities", p.value)}
            className={cn(
              "px-2 py-1 rounded text-xs font-medium border transition-colors",
              filters.priorities.includes(p.value) ? p.active : `${p.idle} hover:bg-accent`
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Assignee avatars */}
      {members.length > 0 && (
        <div className="flex items-center gap-1">
          {members.map((m) => {
            const initial = (m.user?.full_name || m.user?.email || "?")[0].toUpperCase();
            const active = filters.assignees.includes(m.user?.id);
            return (
              <button
                key={m.user?.id}
                onClick={() => toggleArr("assignees", m.user?.id)}
                title={m.user?.full_name || m.user?.email}
                className={cn(
                  "w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all",
                  active
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1"
                    : "bg-primary/10 text-primary hover:ring-2 hover:ring-primary/40 hover:ring-offset-1"
                )}
              >
                {initial}
              </button>
            );
          })}
        </div>
      )}

      {/* Label chips */}
      {labels.length > 0 && (
        <div className="flex items-center gap-1.5">
          {labels.map((l) => {
            const active = filters.labels.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => toggleArr("labels", l.id)}
                className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium border transition-all",
                  active ? "opacity-100" : "opacity-50 hover:opacity-80"
                )}
                style={{
                  borderColor: l.color,
                  color: l.color,
                  backgroundColor: active ? l.color + "25" : "transparent",
                }}
              >
                {l.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Save current view */}
      {hasFilters && onSaveView && (
        showSaveInput ? (
          <form onSubmit={handleSave} className="flex items-center gap-1.5">
            <input
              autoFocus
              className="text-xs border rounded-md px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring w-32"
              placeholder="View name…"
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              onBlur={() => { if (!savingName) setShowSaveInput(false); }}
            />
            <button type="submit" className="text-xs text-primary font-medium">Save</button>
          </form>
        ) : (
          <button
            onClick={() => setShowSaveInput(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <BookmarkPlus className="w-3.5 h-3.5" /> Save view
          </button>
        )
      )}

      {/* Clear all */}
      {hasFilters && (
        <button
          onClick={() => onChange({ search: "", priorities: [], assignees: [], labels: [] })}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Clear
        </button>
      )}

      {/* Saved views */}
      {savedViews.length > 0 && (
        <div className="flex items-center gap-1.5 ml-1 border-l pl-2">
          {savedViews.map(v => (
            <div key={v.id} className="flex items-center gap-0.5">
              <button
                onClick={() => onChange({ search: "", priorities: [], assignees: [], labels: [], ...v.filters })}
                className="flex items-center gap-1 text-xs px-2 py-1 border rounded-md hover:bg-accent transition-colors"
              >
                <Bookmark className="w-3 h-3" /> {v.name}
              </button>
              <button onClick={() => onDeleteView?.(v.id)} className="text-muted-foreground hover:text-destructive p-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
