import { useState, useRef, useCallback, useMemo } from "react";
import {
  AlertCircle, ArrowUp, ArrowDown, Minus, Calendar, ChevronDown,
  ChevronRight, Settings2, Check, ChevronsUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Priority config ────────────────────────────────────────────────────────────
const PRI = {
  urgent:      { icon: AlertCircle, cls: "text-red-500",             dot: "bg-red-500"             },
  high:        { icon: ArrowUp,     cls: "text-orange-500",          dot: "bg-orange-500"          },
  medium:      { icon: Minus,       cls: "text-yellow-500",          dot: "bg-yellow-400"          },
  low:         { icon: ArrowDown,   cls: "text-blue-400",            dot: "bg-blue-400"            },
  no_priority: { icon: Minus,       cls: "text-muted-foreground/40", dot: "bg-muted-foreground/30" },
};
const PRI_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, no_priority: 4 };

// ── Column definitions ─────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { id: "title",           label: "Title",    sortable: true,  defaultVisible: true  },
  { id: "status",          label: "Status",   sortable: true,  defaultVisible: true  },
  { id: "priority",        label: "Priority", sortable: true,  defaultVisible: true  },
  { id: "assignee",        label: "Assignee", sortable: true,  defaultVisible: true  },
  { id: "due_date",        label: "Due Date", sortable: true,  defaultVisible: true  },
  { id: "labels",          label: "Labels",   sortable: false, defaultVisible: true  },
  { id: "estimate_points", label: "Points",   sortable: true,  defaultVisible: false },
  { id: "sprint",          label: "Sprint",   sortable: true,  defaultVisible: false },
];

// ── Sort helpers ───────────────────────────────────────────────────────────────
function getSortValue(task, col) {
  if (col === "title")           return (task.title || "").toLowerCase();
  if (col === "status")          return task.status_detail?.name?.toLowerCase() || "";
  if (col === "priority")        return PRI_ORDER[task.priority] ?? 4;
  if (col === "assignee")        return (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
  if (col === "due_date")        return task.due_date || "9999";
  if (col === "estimate_points") return task.estimate_points ?? 9999;
  if (col === "sprint")          return task.sprint_detail?.name?.toLowerCase() || "";
  return "";
}

function applySort(tasks, sorts) {
  if (!sorts.length) return tasks;
  return [...tasks].sort((a, b) => {
    for (const { col, dir } of sorts) {
      const av = getSortValue(a, col);
      const bv = getSortValue(b, col);
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

// ── Grouping ───────────────────────────────────────────────────────────────────
function groupTasks(tasks, groupBy, statuses) {
  if (!groupBy) return [{ id: "__all__", label: null, tasks }];
  const groups = new Map();
  for (const t of tasks) {
    let id, label, color;
    if (groupBy === "status") {
      const s = statuses.find(s => s.id === (t.status_detail?.id ?? t.status_id));
      id = s?.id || "none"; label = s?.name || "No Status"; color = s?.color || "#94a3b8";
    } else if (groupBy === "assignee") {
      id = t.assignee?.id || "unassigned";
      label = t.assignee ? (t.assignee.full_name || t.assignee.email) : "Unassigned";
      color = "#6366f1";
    } else if (groupBy === "priority") {
      id = t.priority || "no_priority"; label = (t.priority || "no_priority").replace(/_/g," ");
      color = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#60a5fa", no_priority: "#94a3b8" }[id] || "#94a3b8";
    } else {
      id = t.sprint_detail?.id || "none"; label = t.sprint_detail?.name || "No Sprint"; color = "#8b5cf6";
    }
    if (!groups.has(id)) groups.set(id, { id, label, color, tasks: [] });
    groups.get(id).tasks.push(t);
  }
  return Array.from(groups.values());
}

// ── Column-visibility popover ─────────────────────────────────────────────────
function ColumnToggle({ visible, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="p-1.5 rounded hover:bg-accent transition-colors"
        title="Toggle columns"
      >
        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 min-w-[160px]">
            {ALL_COLUMNS.filter(c => c.id !== "title").map(c => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={visible.has(c.id)}
                  onChange={() => onChange(c.id)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                {c.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Group-by picker ────────────────────────────────────────────────────────────
function GroupByPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const options = [
    { id: null,       label: "No grouping" },
    { id: "status",   label: "Status"      },
    { id: "assignee", label: "Assignee"    },
    { id: "priority", label: "Priority"    },
    { id: "sprint",   label: "Sprint"      },
  ];
  const current = options.find(o => o.id === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors"
      >
        <ChevronsUpDown className="w-3 h-3 text-muted-foreground" />
        Group: {current?.label || "None"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[140px]">
            {options.map(o => (
              <button
                key={String(o.id)}
                onClick={() => { onChange(o.id); setOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                {o.id === value && <Check className="w-3 h-3 text-primary" />}
                <span className={o.id === value ? "ml-0 font-medium" : "ml-5"}>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Inline cell editors ────────────────────────────────────────────────────────
function InlineSelect({ value, options, onSave, onCancel }) {
  return (
    <select
      autoFocus
      defaultValue={value}
      onBlur={e => onSave(e.target.value)}
      onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") onSave(e.target.value); }}
      className="w-full text-xs bg-background border border-ring rounded px-1 py-0.5 focus:outline-none"
      onClick={e => e.stopPropagation()}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function InlineInput({ value, onSave, onCancel, type = "text" }) {
  const ref = useRef(null);
  return (
    <input
      ref={ref}
      autoFocus
      type={type}
      defaultValue={value || ""}
      onBlur={e => onSave(e.target.value)}
      onKeyDown={e => { if (e.key === "Escape") onCancel(); if (e.key === "Enter") { e.target.blur(); } }}
      onClick={e => e.stopPropagation()}
      className="w-full text-xs bg-background border border-ring rounded px-1.5 py-0.5 focus:outline-none"
    />
  );
}

// ── Sort header ────────────────────────────────────────────────────────────────
function SortHeader({ label, colId, sorts, onSort }) {
  const sort = sorts.find(s => s.col === colId);
  return (
    <button
      onClick={(e) => onSort(colId, e.shiftKey)}
      className="flex items-center gap-1 group"
    >
      {label}
      {sort ? (
        sort.dir === "asc"
          ? <ArrowUp   className="w-3 h-3 text-primary" />
          : <ArrowDown className="w-3 h-3 text-primary" />
      ) : (
        <ArrowUp className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-opacity" />
      )}
      {sorts.length > 1 && sort && (
        <span className="text-[9px] text-primary font-bold">{sorts.findIndex(s => s.col === colId) + 1}</span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ListView({
  tasks = [], statuses = [], members = [],
  onTaskClick, onUpdateTask,
  selectedTaskId, selectedIds = new Set(), onToggleSelect,
  canEdit = false,
}) {
  const [sorts,    setSorts]    = useState([]);
  const [groupBy,  setGroupBy]  = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [editCell, setEditCell] = useState(null); // { taskId, col }
  const [visibleCols, setVisibleCols] = useState(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.id))
  );

  const handleSort = useCallback((col, multi) => {
    setSorts(prev => {
      if (multi) {
        const idx = prev.findIndex(s => s.col === col);
        if (idx === -1) return [...prev, { col, dir: "asc" }];
        if (prev[idx].dir === "asc") return prev.map((s, i) => i === idx ? { ...s, dir: "desc" } : s);
        return prev.filter((_, i) => i !== idx);
      }
      const cur = prev.find(s => s.col === col && prev.length === 1);
      if (cur) return cur.dir === "asc" ? [{ col, dir: "desc" }] : [];
      return [{ col, dir: "asc" }];
    });
  }, []);

  const toggleCol = (id) => setVisibleCols(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const sortedTasks = useMemo(() => applySort(tasks, sorts), [tasks, sorts]);
  const groups      = useMemo(() => groupTasks(sortedTasks, groupBy, statuses), [sortedTasks, groupBy, statuses]);

  const startEdit = (taskId, col, e) => {
    if (!canEdit || !onUpdateTask) return;
    e.stopPropagation();
    setEditCell({ taskId, col });
  };
  const saveCell = (task, col, rawValue) => {
    if (!onUpdateTask) return;
    let updates = {};
    if (col === "title")           updates = { title: rawValue };
    else if (col === "status")     updates = { status_id: rawValue };
    else if (col === "priority")   updates = { priority: rawValue };
    else if (col === "assignee")   updates = { assignee_id: rawValue || null };
    else if (col === "due_date")   updates = { due_date: rawValue || null };
    else if (col === "estimate_points") updates = { estimate_points: rawValue ? parseInt(rawValue) : null };
    if (Object.keys(updates).length) onUpdateTask({ taskId: task.id, ...updates });
    setEditCell(null);
  };

  const visibleColumns = ALL_COLUMNS.filter(c => visibleCols.has(c.id));
  const TH = "px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

  const renderCell = (task, col) => {
    const isEditing = editCell?.taskId === task.id && editCell?.col === col;

    if (col === "title") {
      const p = PRI[task.priority] || PRI.no_priority;
      if (isEditing) {
        return (
          <td className="pl-4 pr-3 py-1.5 w-[40%]">
            <InlineInput value={task.title} onSave={v => saveCell(task, "title", v)} onCancel={() => setEditCell(null)} />
          </td>
        );
      }
      return (
        <td className="pl-4 pr-3 py-2" onDoubleClick={e => startEdit(task.id, "title", e)}>
          <div className="flex items-center gap-2">
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", p.dot)} />
            <span className="font-medium text-[13px] line-clamp-1">{task.title}</span>
          </div>
        </td>
      );
    }

    if (col === "status") {
      const s = statuses.find(s => s.id === (task.status_detail?.id ?? task.status_id));
      if (isEditing) {
        return (
          <td className="px-3 py-1.5">
            <InlineSelect
              value={task.status_detail?.id || ""}
              options={statuses.map(s => ({ value: s.id, label: s.name }))}
              onSave={v => saveCell(task, "status", v)}
              onCancel={() => setEditCell(null)}
            />
          </td>
        );
      }
      return (
        <td className="px-3 py-2" onDoubleClick={e => startEdit(task.id, "status", e)}>
          {s ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap" style={{ backgroundColor: s.color + "20", color: s.color }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
        </td>
      );
    }

    if (col === "priority") {
      const p = PRI[task.priority] || PRI.no_priority;
      const Icon = p.icon;
      if (isEditing) {
        return (
          <td className="px-3 py-1.5">
            <InlineSelect
              value={task.priority || "no_priority"}
              options={[
                { value: "no_priority", label: "None" },
                { value: "low",    label: "Low"    },
                { value: "medium", label: "Medium" },
                { value: "high",   label: "High"   },
                { value: "urgent", label: "Urgent" },
              ]}
              onSave={v => saveCell(task, "priority", v)}
              onCancel={() => setEditCell(null)}
            />
          </td>
        );
      }
      return (
        <td className="px-3 py-2" onDoubleClick={e => startEdit(task.id, "priority", e)}>
          <Icon className={cn("w-3.5 h-3.5", p.cls)} />
        </td>
      );
    }

    if (col === "assignee") {
      if (isEditing) {
        return (
          <td className="px-3 py-1.5">
            <InlineSelect
              value={task.assignee?.id || ""}
              options={[{ value: "", label: "Unassigned" }, ...members.map(m => ({ value: m.user.id, label: m.user.full_name || m.user.email }))]}
              onSave={v => saveCell(task, "assignee", v)}
              onCancel={() => setEditCell(null)}
            />
          </td>
        );
      }
      return (
        <td className="px-3 py-2" onDoubleClick={e => startEdit(task.id, "assignee", e)}>
          {task.assignee ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                {(task.assignee.full_name || task.assignee.email)[0].toUpperCase()}
              </div>
              <span className="text-[12px] text-muted-foreground truncate max-w-[100px]">
                {task.assignee.full_name || task.assignee.email}
              </span>
            </div>
          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
        </td>
      );
    }

    if (col === "due_date") {
      if (isEditing) {
        return (
          <td className="px-3 py-1.5">
            <InlineInput type="date" value={task.due_date || ""} onSave={v => saveCell(task, "due_date", v)} onCancel={() => setEditCell(null)} />
          </td>
        );
      }
      return (
        <td className="px-3 py-2" onDoubleClick={e => startEdit(task.id, "due_date", e)}>
          {task.due_date ? (
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground whitespace-nowrap">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
        </td>
      );
    }

    if (col === "labels") {
      return (
        <td className="px-3 py-2 pr-4">
          <div className="flex flex-wrap gap-1">
            {task.labels?.map(l => (
              <span key={l.id} className="px-1.5 py-0 rounded text-[10px] font-semibold leading-4" style={{ backgroundColor: l.color + "22", color: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        </td>
      );
    }

    if (col === "estimate_points") {
      if (isEditing) {
        return (
          <td className="px-3 py-1.5">
            <InlineInput type="number" value={task.estimate_points} onSave={v => saveCell(task, "estimate_points", v)} onCancel={() => setEditCell(null)} />
          </td>
        );
      }
      return (
        <td className="px-3 py-2 text-center" onDoubleClick={e => startEdit(task.id, "estimate_points", e)}>
          {task.estimate_points != null
            ? <span className="text-xs font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{task.estimate_points}</span>
            : <span className="text-muted-foreground/50 text-xs">—</span>}
        </td>
      );
    }

    if (col === "sprint") {
      return (
        <td className="px-3 py-2">
          {task.sprint_detail ? (
            <span className="text-[11px] text-muted-foreground">{task.sprint_detail.name}</span>
          ) : <span className="text-muted-foreground/50 text-xs">—</span>}
        </td>
      );
    }

    return <td className="px-3 py-2" />;
  };

  const renderRow = (task) => {
    const isSelected    = selectedTaskId === task.id;
    const isBulkSelected = selectedIds.has(task.id);
    return (
      <tr
        key={task.id}
        onClick={() => onTaskClick(task.id)}
        className={cn(
          "cursor-pointer transition-colors duration-75",
          isBulkSelected ? "bg-primary/[0.08]" : isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-accent/60 bg-card",
        )}
      >
        {onToggleSelect && (
          <td className="pl-3 py-2.5" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onToggleSelect(task.id)}
              className={cn("w-4 h-4 rounded border flex items-center justify-center transition-all", isBulkSelected ? "bg-primary border-primary" : "border-border hover:border-primary bg-background")}
            >
              {isBulkSelected && (
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </td>
        )}
        {visibleColumns.map(c => renderCell(task, c.id))}
      </tr>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Table toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <GroupByPicker value={groupBy} onChange={setGroupBy} />
        {sorts.length > 0 && (
          <button onClick={() => setSorts([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear sort
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
        <ColumnToggle visible={visibleCols} onChange={toggleCol} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-secondary">
              {onToggleSelect && <th className="w-8 pl-3 py-2" />}
              {visibleColumns.map(c => (
                <th
                  key={c.id}
                  className={cn(TH, c.id === "title" ? "pl-4 w-[38%]" : "", c.id === "labels" ? "pr-4" : "")}
                >
                  {c.sortable
                    ? <SortHeader label={c.label} colId={c.id} sorts={sorts} onSort={handleSort} />
                    : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + (onToggleSelect ? 1 : 0)} className="px-4 py-14 text-center text-sm text-muted-foreground">
                  No tasks match your filters.
                </td>
              </tr>
            )}

            {groups.map(group => (
              <>
                {/* Group header */}
                {group.label && (
                  <tr
                    key={`grp-${group.id}`}
                    className="bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() => setCollapsed(prev => { const n = new Set(prev); n.has(group.id) ? n.delete(group.id) : n.add(group.id); return n; })}
                  >
                    <td colSpan={visibleColumns.length + (onToggleSelect ? 1 : 0)} className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {collapsed.has(group.id)
                          ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          : <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground" />}
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="text-xs font-semibold text-foreground">{group.label}</span>
                        <span className="text-xs text-muted-foreground">· {group.tasks.length}</span>
                      </div>
                    </td>
                  </tr>
                )}

                {/* Task rows */}
                {!collapsed.has(group.id) && group.tasks.map(renderRow)}
              </>
            ))}
          </tbody>

          {/* Footer aggregate */}
          {tasks.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/50">
                {onToggleSelect && <td />}
                {visibleColumns.map((c, i) => (
                  <td key={c.id} className={cn("px-3 py-2 text-[11px] text-muted-foreground", i === 0 ? "pl-4" : "")}>
                    {i === 0
                      ? <span className="font-semibold">{tasks.length} tasks</span>
                      : c.id === "estimate_points" && tasks.some(t => t.estimate_points != null)
                      ? <span>{tasks.reduce((s, t) => s + (t.estimate_points || 0), 0)} pts</span>
                      : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
