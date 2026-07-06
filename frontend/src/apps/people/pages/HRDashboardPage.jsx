import { useParams, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  Timer,
  AlertTriangle,
  Gift,
  Star,
  Clock,
  UserCheck,
  PieChart,
} from "lucide-react";
import { Loader } from "@/shared/components/ui/Loader";
import { SectionCard } from "@/shared/components/ui/SectionCard";
import { cn } from "@/shared/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { usePermission } from "@/contexts/PermissionsContext";
import { useHRDashboard } from "@/apps/people/hooks/useHRDashboard";
import GettingStartedChecklist from "@/apps/people/components/GettingStartedChecklist";
import MyOverview from "@/apps/people/components/MyOverview";

function greetingFor(name) {
  const h = new Date().getHours();
  const salutation =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${salutation}, ${name.split(" ")[0]}` : salutation;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const EMP_TYPE_LABELS = {
  full_time: "Full-time",
  part_time: "Part-time",
  contractor: "Contractor",
  intern: "Intern",
};

const LEAVE_TYPE_COLORS = {
  annual: "bg-indigo-500",
  sick: "bg-rose-500",
  unpaid: "bg-zinc-400",
  paternity: "bg-sky-500",
  maternity: "bg-pink-500",
  compassionate: "bg-amber-500",
};

function StatCard({ icon: Icon, label, value, sub, iconCls }) {
  return (
    <div className="bg-card border border-border rounded-md p-4 flex items-start gap-3">
      <div className={cn("p-2 rounded-md", iconCls)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </p>
        <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function EventIcon({ type }) {
  if (type === "anniversary")
    return <Star className="w-4 h-4 text-amber-500" />;
  if (type === "contract_expiry")
    return <AlertTriangle className="w-4 h-4 text-rose-500" />;
  return <Gift className="w-4 h-4 text-indigo-500" />;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HRDashboardPage() {
  const { workspaceId } = useParams();
  const user = useAuthStore((s) => s.user);
  const { isOwner, can } = usePermission();
  const isAdmin = isOwner || can("hr.manage_leave");
  const { data, isLoading, isError } = useHRDashboard(workspaceId, {
    enabled: isAdmin,
  });

  return (
    <div>
      {/* Page header */}
      <div
        data-tour="hr_overview"
        className="border-b border-border bg-card px-6 py-4 flex items-center gap-2"
      >
        <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>

      <div className="p-6 px-3 space-y-2.5">
        {/* Greeting */}
        <div>
          <h2 className="text-xl font-bold">
            {greetingFor(user?.full_name || user?.email)}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here&apos;s your leave, attendance & team overview.
          </p>
        </div>

        <MyOverview />

        {isAdmin && isLoading && <Loader className="h-96" />}
        {isAdmin && isError && (
          <div className="p-8 text-center text-muted-foreground">
            Failed to load workspace overview.
          </div>
        )}
        {isAdmin && data && (
          <AdminOverview data={data} workspaceId={workspaceId} />
        )}
      </div>
    </div>
  );
}

function AdminOverview({ data, workspaceId }) {
  const { headcount, leave_overview, attendance_overview, upcoming_events } =
    data;

  const totalEmpTypes = Object.values(headcount.employment_split || {}).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="space-y-4">
      <GettingStartedChecklist />

      <div>
        <h2 className="text-base font-bold">Workspace Overview</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Headcount, leave & attendance across the workspace
        </p>
      </div>

      {/* ── Headcount ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
        <SectionCard
          title="Employment Split"
          icon={PieChart}
          className="col-span-2 md:col-span-1"
        >
          {totalEmpTypes === 0 ? (
            <p className="text-sm text-muted-foreground">
              No profiles configured
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(headcount.employment_split).map(
                ([type, count]) => (
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
                ),
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Leave & Attendance ── */}
      <div className="grid md:grid-cols-2 gap-3">
        <SectionCard title="Leave Overview — This Month" icon={CalendarDays}>
          <p className="text-2xl font-bold">
            {leave_overview.total_days_taken}
          </p>
          <p className="text-xs text-muted-foreground mb-3">total days taken</p>
          {Object.keys(leave_overview.by_type).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No approved leave this month
            </p>
          ) : (
            <div className="space-y-1.5">
              {Object.entries(leave_overview.by_type).map(([type, days]) => (
                <div key={type} className="flex items-center gap-2 text-sm">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      LEAVE_TYPE_COLORS[type] ?? "bg-muted-foreground",
                    )}
                  />
                  <span className="text-muted-foreground capitalize flex-1">
                    {type.replace("_", " ")}
                  </span>
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
          <p className="text-3xl font-bold">
            {attendance_overview.on_time_pct}%
          </p>
          <p className="text-xs text-muted-foreground mb-4">on-time rate</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-muted-foreground flex-1">
                Late arrivals
              </span>
              <span className="font-medium">
                {attendance_overview.late_count}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <UserCheck className="w-4 h-4 text-rose-500" />
              <span className="text-muted-foreground flex-1">Absences</span>
              <span className="font-medium">
                {attendance_overview.absent_count}
              </span>
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

      {/* ── Upcoming Events ── */}
      <SectionCard title="Upcoming Events (next 30 days)" icon={Gift}>
        {upcoming_events.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No upcoming events
          </p>
        ) : (
          <div className="divide-y -m-4">
            {upcoming_events.map((ev, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
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
