import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  LogIn,
  LogOut,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Users,
  Download,
  Timer,
  Calendar,
  BarChart3,
  Settings2,
  MapPin,
  MapPinOff,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import { Avatar } from "@/shared/components/ui/avatar";
import Modal from "@/shared/components/ui/Modal";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { cn } from "@/shared/lib/utils";
import { usePermission } from "@/contexts/PermissionsContext";
import {
  useAttendancePolicy,
  useUpdateAttendancePolicy,
  useClockIn,
  useClockOut,
  useMyAttendance,
  useAttendanceList,
  getGeolocation,
} from "@/apps/people/hooks/useAttendance";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toIso(d) {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(year, month) {
  return new Date(year, month, 1);
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Mon=0 … Sun=6 (ISO weekday offset)
function isoWeekday(d) {
  return (d.getDay() + 6) % 7;
}

function weekRange(offsetWeeks = 0) {
  const today = new Date();
  const day = isoWeekday(today);
  const mon = new Date(today);
  mon.setDate(today.getDate() - day + offsetWeeks * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: toIso(mon), to: toIso(sun), mon, sun };
}

function monthRange(year, month) {
  const from = toIso(new Date(year, month, 1));
  const to = toIso(new Date(year, month + 1, 0));
  return { from, to };
}

function fmt12(timeStr) {
  if (!timeStr) return "—";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  on_time: {
    label: "On Time",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-700 dark:text-emerald-300",
    cell: "bg-emerald-400",
    icon: CheckCircle2,
  },
  late: {
    label: "Late",
    bg: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-700 dark:text-amber-300",
    cell: "bg-amber-400",
    icon: AlertCircle,
  },
  absent: {
    label: "Absent",
    bg: "bg-rose-100 dark:bg-rose-900/30",
    text: "text-rose-700 dark:text-rose-300",
    cell: "bg-rose-300",
    icon: XCircle,
  },
  weekend: {
    label: "Weekend",
    bg: "bg-zinc-100 dark:bg-zinc-800",
    text: "text-zinc-400",
    cell: "bg-zinc-100 dark:bg-zinc-800",
    icon: null,
  },
  future: {
    label: "—",
    bg: "bg-transparent",
    text: "text-zinc-300",
    cell: "bg-zinc-100/50 dark:bg-zinc-800/30",
    icon: null,
  },
};

function StatusChip({ s, small }) {
  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.future;
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        small ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        cfg.bg,
        cfg.text,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

// ── Attendance Calendar ───────────────────────────────────────────────────────

function AttendanceCalendar({ records }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const recordMap = useMemo(() => {
    const m = {};
    (records ?? []).forEach((r) => {
      m[r.date] = r;
    });
    return m;
  }, [records]);

  const { from: _from, to: _to } = monthRange(year, month);

  const firstDay = isoWeekday(startOfMonth(year, month));
  const totalDays = daysInMonth(year, month);
  const todayIso = toIso(today);

  function cellStatus(dayNum) {
    const iso = toIso(new Date(year, month, dayNum));
    const wd = isoWeekday(new Date(year, month, dayNum));
    if (wd >= 5) return { iso, status: "weekend", rec: null };
    if (iso > todayIso) return { iso, status: "future", rec: null };
    const rec = recordMap[iso];
    if (!rec) return { iso, status: "absent", rec: null };
    return { iso, status: rec.status, rec };
  }

  function prevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else setMonth((m) => m + 1);
  }

  const cells = [];
  // leading blanks
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-muted">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-medium text-sm">
          {MONTH_NAMES[month]} {year}
        </span>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="text-center text-xs text-muted-foreground font-medium py-1"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((dayNum, i) => {
          if (!dayNum) return <div key={`blank-${i}`} />;
          const { iso, status, rec } = cellStatus(dayNum);
          const cfg = STATUS_CONFIG[status];
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              title={
                rec
                  ? `${fmt12(rec.clock_in)} → ${fmt12(rec.clock_out)}${rec.total_hours ? ` (${rec.total_hours}h)` : ""}`
                  : cfg.label
              }
              className={cn(
                "relative flex items-center justify-center rounded text-xs font-medium h-8 cursor-default",
                cfg.bg,
                cfg.text,
                isToday && "ring-2 ring-primary ring-offset-1",
              )}
            >
              {dayNum}
              {rec?.clock_in && !rec.clock_out && (
                <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
        {["on_time", "late", "absent", "weekend"].map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "h-3 w-3 rounded-sm inline-block",
                STATUS_CONFIG[s].cell,
              )}
            />
            {STATUS_CONFIG[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Weekly Bar Chart ──────────────────────────────────────────────────────────

function WeeklyChart({ records, expectedHours, weekOffset, setWeekOffset }) {
  const { mon } = weekRange(weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toIso(d);
  });

  const recordMap = useMemo(() => {
    const m = {};
    (records ?? []).forEach((r) => {
      m[r.date] = r;
    });
    return m;
  }, [records]);

  const dailyExpected = expectedHours / 5; // spread across Mon–Fri
  const maxH = Math.max(dailyExpected * 1.5, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="p-1 rounded hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium">
          {MONTH_NAMES[mon.getMonth()].slice(0, 3)} {mon.getDate()} —{" "}
          {(() => {
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            return `${MONTH_NAMES[sun.getMonth()].slice(0, 3)} ${sun.getDate()}`;
          })()}
        </span>
        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          className="p-1 rounded hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-end gap-1.5 h-28">
        {days.map((iso, i) => {
          const rec = recordMap[iso];
          const hours = rec?.total_hours ?? 0;
          const isWeekend = i >= 5;
          const isPast = iso <= toIso(new Date());
          const barPct = Math.min((hours / maxH) * 100, 100);
          const expPct = Math.min((dailyExpected / maxH) * 100, 100);
          const status = rec?.status;

          return (
            <div key={iso} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground font-medium">
                {hours > 0 ? `${hours}h` : ""}
              </span>
              <div className="relative w-full flex-1 flex items-end">
                {/* expected marker */}
                {!isWeekend && (
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-zinc-300 dark:border-zinc-600"
                    style={{ bottom: `${expPct}%` }}
                  />
                )}
                {/* actual bar */}
                <div
                  className={cn(
                    "w-full rounded-t transition-all",
                    isWeekend
                      ? "bg-zinc-100 dark:bg-zinc-800"
                      : status === "on_time"
                        ? "bg-emerald-400 dark:bg-emerald-500"
                        : status === "late"
                          ? "bg-amber-400 dark:bg-amber-500"
                          : isPast && !isWeekend
                            ? "bg-rose-200 dark:bg-rose-900/30"
                            : "bg-zinc-100 dark:bg-zinc-800",
                  )}
                  style={{ height: isWeekend || !hours ? "4px" : `${barPct}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {DAY_NAMES[i]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-zinc-400" />
          Expected ({dailyExpected}h/day)
        </span>
      </div>
    </div>
  );
}

// ── Admin Attendance Grid ─────────────────────────────────────────────────────

function AdminGrid({ workspaceId }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const { from, to, mon } = weekRange(weekOffset);

  const { data: records = [], isLoading } = useAttendanceList(workspaceId, {
    dateFrom: from,
    dateTo: to,
  });

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return { iso: toIso(d), label: DAY_NAMES[i], d };
  });

  // Group by employee
  const employees = useMemo(() => {
    const byEmp = {};
    records.forEach((r) => {
      const id = r.employee.id;
      if (!byEmp[id]) byEmp[id] = { employee: r.employee, byDate: {} };
      byEmp[id].byDate[r.date] = r;
    });
    return Object.values(byEmp);
  }, [records]);

  function exportCSV() {
    const header = ["Employee", ...days.map((d) => d.iso), "Total Hours"].join(
      ",",
    );
    const rows = employees.map(({ employee, byDate }) => {
      const name = employee.user.full_name;
      const cols = days.map(({ iso }) => {
        const r = byDate[iso];
        if (!r) return "";
        return r.total_hours ?? (r.clock_in ? `${r.clock_in}–` : "");
      });
      const total = days.reduce(
        (sum, { iso }) => sum + (byDate[iso]?.total_hours ?? 0),
        0,
      );
      return [name, ...cols, total.toFixed(1)].join(",");
    });
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded hover:bg-muted border"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium min-w-[160px] text-center">
            {MONTH_NAMES[mon.getMonth()].slice(0, 3)} {mon.getDate()} —{" "}
            {(() => {
              const sun = new Date(mon);
              sun.setDate(mon.getDate() + 6);
              return `${MONTH_NAMES[sun.getMonth()].slice(0, 3)} ${sun.getDate()}, ${sun.getFullYear()}`;
            })()}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1.5 rounded hover:bg-muted border"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <Button size="sm" variant="ghost" onClick={() => setWeekOffset(0)}>
            This week
          </Button>
        </div>
        <Button size="sm" variant="outline" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1.5" />
          Export CSV
        </Button>
      </div>

      {isLoading ? (
        <Loader className="h-32" />
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          No attendance records for this week.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-3 font-medium text-muted-foreground min-w-[160px]">
                  Employee
                </th>
                {days.map(({ iso, label, d }) => (
                  <th
                    key={iso}
                    className={cn(
                      "py-2 px-2 text-center font-medium text-xs min-w-[72px]",
                      isoWeekday(d) >= 5
                        ? "text-zinc-400"
                        : "text-muted-foreground",
                    )}
                  >
                    <div>{label}</div>
                    <div className="font-normal text-[10px]">{d.getDate()}</div>
                  </th>
                ))}
                <th className="py-2 px-3 text-right font-medium text-muted-foreground min-w-[72px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map(({ employee, byDate }) => {
                const weekTotal = days.reduce(
                  (sum, { iso }) => sum + (byDate[iso]?.total_hours ?? 0),
                  0,
                );
                return (
                  <tr
                    key={employee.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="py-2.5 px-3">
                      <Link
                        to={`/w/${workspaceId}/people/${employee.id}`}
                        className="flex items-center gap-2 group/link"
                      >
                        <Avatar
                          user={employee.user}
                          size="sm"
                          className="h-7 w-7 text-xs"
                        />
                        <span className="font-medium text-sm truncate max-w-[120px] group-hover/link:text-primary group-hover/link:underline">
                          {employee.user.full_name}
                        </span>
                      </Link>
                    </td>
                    {days.map(({ iso, d }) => {
                      const rec = byDate[iso];
                      const isWeekend = isoWeekday(d) >= 5;
                      const isPast = iso <= toIso(new Date());
                      return (
                        <td
                          key={iso}
                          title={
                            rec
                              ? `In: ${fmt12(rec.clock_in)} · Out: ${fmt12(rec.clock_out)}`
                              : undefined
                          }
                          className={cn(
                            "py-2 px-2 text-center",
                            isWeekend && "bg-zinc-50 dark:bg-zinc-900/20",
                          )}
                        >
                          {isWeekend ? (
                            <span className="text-xs text-zinc-300">—</span>
                          ) : rec ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <div className="flex items-center gap-1">
                                <StatusChip s={rec.status} small />
                                {(rec.clock_in_outside_geofence ||
                                  rec.clock_out_outside_geofence) && (
                                  <MapPinOff className="h-3 w-3 text-amber-500" />
                                )}
                              </div>
                              {rec.total_hours != null && (
                                <span className="text-[10px] text-muted-foreground">
                                  {rec.total_hours}h
                                </span>
                              )}
                            </div>
                          ) : isPast ? (
                            <StatusChip s="absent" small />
                          ) : (
                            <span className="text-xs text-zinc-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 px-3 text-right font-medium text-sm">
                      {weekTotal > 0 ? `${weekTotal.toFixed(1)}h` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Policy Settings Modal ─────────────────────────────────────────────────────

function PolicyModal({ policy, workspaceId, onClose }) {
  const [form, setForm] = useState({
    work_start_time: policy?.work_start_time ?? "09:00",
    work_end_time: policy?.work_end_time ?? "17:00",
    grace_period_minutes: policy?.grace_period_minutes ?? 15,
    weekly_hours: policy?.weekly_hours ?? 40,
    geofence_enabled: policy?.geofence_enabled ?? false,
    geofence_radius_meters: policy?.geofence_radius_meters ?? 500,
  });

  const update = useUpdateAttendancePolicy(workspaceId);

  function handleSave() {
    update.mutate(form, { onSuccess: onClose });
  }

  return (
    <Modal
      isOpen
      title="Attendance Policy"
      onClose={onClose}
      showFooter={false}
    >
      <div className="flex flex-col gap-4 p-1">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Work Start
            </span>
            <input
              type="time"
              className="input border rounded px-3 py-1.5 text-sm bg-background"
              value={form.work_start_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, work_start_time: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Work End
            </span>
            <input
              type="time"
              className="input border rounded px-3 py-1.5 text-sm bg-background"
              value={form.work_end_time}
              onChange={(e) =>
                setForm((f) => ({ ...f, work_end_time: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Grace Period (minutes)
            </span>
            <input
              type="number"
              min="0"
              max="120"
              className="input border rounded px-3 py-1.5 text-sm bg-background"
              value={form.grace_period_minutes}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  grace_period_minutes: Number(e.target.value),
                }))
              }
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Weekly Hours
            </span>
            <input
              type="number"
              min="1"
              max="80"
              className="input border rounded px-3 py-1.5 text-sm bg-background"
              value={form.weekly_hours}
              onChange={(e) =>
                setForm((f) => ({ ...f, weekly_hours: Number(e.target.value) }))
              }
            />
          </label>
        </div>

        <div className="border-t pt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.geofence_enabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, geofence_enabled: e.target.checked }))
              }
              className="h-4 w-4 rounded border-input"
            />
            <span className="text-sm text-foreground">
              Flag clock-ins outside expected work location
            </span>
          </label>
          <p className="text-xs text-muted-foreground -mt-2">
            Compares clock-in/out coordinates against each employee&apos;s
            profile location. Never blocks — HR is notified, that&apos;s all.
          </p>
          {form.geofence_enabled && (
            <label className="flex flex-col gap-1 max-w-[220px]">
              <span className="text-xs font-medium text-muted-foreground">
                Radius (meters)
              </span>
              <input
                type="number"
                min="10"
                max="50000"
                className="input border rounded px-3 py-1.5 text-sm bg-background"
                value={form.geofence_radius_meters}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    geofence_radius_meters: Number(e.target.value),
                  }))
                }
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: "my", label: "My Attendance", icon: Clock },
  { key: "grid", label: "Team Grid", icon: Users },
];

export default function AttendancePage() {
  const { workspaceId } = useParams();
  const { isOwner, can, hasAppAccess } = usePermission();

  const [tab, setTab] = useState("my");
  const [chartWeekOffset, setChartWeekOffset] = useState(0);
  const [showPolicy, setShowPolicy] = useState(false);

  const isAdmin = isOwner || can("hr.manage_attendance");

  // Fetch policy
  const { data: policy } = useAttendancePolicy(workspaceId);

  // Fetch my attendance — current month
  const today = new Date();
  const { from: calFrom, to: calTo } = useMemo(
    () => monthRange(today.getFullYear(), today.getMonth()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { data: myRecords = [], isLoading: myLoading } = useMyAttendance(
    workspaceId,
    calFrom,
    calTo,
  );

  // Chart data — selected week
  const { from: chartFrom, to: chartTo } = useMemo(
    () => weekRange(chartWeekOffset),
    [chartWeekOffset],
  );
  const { data: chartRecords = [] } = useMyAttendance(
    workspaceId,
    chartFrom,
    chartTo,
  );

  // Today's record
  const todayIso = toIso(today);
  const todayRecord = myRecords.find((r) => r.date === todayIso);

  const clockIn = useClockIn(workspaceId);
  const clockOut = useClockOut(workspaceId);

  if (!isOwner && !hasAppAccess("people")) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
        <Timer className="h-12 w-12 text-muted-foreground/40" />
        <div>
          <p className="text-lg font-semibold">No access to HR Management</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your role doesn&apos;t grant access to attendance tracking.
          </p>
        </div>
      </div>
    );
  }

  const isClockedIn = !!todayRecord?.clock_in;
  const isClockedOut = !!todayRecord?.clock_out;

  async function handleClockIn() {
    const coords = await getGeolocation();
    clockIn.mutate(coords);
  }

  async function handleClockOut() {
    const coords = await getGeolocation();
    clockOut.mutate(coords);
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-xl font-semibold">Attendance</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track daily clock-ins and team hours
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPolicy(true)}
            >
              <Settings2 className="h-4 w-4 mr-1.5" />
              Policy
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      {isAdmin && (
        <div className="flex border-b px-6 shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors",
                tab === key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        {tab === "my" && (
          <div className="max-w-4xl mx-auto flex flex-col gap-6">
            {/* Clock In/Out card */}
            <div className="rounded-xl border bg-card p-6">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Big button */}
                <div
                  data-tour="record_attendance"
                  className="flex flex-col items-center gap-3 sm:w-48 shrink-0"
                >
                  {!isClockedIn ? (
                    <Button
                      size="lg"
                      className="h-16 w-40 text-base gap-2 rounded-xl"
                      onClick={handleClockIn}
                      disabled={clockIn.isPending}
                    >
                      <LogIn className="h-5 w-5" />
                      {clockIn.isPending ? "Clocking in…" : "Clock In"}
                    </Button>
                  ) : !isClockedOut ? (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="h-16 w-40 text-base gap-2 rounded-xl"
                      onClick={handleClockOut}
                      disabled={clockOut.isPending}
                    >
                      <LogOut className="h-5 w-5" />
                      {clockOut.isPending ? "Clocking out…" : "Clock Out"}
                    </Button>
                  ) : (
                    <div className="h-16 w-40 rounded-xl bg-muted flex flex-col items-center justify-center gap-1">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                      <span className="text-sm font-medium">
                        Done for today
                      </span>
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date().toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                {/* Daily status strip */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-4 w-full">
                  {[
                    {
                      label: "Clock In",
                      value: fmt12(todayRecord?.clock_in),
                      icon: LogIn,
                    },
                    {
                      label: "Clock Out",
                      value: fmt12(todayRecord?.clock_out),
                      icon: LogOut,
                    },
                    {
                      label: "Total Hours",
                      value:
                        todayRecord?.total_hours != null
                          ? `${todayRecord.total_hours}h`
                          : "—",
                      icon: Timer,
                    },
                    {
                      label: "Status",
                      value: (
                        <StatusChip
                          s={
                            todayRecord?.status ??
                            (isClockedIn && !isClockedOut ? "in_progress" : "—")
                          }
                          small
                        />
                      ),
                      icon: BarChart3,
                    },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                      <span className="text-sm font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {(todayRecord?.clock_in_outside_geofence ||
                todayRecord?.clock_out_outside_geofence) && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mt-3">
                  <MapPinOff className="h-3.5 w-3.5" />
                  {todayRecord?.clock_in_outside_geofence &&
                  todayRecord?.clock_out_outside_geofence
                    ? "Clock in and out were both outside the expected work location."
                    : todayRecord?.clock_in_outside_geofence
                      ? "Clock in was outside the expected work location."
                      : "Clock out was outside the expected work location."}
                </p>
              )}

              {clockIn.error && (
                <p className="text-xs text-rose-500 mt-3">
                  {clockIn.error.message}
                </p>
              )}
              {clockOut.error && (
                <p className="text-xs text-rose-500 mt-3">
                  {clockOut.error.message}
                </p>
              )}
            </div>

            {/* Calendar + Chart row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <SectionCard title="Monthly Overview" icon={Calendar}>
                {myLoading ? (
                  <Loader className="h-48" />
                ) : (
                  <AttendanceCalendar records={myRecords} />
                )}
              </SectionCard>

              <SectionCard title="Weekly Hours" icon={BarChart3}>
                <WeeklyChart
                  records={chartRecords}
                  expectedHours={policy?.weekly_hours ?? 40}
                  weekOffset={chartWeekOffset}
                  setWeekOffset={setChartWeekOffset}
                />
              </SectionCard>
            </div>
          </div>
        )}

        {tab === "grid" && isAdmin && (
          <div className="max-w-6xl mx-auto">
            <SectionCard title="Team Attendance Grid" icon={Users}>
              <AdminGrid workspaceId={workspaceId} isAdmin={isAdmin} />
            </SectionCard>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showPolicy && policy && (
        <PolicyModal
          policy={policy}
          workspaceId={workspaceId}
          onClose={() => setShowPolicy(false)}
        />
      )}
    </div>
  );
}
