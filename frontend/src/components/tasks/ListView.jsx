import { useState, useRef, useCallback, useMemo } from "react";
import { Avatar } from "@/components/ui/avatar";
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Settings2,
  Check,
  ChevronsUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITIES, PRIORITY_ORDER } from "@/lib/constants";

// Keyed map for O(1) lookup by priority value
const PRI = Object.fromEntries(
  PRIORITIES.map((p) => [
    p.value,
    { icon: p.icon, cls: p.textCls, dot: p.dotCls, label: p.label },
  ]),
);

// ── Column definitions ─────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { id: "title", label: "Title", sortable: true, defaultVisible: true },
  { id: "status", label: "Status", sortable: true, defaultVisible: true },
  { id: "priority", label: "Priority", sortable: true, defaultVisible: true },
  { id: "assignee", label: "Assignee", sortable: true, defaultVisible: true },
  { id: "due_date", label: "Due Date", sortable: true, defaultVisible: true },
  { id: "sprint", label: "Sprint", sortable: true, defaultVisible: false },
  { id: "labels", label: "Labels", sortable: false, defaultVisible: false },
];

// ── Sort helpers ───────────────────────────────────────────────────────────────
function getSortValue(task, col, statuses, sprintsById) {
  if (col === "title") return (task.title || "").toLowerCase();
  if (col === "status") return statuses.find((s) => s.id === task.status_id)?.name?.toLowerCase() || "";
  if (col === "priority") return PRIORITY_ORDER[task.priority] ?? 4;
  if (col === "assignee")
    return (
      task.assignee?.full_name ||
      task.assignee?.email ||
      ""
    ).toLowerCase();
  if (col === "due_date") return task.due_date || "9999";
  if (col === "sprint") return sprintsById[task.sprint_id]?.name?.toLowerCase() || "";
  return "";
}

function applySort(tasks, sorts, statuses, sprintsById) {
  if (!sorts.length) return tasks;
  return [...tasks].sort((a, b) => {
    for (const { col, dir } of sorts) {
      const av = getSortValue(a, col, statuses, sprintsById);
      const bv = getSortValue(b, col, statuses, sprintsById);
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
    }
    return 0;
  });
}

// ── Grouping ───────────────────────────────────────────────────────────────────
// Hex colours for groupBy=priority colour dots — derived from constants
const PRIORITY_COLORS = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p.hex]),
);

function getGroupKey(task, groupBy, statuses, sprintsById) {
  switch (groupBy) {
    case "status": {
      const s = statuses.find(
        (s) => s.id === task.status_id,
      );
      return {
        id: s?.id || "none",
        label: s?.name || "No Status",
        color: s?.color || "#94a3b8",
      };
    }
    case "assignee": {
      return {
        id: task.assignee?.id || "unassigned",
        label: task.assignee
          ? task.assignee.full_name || task.assignee.email
          : "Unassigned",
        color: "#6366f1",
      };
    }
    case "priority": {
      const key = task.priority || "no_priority";
      return {
        id: key,
        label: key.replace(/_/g, " "),
        color: PRIORITY_COLORS[key] || "#94a3b8",
      };
    }
    default: {
      // sprint
      const sprint = sprintsById[task.sprint_id];
      return {
        id: task.sprint_id || "none",
        label: sprint?.name || "No Sprint",
        color: "#8b5cf6",
      };
    }
  }
}

function groupTasks(tasks, groupBy, statuses, sprintsById) {
  if (!groupBy) return [{ id: "__all__", label: null, tasks }];

  const groups = new Map();

  for (const task of tasks) {
    const { id, label, color } = getGroupKey(task, groupBy, statuses, sprintsById);
    if (!groups.has(id)) groups.set(id, { id, label, color, tasks: [] });
    groups.get(id).tasks.push(task);
  }

  return Array.from(groups.values());
}

// ── Column-visibility popover ─────────────────────────────────────────────────
function ColumnToggle({ visible, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded hover:bg-accent transition-colors"
        title="Toggle columns"
      >
        <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg p-2 min-w-[160px]">
            {ALL_COLUMNS.filter((c) => c.id !== "title").map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
              >
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
    { id: null, label: "No grouping" },
    { id: "status", label: "Status" },
    { id: "assignee", label: "Assignee" },
    { id: "priority", label: "Priority" },
    { id: "sprint", label: "Sprint" },
  ];
  const current = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors"
      >
        <ChevronsUpDown className="w-3 h-3 text-muted-foreground" />
        Group: {current?.label || "None"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]">
            {options.map((o) => (
              <button
                key={String(o.id)}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                {o.id === value && <Check className="w-3 h-3 text-primary" />}
                <span className={o.id === value ? "ml-0 font-medium" : "ml-5"}>
                  {o.label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sort header ────────────────────────────────────────────────────────────────
function SortHeader({ label, colId, sorts, onSort }) {
  const sort = sorts.find((s) => s.col === colId);
  return (
    <button
      onClick={(e) => onSort(colId, e.shiftKey)}
      className="flex items-center gap-1 group"
    >
      {label}
      {sort ? (
        sort.dir === "asc" ? (
          <ArrowUp className="w-3 h-3 text-primary" />
        ) : (
          <ArrowDown className="w-3 h-3 text-primary" />
        )
      ) : (
        <ArrowUp className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-opacity" />
      )}
      {sorts.length > 1 && sort && (
        <span className="text-[9px] text-primary font-bold">
          {sorts.findIndex((s) => s.col === colId) + 1}
        </span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ListView({
  tasks = [],
  statuses = [],
  members = [],
  labelsById = {},
  sprintsById = {},
  onTaskClick,
  selectedTaskId,
  selectedIds = new Set(),
  onToggleSelect,
}) {
  const [sorts, setSorts] = useState([]);
  const [groupBy, setGroupBy] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());
  const [visibleCols, setVisibleCols] = useState(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)),
  );

  const handleSort = useCallback((col, multi) => {
    setSorts((prev) => {
      if (multi) {
        const idx = prev.findIndex((s) => s.col === col);
        if (idx === -1) return [...prev, { col, dir: "asc" }];
        if (prev[idx].dir === "asc")
          return prev.map((s, i) => (i === idx ? { ...s, dir: "desc" } : s));
        return prev.filter((_, i) => i !== idx);
      }
      const cur = prev.find((s) => s.col === col && prev.length === 1);
      if (cur) return cur.dir === "asc" ? [{ col, dir: "desc" }] : [];
      return [{ col, dir: "asc" }];
    });
  }, []);

  const toggleCol = (id) =>
    setVisibleCols((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const sortedTasks = useMemo(() => applySort(tasks, sorts, statuses, sprintsById), [tasks, sorts, statuses, sprintsById]);
  const groups = useMemo(
    () => groupTasks(sortedTasks, groupBy, statuses, sprintsById),
    [sortedTasks, groupBy, statuses, sprintsById],
  );

  const visibleColumns = ALL_COLUMNS.filter((c) => visibleCols.has(c.id));
  const TH =
    "px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

  const renderCell = (task, col) => {
    if (col === "title") {
      const p = PRI[task.priority] || PRI.no_priority;
      return (
        <td
          key="title"
          className="pl-4 pr-3 py-2 w-[40%] cursor-pointer"
          onClick={() => onTaskClick(task.id)}
        >
          <div className="flex items-center gap-2 group/title">
            <span
              className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", p.dot)}
            />
            <span className="font-medium text-[13px] line-clamp-1 group-hover/title:text-primary group-hover/title:underline underline-offset-2 transition-colors">
              {task.title}
            </span>
          </div>
        </td>
      );
    }

    if (col === "status") {
      const s = statuses.find(
        (s) => s.id === task.status_id,
      );
      return (
        <td key="status" className="px-3 py-2">
          {s ? (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
              style={{ backgroundColor: s.color + "20", color: s.color }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </td>
      );
    }

    if (col === "priority") {
      const p = PRI[task.priority] || PRI.no_priority;
      const Icon = p.icon;
      return (
        <td key="priority" className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", p.cls)} />
            <span className={cn("text-xs", p.cls)}>{p.label}</span>
          </div>
        </td>
      );
    }

    if (col === "assignee") {
      return (
        <td key="assignee" className="px-3 py-2">
          {task.assignee ? (
            <div className="flex items-center gap-2">
              <Avatar
                name={task.assignee.full_name || task.assignee.email}
                src={task.assignee.avatar}
                size="xs"
              />
              <span className="text-[12px] text-muted-foreground truncate max-w-[100px]">
                {task.assignee.full_name || task.assignee.email}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </td>
      );
    }

    if (col === "due_date") {
      return (
        <td key="due_date" className="px-3 py-2">
          {task.due_date ? (
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground whitespace-nowrap">
              <Calendar className="w-3 h-3 flex-shrink-0" />
              {new Date(task.due_date + "T00:00:00").toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric" },
              )}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </td>
      );
    }

    if (col === "labels") {
      return (
        <td key="labels" className="px-3 py-2 pr-4">
          <div className="flex flex-wrap gap-1">
            {task.label_ids?.map((id) => labelsById[id]).filter(Boolean).map((l) => (
              <span
                key={l.id}
                className="px-1.5 py-0 rounded text-[10px] font-semibold leading-4"
                style={{ backgroundColor: l.color + "22", color: l.color }}
              >
                {l.name}
              </span>
            ))}
          </div>
        </td>
      );
    }


    if (col === "sprint") {
      const sprint = sprintsById[task.sprint_id];
      return (
        <td key="sprint" className="px-3 py-2">
          {sprint ? (
            <span className="text-[11px] text-muted-foreground">
              {sprint.name}
            </span>
          ) : (
            <span className="text-muted-foreground/50 text-xs">—</span>
          )}
        </td>
      );
    }

    return <td key={col} className="px-3 py-2" />;
  };

  const renderRow = (task) => {
    const isSelected = selectedTaskId === task.id;
    const isBulkSelected = selectedIds.has(task.id);
    return (
      <tr
        key={task.id}
        className={cn(
          "transition-colors duration-75",
          isBulkSelected
            ? "bg-primary/[0.08]"
            : isSelected
              ? "bg-primary/5 border-l-2 border-l-primary"
              : "hover:bg-accent/40 bg-card",
        )}
      >
        {onToggleSelect && (
          <td className="pl-3 py-2.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onToggleSelect(task.id)}
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                isBulkSelected
                  ? "bg-primary border-primary"
                  : "border-border hover:border-primary bg-background",
              )}
            >
              {isBulkSelected && (
                <svg
                  className="w-2.5 h-2.5 text-white"
                  viewBox="0 0 10 8"
                  fill="none"
                >
                  <path
                    d="M1 4l3 3 5-6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </td>
        )}
        {visibleColumns.map((c) => renderCell(task, c.id))}
      </tr>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0">
        <GroupByPicker value={groupBy} onChange={setGroupBy} />
        {sorts.length > 0 && (
          <button
            onClick={() => setSorts([])}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear sort
          </button>
        )}
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""}
        </span>
        <ColumnToggle visible={visibleCols} onChange={toggleCol} />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-secondary">
              {onToggleSelect && <th className="w-8 pl-3 py-2" />}
              {visibleColumns.map((c) => (
                <th
                  key={c.id}
                  className={cn(
                    TH,
                    c.id === "title" ? "pl-4 w-[38%]" : "",
                    c.id === "labels" ? "pr-4" : "",
                  )}
                >
                  {c.sortable ? (
                    <SortHeader
                      label={c.label}
                      colId={c.id}
                      sorts={sorts}
                      onSort={handleSort}
                    />
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length + (onToggleSelect ? 1 : 0)}
                  className="px-4 py-14 text-center text-sm text-muted-foreground"
                >
                  No tasks match your filters.
                </td>
              </tr>
            )}
            {groups.map((group) => (
              <>
                {group.label && (
                  <tr
                    key={`grp-${group.id}`}
                    className="bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 select-none"
                    onClick={() =>
                      setCollapsed((prev) => {
                        const n = new Set(prev);
                        n.has(group.id) ? n.delete(group.id) : n.add(group.id);
                        return n;
                      })
                    }
                  >
                    <td
                      colSpan={visibleColumns.length + (onToggleSelect ? 1 : 0)}
                      className="px-4 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {collapsed.has(group.id) ? (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: group.color }}
                        />
                        <span className="text-xs font-semibold text-foreground">
                          {group.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {group.tasks.length}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
                {!collapsed.has(group.id) && group.tasks.map(renderRow)}
              </>
            ))}
          </tbody>

          {/* Footer */}
          {tasks.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/50">
                {onToggleSelect && <td />}
                {visibleColumns.map((c, i) => (
                  <td
                    key={c.id}
                    className={cn(
                      "px-3 py-2 text-[11px] text-muted-foreground",
                      i === 0 ? "pl-4" : "",
                    )}
                  >
                    {i === 0 ? (
                      <span className="font-semibold">
                        {tasks.length} tasks
                      </span>
                    ) : null}
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
