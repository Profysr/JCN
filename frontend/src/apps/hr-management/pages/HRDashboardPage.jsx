import { useParams, Link } from "react-router-dom";
import {
  Users, UserPlus, CalendarDays, Timer, AlertTriangle, Gift, Star,
  Clock, UserCheck, PieChart, Plane,
} from "lucide-react";
import { Loader } from "@/shared/components/ui/Loader";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { useHRDashboard } from "@/apps/hr-management/hooks/useHRDashboard";
import { useWhosOff } from "@/apps/hr-management/hooks/useLeave";
import GettingStartedChecklist from "@/apps/hr-management/components/GettingStartedChecklist";

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMP_TYPE_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contractor: "Contractor",
  intern: "Intern",
};

const LEAVE_TYPE_COLORS = {
  annual:        "bg-indigo-500",
  sick:          "bg-rose-500",
  unpaid:        "bg-zinc-400",
  paternity:     "bg-sky-500",
  maternity:     "bg-pink-500",
  compassionate: "bg-amber-500",
};

function StatCard({ icon: Icon, label, value, sub, iconCls }) {
  return (
    <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
      <div className={cn("p-2.5 rounded-lg", iconCls)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function EventIcon({ type }) {
  if (type === "anniversary") return <Star className="w-4 h-4 text-amber-500" />;
  if (type === "contract_expiry") return <AlertTriangle className="w-4 h-4 text-rose-500" />;
  return <Gift className="w-4 h-4 text-indigo-500" />;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HRDashboardPage() {
  const { workspaceId } = useParams();
  const { data, isLoading, isError } = useHRDashboard(workspaceId);
  const { data: whosOff } = useWhosOff(workspaceId);

  if (isLoading) return <Loader className="h-96" />;
  if (isError) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Failed to load HR dashboard. You may need admin access.
      </div>
    );
  }

  const { headcount, leave_overview, attendance_overview, upcoming_events } = data;

  const totalEmpTypes = Object.values(headcount.employment_split || {}).reduce((a, b) => a + b, 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <GettingStartedChecklist />

      <div>
        <h1 className="text-2xl font-bold">HR Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Workspace people overview</p>
      </div>

      {/* ── Headcount ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          label="Total Employees"
          value={headcount.total}
          iconCls="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
        />
        <StatCard
          icon={UserPlus}
          label="Joiners This Month"
          value={headcount.joiners_this_month}
          iconCls="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
        />
        <SectionCard title="Employment Split" icon={PieChart} className="col-span-2 md:col-span-1">
          {totalEmpTypes === 0 ? (
            <p className="text-sm text-muted-foreground">No profiles configured</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(headcount.employment_split).map(([type, count]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <span className="w-28 text-muted-foreground capitalize">
                    {EMP_TYPE_LABELS[type] ?? type}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-1.5">
                    <div
                      className="bg-indigo-500 h-1.5 rounded-full"
                      style={{ width: `${(count / totalEmpTypes) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Leave & Attendance ── */}
      <div className="grid md:grid-cols-2 gap-4">
        <SectionCard title="Leave Overview — This Month" icon={CalendarDays}>
          <p className="text-3xl font-bold">{leave_overview.total_days_taken}</p>
          <p className="text-xs text-muted-foreground mb-4">total days taken</p>
          {Object.keys(leave_overview.by_type).length === 0 ? (
            <p className="text-xs text-muted-foreground">No approved leave this month</p>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(leave_overview.by_type).map(([type, days]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <div className={cn("w-2 h-2 rounded-full", LEAVE_TYPE_COLORS[type] ?? "bg-muted-foreground")} />
                  <span className="text-muted-foreground capitalize flex-1">{type.replace("_", " ")}</span>
                  <span className="font-medium">{days}d</span>
                </div>
              ))}
            </div>
          )}
          <Link
            to={`/w/${workspaceId}/hr/leave`}
            className="mt-4 block text-xs text-primary hover:underline"
          >
            View leave calendar →
          </Link>
        </SectionCard>

        <SectionCard title="Attendance — Rolling Week" icon={Timer}>
          <p className="text-3xl font-bold">{attendance_overview.on_time_pct}%</p>
          <p className="text-xs text-muted-foreground mb-4">on-time rate</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-muted-foreground flex-1">Late arrivals</span>
              <span className="font-medium">{attendance_overview.late_count}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <UserCheck className="w-4 h-4 text-rose-500" />
              <span className="text-muted-foreground flex-1">Absences</span>
              <span className="font-medium">{attendance_overview.absent_count}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {attendance_overview.period.from} → {attendance_overview.period.to}
          </p>
          <Link
            to={`/w/${workspaceId}/hr/attendance`}
            className="mt-2 block text-xs text-primary hover:underline"
          >
            View full attendance →
          </Link>
        </SectionCard>
      </div>

      {/* ── Who's Off ── */}
      <SectionCard title="Who's Off (today + next 7 days)" icon={Plane}>
        {!whosOff || whosOff.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No one is off this week</p>
        ) : (
          <div className="divide-y -m-5">
            {whosOff.map((off) => (
              <div key={off.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar user={off.employee.user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{off.employee.user.full_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {off.policy_name} · {off.leave_type.replace("_", " ")}
                  </p>
                </div>
                {off.is_today && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                    Today
                  </span>
                )}
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(off.start_date)} → {formatDate(off.end_date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Upcoming Events ── */}
      <SectionCard title="Upcoming Events (next 30 days)" icon={Gift}>
        {upcoming_events.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No upcoming events</p>
        ) : (
          <div className="divide-y -m-5">
            {upcoming_events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <EventIcon type={ev.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{ev.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {ev.type === "anniversary"
                      ? `${ev.years}-year work anniversary`
                      : ev.type === "contract_expiry"
                      ? "Contract expiring"
                      : "Birthday"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(ev.date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
