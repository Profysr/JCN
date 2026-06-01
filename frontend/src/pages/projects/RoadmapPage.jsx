import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useSprints, useUpdateSprint } from "@/hooks/useSprints";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const SPRINT_COLORS = ["#6366f1","#ec4899","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#14b8a6","#ef4444"];

const toDate  = (str) => str ? new Date(str + "T00:00:00") : null;
const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000);
const toISO   = (d) => d.toISOString().split("T")[0];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

export default function RoadmapPage() {
  const { workspaceSlug } = useParams();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/`).then(r => r.data),
    enabled: !!workspaceSlug,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3.5 border-b flex-shrink-0 bg-card/60 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-base">Roadmap</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag sprint bars to move · drag right edge to resize
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {projects.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 text-sm">
            No projects yet.
          </div>
        ) : (
          projects.map((project, pi) => (
            <ProjectRoadmapRow
              key={project.id}
              project={project}
              workspaceSlug={workspaceSlug}
              colorBase={pi}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProjectRoadmapRow({ project, workspaceSlug, colorBase }) {
  const { data: sprints = [] } = useSprints(workspaceSlug, project.id);
  const updateSprint = useUpdateSprint(workspaceSlug, project.id);
  const containerRef = useRef(null);

  // Sticky date range — only ever EXPANDS, never shrinks.
  // This prevents the timeline from jumping when a sprint is dragged to a shorter range.
  const rangeRef = useRef(null);

  const datedSprints = sprints.filter(s => s.start_date && s.end_date);
  if (datedSprints.length === 0 && sprints.length === 0) return null;

  const today = new Date();

  if (datedSprints.length > 0) {
    const allDates = datedSprints.flatMap(s => [toDate(s.start_date), toDate(s.end_date)]);
    const rawMin = new Date(Math.min(...allDates.map(d => d.getTime())));
    const rawMax = new Date(Math.max(...allDates.map(d => d.getTime())));
    // Pad 1 month before the first sprint and 2 months after the last sprint
    const paddedMin = new Date(rawMin.getFullYear(), rawMin.getMonth() - 1, 1);
    const paddedMax = new Date(rawMax.getFullYear(), rawMax.getMonth() + 2, 0);

    if (!rangeRef.current) {
      rangeRef.current = { minDate: paddedMin, maxDate: paddedMax };
    } else {
      if (paddedMin < rangeRef.current.minDate) rangeRef.current.minDate = paddedMin;
      if (paddedMax > rangeRef.current.maxDate) rangeRef.current.maxDate = paddedMax;
    }
  }

  const minDate = rangeRef.current?.minDate ?? new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const maxDate = rangeRef.current?.maxDate ?? new Date(today.getFullYear(), today.getMonth() + 3, 0);
  const totalDays = Math.max(daysBetween(minDate, maxDate), 1);

  // Month header segments
  const months = [];
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    const daysInMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const segStart = Math.max(daysBetween(minDate, cur), 0);
    const segEnd   = Math.min(segStart + daysInMonth, totalDays);
    months.push({
      label: `${MONTH_LABELS[cur.getMonth()]} ${cur.getFullYear()}`,
      left: segStart / totalDays * 100,
      width: (segEnd - segStart) / totalDays * 100,
    });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  // Today line
  const todayPct = daysBetween(minDate, today) / totalDays * 100;

  const handleSaveDates = (sprintId, newStart, newEnd) => {
    if (newEnd <= newStart) return;
    updateSprint.mutate({ sprintId, start_date: toISO(newStart), end_date: toISO(newEnd) });
  };

  if (datedSprints.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-semibold mb-0.5">{project.name}</p>
        <p className="text-xs text-muted-foreground">
          No sprints with dates yet. Add start/end dates to sprints from the project board.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
        {project.name}
      </p>
      <div className="border rounded-lg overflow-hidden select-none bg-card">
        {/* Month header */}
        <div className="relative h-8 border-b bg-secondary/60">
          {months.map((m, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-center px-2 border-r last:border-r-0 text-[11px] text-muted-foreground font-semibold overflow-hidden"
              style={{ left: `${m.left}%`, width: `${m.width}%` }}
            >
              {m.label}
            </div>
          ))}
          {todayPct >= 0 && todayPct <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/50 pointer-events-none"
              style={{ left: `${todayPct}%` }}
            />
          )}
        </div>

        {/* Sprint rows */}
        <div className="px-3 py-3 space-y-2 relative" ref={containerRef} data-roadmap-container>
          {/* Today line */}
          {todayPct >= 0 && todayPct <= 100 && (
            <div
              className="absolute top-0 bottom-0 w-px bg-red-500/25 pointer-events-none z-10"
              style={{ left: `calc(${todayPct}% + 12px)` }}
            >
              <span className="absolute top-1 -translate-x-1/2 text-[9px] text-red-500 font-bold tracking-wide">
                TODAY
              </span>
            </div>
          )}

          {datedSprints.map((sprint, si) => {
            const start    = toDate(sprint.start_date);
            const end      = toDate(sprint.end_date);
            const leftPct  = daysBetween(minDate, start) / totalDays * 100;
            const widthPct = Math.max(daysBetween(start, end) / totalDays * 100, 1.5);
            const color    = SPRINT_COLORS[(colorBase + si) % SPRINT_COLORS.length];
            const opacity  = sprint.status === "planning" ? 0.5 : sprint.status === "completed" ? 0.65 : 1;

            return (
              <div key={sprint.id} className="relative h-7">
                <SprintBar
                  sprint={sprint}
                  left={leftPct}
                  width={widthPct}
                  color={color}
                  opacity={opacity}
                  totalDays={totalDays}
                  minDate={minDate}
                  containerRef={containerRef}
                  onSaveDates={handleSaveDates}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SprintBar({ sprint, left, width, color, opacity, totalDays, minDate, containerRef, onSaveDates }) {
  const posRef = useRef({ left, width });
  const [rendering, setRendering] = useState({ left, width });
  const [dragging, setDragging] = useState(false);
  const [tooltip, setTooltip] = useState(false);

  // Keep posRef in sync when props change (e.g. after save)
  if (!dragging) {
    posRef.current = { left, width };
    if (rendering.left !== left || rendering.width !== width) {
      setRendering({ left, width });
    }
  }

  const startDrag = (e, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    setTooltip(false);

    const startX = e.clientX;
    const startLeft  = posRef.current.left;
    const startWidth = posRef.current.width;
    const containerW = containerRef.current?.getBoundingClientRect().width || 1;

    const onMove = (e) => {
      const deltaPct = (e.clientX - startX) / containerW * 100;
      let newLeft  = startLeft;
      let newWidth = startWidth;

      if (mode === "move") {
        newLeft  = Math.max(0, Math.min(100 - startWidth, startLeft + deltaPct));
      } else {
        newWidth = Math.max(2, startWidth + deltaPct);
      }

      posRef.current = { left: newLeft, width: newWidth };
      setRendering({ left: newLeft, width: newWidth });
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setDragging(false);

      const newStartDay = Math.round(posRef.current.left  * totalDays / 100);
      const newEndDay   = Math.round((posRef.current.left + posRef.current.width) * totalDays / 100);
      onSaveDates(sprint.id, addDays(minDate, newStartDay), addDays(minDate, newEndDay));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const STATUS_LABELS = { planning: "Planning", active: "Active", completed: "Completed" };

  return (
    <div
      className="absolute top-0 h-7 rounded flex items-center text-white text-xs font-medium group"
      style={{
        left:   `${rendering.left}%`,
        width:  `${rendering.width}%`,
        backgroundColor: color,
        opacity,
        cursor: dragging ? "grabbing" : "grab",
        transition: dragging ? "none" : "left 0.15s, width 0.15s",
        zIndex: dragging ? 20 : 1,
      }}
      onMouseDown={(e) => startDrag(e, "move")}
      onMouseEnter={() => !dragging && setTooltip(true)}
      onMouseLeave={() => setTooltip(false)}
    >
      {/* Bar content */}
      <span className="flex-1 truncate px-2.5 pointer-events-none">{sprint.name}</span>
      <span className="opacity-75 flex-shrink-0 text-[10px] pr-5 pointer-events-none">
        {sprint.completed_count}/{sprint.task_count}
      </span>

      {/* Resize handle (right edge) */}
      <div
        className="absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, "resize"); }}
      >
        <div className="w-0.5 h-4 bg-white/60 rounded-full" />
        <div className="w-0.5 h-4 bg-white/60 rounded-full ml-0.5" />
      </div>

      {/* Tooltip */}
      {tooltip && !dragging && (
        <div className="absolute left-0 bottom-full mb-1.5 z-30 bg-popover border rounded-md shadow-lg px-3 py-2 min-w-[160px] pointer-events-none">
          <p className="text-xs font-semibold text-foreground">{sprint.name}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {sprint.start_date} → {sprint.end_date}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {sprint.completed_count}/{sprint.task_count} tasks · {STATUS_LABELS[sprint.status]}
          </p>
        </div>
      )}
    </div>
  );
}
