import { useState, useMemo, useCallback } from "react";
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useUpdateTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

// ── Date helpers ──────────────────────────────────────────────────────────────
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth()    === b.getMonth()
    && a.getDate()     === b.getDate();
}
function isToday(d)                       { return isSameDay(d, new Date()); }
function isCurrentMonth(d, m, y)          { return d.getMonth() === m && d.getFullYear() === y; }
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const start    = new Date(year, month, 1 - firstDay);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
function buildWeekGrid(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0,0,0,0);
  return Array.from({ length: 7 }, (_, i) => addDays(d, i));
}

const DAY_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun",
                      "Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Task chip ─────────────────────────────────────────────────────────────────
function TaskChip({ task, statuses, onTaskClick, onDragStart, onDragEnd, canEdit }) {
  const status = statuses.find(s => s.id === (task.status_detail?.id ?? task.status_id));
  const bg     = status?.color || "#6366f1";
  return (
    <div
      draggable={canEdit}
      onDragStart={canEdit ? e => onDragStart(e, task.id) : undefined}
      onDragEnd={canEdit ? onDragEnd : undefined}
      onClick={e => { e.stopPropagation(); onTaskClick(task.id); }}
      title={task.title}
      className="flex items-center px-1.5 py-[2px] rounded text-[11px] leading-4 font-medium cursor-pointer hover:opacity-80 active:scale-[0.97] transition-all truncate text-white select-none"
      style={{ backgroundColor: bg }}
    >
      <span className="truncate">{task.title}</span>
    </div>
  );
}

// ── Date cell ─────────────────────────────────────────────────────────────────
function DateCell({ date, tasks, statuses, isGhost, isToday: today,
  onTaskClick, onDragStart, onDragEnd, onDrop, onDragOver, onCellClick, canEdit, dropTarget }) {

  const [expanded, setExpanded] = useState(false);
  const MAX = 3;
  const visible  = expanded ? tasks : tasks.slice(0, MAX);
  const overflow = tasks.length - MAX;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => onCellClick(date)}
      className={cn(
        "group flex flex-col gap-0.5 p-1.5 border-r border-b border-border cursor-pointer transition-colors overflow-hidden",
        isGhost  ? "bg-muted/30"  : "bg-card hover:bg-accent/20",
        dropTarget && "ring-2 ring-primary ring-inset bg-primary/5",
      )}
    >
      {/* Date number row */}
      <div className="flex items-start justify-between mb-0.5 flex-shrink-0">
        <span className={cn(
          "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0",
          today    ? "bg-primary text-primary-foreground"
          : isGhost ? "text-muted-foreground/40"
          :           "text-foreground",
        )}>
          {date.getDate()}
        </span>
        {canEdit && !isGhost && (
          <Plus className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity mt-0.5 flex-shrink-0" />
        )}
      </div>

      {/* Task chips */}
      <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
        {visible.map(t => (
          <TaskChip key={t.id} task={t} statuses={statuses}
            onTaskClick={onTaskClick} onDragStart={onDragStart} onDragEnd={onDragEnd} canEdit={canEdit} />
        ))}
        {!expanded && overflow > 0 && (
          <button onClick={e => { e.stopPropagation(); setExpanded(true); }}
            className="text-[10px] text-muted-foreground hover:text-foreground text-left pl-0.5">
            +{overflow} more
          </button>
        )}
        {expanded && overflow > 0 && (
          <button onClick={e => { e.stopPropagation(); setExpanded(false); }}
            className="text-[10px] text-muted-foreground hover:text-foreground text-left pl-0.5">
            Show less
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CalendarView({
  tasks = [], statuses = [],
  onTaskClick, onCreateTask,
  workspaceSlug, projectId, canEdit = false,
}) {
  const [calMode,      setCalMode]      = useState("month");
  const [currentDate,  setCurrentDate]  = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [draggingId,   setDraggingId]   = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [noDueDateOpen,setNoDueDateOpen]= useState(true);

  const updateTask = useUpdateTask(workspaceSlug, projectId);
  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prev = useCallback(() => {
    if (calMode === "month") setCurrentDate(new Date(year, month - 1, 1));
    else if (calMode === "week") setCurrentDate(addDays(currentDate, -7));
    else setCurrentDate(addDays(currentDate, -1));
  }, [calMode, year, month, currentDate]);

  const next = useCallback(() => {
    if (calMode === "month") setCurrentDate(new Date(year, month + 1, 1));
    else if (calMode === "week") setCurrentDate(addDays(currentDate, 7));
    else setCurrentDate(addDays(currentDate, 1));
  }, [calMode, year, month, currentDate]);

  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setCurrentDate(d); };

  const tasksByDate = useMemo(() => {
    const map = {};
    for (const t of tasks) {
      if (!t.due_date) continue;
      if (!map[t.due_date]) map[t.due_date] = [];
      map[t.due_date].push(t);
    }
    return map;
  }, [tasks]);

  const noDueDateTasks = useMemo(() => tasks.filter(t => !t.due_date), [tasks]);

  const handleICalExport = useCallback(() => {
    const url  = `/api/workspaces/${workspaceSlug}/projects/${projectId}/calendar.ics/`;
    const link = document.createElement("a");
    link.href = url; link.download = "calendar.ics";
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  }, [workspaceSlug, projectId]);

  const handleDragStart  = useCallback((e, id) => { e.dataTransfer.effectAllowed = "move"; setDraggingId(id); }, []);
  const handleDragEnd    = useCallback(() => { setDraggingId(null); setDragOverDate(null); }, []);
  const handleDragOver   = useCallback((e, date) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverDate(dateKey(date)); }, []);
  const handleDrop       = useCallback((e, date) => {
    e.preventDefault();
    if (!draggingId || !canEdit) return;
    updateTask.mutate({ taskId: draggingId, due_date: dateKey(date) });
    setDraggingId(null); setDragOverDate(null);
  }, [draggingId, canEdit, updateTask]);
  const handleCellClick  = useCallback((date) => { if (!canEdit) return; onCreateTask(dateKey(date)); }, [canEdit, onCreateTask]);

  const headerTitle = useMemo(() => {
    if (calMode === "month") return `${MONTH_NAMES[month]} ${year}`;
    if (calMode === "week") {
      const days = buildWeekGrid(currentDate);
      const s = days[0], e = days[6];
      return s.getMonth() === e.getMonth()
        ? `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`
        : `${SHORT_MONTHS[s.getMonth()]} ${s.getDate()} – ${SHORT_MONTHS[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
    }
    return `${DAY_LABELS[currentDate.getDay()]}, ${MONTH_NAMES[month]} ${currentDate.getDate()}, ${year}`;
  }, [calMode, month, year, currentDate]);

  // ── Month view ──────────────────────────────────────────────────────────────
  const renderMonth = () => {
    const grid = buildMonthGrid(year, month);
    return (
      // min-h-0 is critical — prevents flex children from overflowing their parent
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Day-of-week header — fixed height, never scrolls */}
        <div className="grid grid-cols-7 border-b border-border flex-shrink-0 bg-muted/30">
          {DAY_LABELS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        {/* 6-row grid — flex-1 fills remaining height; overflow-auto adds scroll if viewport is tiny */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div
            className="grid grid-cols-7 h-full"
            style={{ gridTemplateRows: "repeat(6, minmax(90px, 1fr))" }}
          >
            {grid.map((date, i) => {
              const key   = dateKey(date);
              const ghost = !isCurrentMonth(date, month, year);
              return (
                <DateCell
                  key={i}
                  date={date}
                  tasks={tasksByDate[key] || []}
                  statuses={statuses}
                  isGhost={ghost}
                  isToday={isToday(date)}
                  onTaskClick={onTaskClick}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onDrop={e => handleDrop(e, date)}
                  onDragOver={e => handleDragOver(e, date)}
                  onCellClick={handleCellClick}
                  canEdit={canEdit}
                  dropTarget={dragOverDate === key}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Week view ───────────────────────────────────────────────────────────────
  const renderWeek = () => {
    const days = buildWeekGrid(currentDate);
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-7 border-b border-border flex-shrink-0">
          {days.map((date, i) => (
            <div key={i} className={cn("py-3 text-center border-r border-border last:border-r-0", isToday(date) && "bg-primary/5")}>
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{DAY_LABELS[i]}</span>
              <div className={cn("mx-auto mt-1 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold",
                isToday(date) ? "bg-primary text-primary-foreground" : "text-foreground")}>
                {date.getDate()}
              </div>
            </div>
          ))}
        </div>
        {/* Task columns — scrollable */}
        <div className="flex-1 min-h-0 overflow-auto">
          <div className="grid grid-cols-7 h-full" style={{ gridTemplateRows: "1fr" }}>
            {days.map((date, i) => {
              const key  = dateKey(date);
              const over = dragOverDate === key;
              return (
                <div key={i}
                  className={cn(
                    "border-r border-border last:border-r-0 p-2 flex flex-col gap-1 cursor-pointer min-h-[200px]",
                    isToday(date) ? "bg-primary/5" : "bg-card hover:bg-accent/20",
                    over && canEdit && "ring-2 ring-primary ring-inset bg-primary/5",
                  )}
                  onDragOver={e => handleDragOver(e, date)}
                  onDrop={e => handleDrop(e, date)}
                  onClick={() => handleCellClick(date)}
                >
                  {(tasksByDate[key] || []).map(t => (
                    <TaskChip key={t.id} task={t} statuses={statuses}
                      onTaskClick={onTaskClick} onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd} canEdit={canEdit} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Day view ────────────────────────────────────────────────────────────────
  const renderDay = () => {
    const key      = dateKey(currentDate);
    const dayTasks = tasksByDate[key] || [];
    const over     = dragOverDate === key;
    return (
      <div className="flex-1 min-h-0 overflow-auto p-4">
        <div
          className={cn("rounded-xl border border-border bg-card p-4 min-h-full flex flex-col gap-2",
            over && canEdit && "ring-2 ring-primary")}
          onDragOver={e => handleDragOver(e, currentDate)}
          onDrop={e => handleDrop(e, currentDate)}
          onClick={() => handleCellClick(currentDate)}
        >
          {dayTasks.length === 0
            ? <p className="text-sm text-muted-foreground m-auto">{canEdit ? "Click to add a task on this day" : "No tasks due today"}</p>
            : dayTasks.map(t => (
                <TaskChip key={t.id} task={t} statuses={statuses}
                  onTaskClick={onTaskClick} onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd} canEdit={canEdit} />
              ))}
        </div>
      </div>
    );
  };

  // ── No-due-date shelf ───────────────────────────────────────────────────────
  const renderShelf = () => {
    if (noDueDateTasks.length === 0) return null;
    return (
      <div className="border-t border-border bg-muted/20 flex-shrink-0">
        <button onClick={() => setNoDueDateOpen(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
          {noDueDateOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          No due date · {noDueDateTasks.length} task{noDueDateTasks.length !== 1 ? "s" : ""}
        </button>
        {noDueDateOpen && (
          <div className="px-4 pb-3 flex flex-wrap gap-1.5">
            {noDueDateTasks.map(t => (
              <TaskChip key={t.id} task={t} statuses={statuses}
                onTaskClick={onTaskClick} onDragStart={handleDragStart}
                onDragEnd={handleDragEnd} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={prev} className="p-1 rounded hover:bg-accent transition-colors" aria-label="Previous">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded border border-border hover:bg-accent transition-colors">
            Today
          </button>
          <button onClick={next} className="p-1 rounded hover:bg-accent transition-colors" aria-label="Next">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <span className="text-sm font-semibold text-foreground flex-1">{headerTitle}</span>

        <div className="flex items-center bg-muted rounded-lg p-0.5 text-xs font-medium">
          {["month","week","day"].map(m => (
            <button key={m} onClick={() => setCalMode(m)}
              className={cn("px-2.5 py-1 rounded-md capitalize transition-colors",
                calMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {m}
            </button>
          ))}
        </div>

        <button onClick={handleICalExport} title="Export as iCal (.ics)"
          className="p-1.5 rounded hover:bg-accent transition-colors">
          <Download className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {calMode === "month" && renderMonth()}
      {calMode === "week"  && renderWeek()}
      {calMode === "day"   && renderDay()}

      {renderShelf()}
    </div>
  );
}
