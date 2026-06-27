import { useRef, useState, useEffect } from "react";
import { Calendar, ChevronDown, RefreshCw } from "lucide-react";
import KanbanFilterBar from "@/apps/project-management/components/tasks/FilterBar";

const DATE_PRESETS = [
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
];

function Divider() {
  return <div className="w-px h-5 bg-border flex-shrink-0" />;
}

function CustomDateDropdown({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClose,
}) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1.5 z-50 bg-popover border border-border rounded-lg shadow-md p-3 flex flex-col gap-2.5 min-w-[220px]"
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          Start date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground w-full"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
          End date
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="text-xs bg-background border border-border rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground w-full"
        />
      </div>
    </div>
  );
}

export default function FilterBar({
  activeDays,
  startDate,
  endDate,
  boardId,
  projects,
  refreshing,
  // Kanban-style task filters (search/priority/assignee/type/labels/due)
  kfilters,
  onKFiltersChange,
  members = [],
  labels = [],
  onPresetClick,
  onStartDateChange,
  onEndDateChange,
  onBoardChange,
  onRefresh,
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const customWrapRef = useRef(null);

  const isCustom = activeDays === null;

  function handleCustomClick() {
    setCustomOpen((prev) => !prev);
  }

  function handleStartChange(val) {
    onStartDateChange(val);
  }

  function handleEndChange(val) {
    onEndDateChange(val);
  }

  return (
    <div className="border-b border-border bg-card/60 px-6 py-2.5 flex-shrink-0">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Date presets + Custom */}
        <div className="flex items-center gap-1">
          {DATE_PRESETS.map(({ label, days }) => (
            <button
              key={days}
              onClick={() => {
                onPresetClick(days);
                setCustomOpen(false);
              }}
              className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                activeDays === days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Custom button + dropdown */}
          <div ref={customWrapRef} className="relative">
            <button
              onClick={handleCustomClick}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                isCustom
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Calendar size={11} />
              {isCustom ? `${startDate} — ${endDate}` : "Custom"}
              <ChevronDown
                size={11}
                className={`transition-transform ${customOpen ? "rotate-180" : ""}`}
              />
            </button>

            {customOpen && (
              <CustomDateDropdown
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={handleStartChange}
                onEndDateChange={handleEndChange}
                onClose={() => setCustomOpen(false)}
              />
            )}
          </div>
        </div>

        <Divider />

        {/* Board selector */}
        <div className="relative flex items-center">
          <select
            value={boardId || ""}
            onChange={(e) => onBoardChange(e.target.value || undefined)}
            className="text-xs appearance-none bg-transparent border border-border rounded-md pl-2.5 pr-6 py-1 focus:outline-none focus:ring-1 focus:ring-ring text-foreground cursor-pointer"
          >
            <option value="">All boards</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-1.5 pointer-events-none text-muted-foreground"
          />
        </div>

        <Divider />

        {/* Reused Kanban task filters — search / assignee / priority / type /
            labels / due. `currentUserId`/`onSaveView` omitted so the
            "Pending my approval" toggle and "Save view" are hidden. */}
        <KanbanFilterBar
          filters={kfilters}
          onChange={onKFiltersChange}
          members={members}
          labels={labels}
          inline
        />

        {/* Refresh */}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}
