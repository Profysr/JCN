import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LogIn,
  LogOut,
  Clock,
  Users2,
  ArrowRight,
  CalendarDays,
  Timer,
  Network,
  Users,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Avatar } from "@/shared/components/ui/avatar";
import { Loader } from "@/shared/components/ui/Loader";
import { useMyOrgProfile, useOrgChart } from "@/apps/people/hooks/useOrg";
import { useLeaveBalances, useWhosOff } from "@/apps/people/hooks/useLeave";
import {
  useMyAttendance,
  useClockIn,
  useClockOut,
  getGeolocation,
} from "@/apps/people/hooks/useAttendance";
import { getEmploymentLabel } from "@/apps/people/constants";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatShort(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function firstName(user) {
  return (user?.full_name || user?.email || "").split(" ")[0];
}

// ── My Profile widget (identity + clock in/out + leave balance) ─────────────
function MyProfileWidget({ workspaceId, profile, balances }) {
  const navigate = useNavigate();
  const today = todayISO();
  const { data: myAttendance = [] } = useMyAttendance(workspaceId, today, today);
  const clockIn = useClockIn(workspaceId);
  const clockOut = useClockOut(workspaceId);

  const todayRecord = myAttendance[0];
  const isClockedIn = !!todayRecord && !todayRecord.clock_out;
  const user = profile?.member?.user;

  const handleClockIn = async () => {
    const coords = await getGeolocation();
    await clockIn.mutateAsync(coords);
  };

  const handleClockOut = async () => {
    const coords = await getGeolocation();
    await clockOut.mutateAsync(coords);
  };

  return (
    <div className="bg-card border border-border rounded-md shadow-card h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">My Profile</h2>
        {profile?.member?.id && (
          <button
            onClick={() => navigate(`/w/${workspaceId}/people/${profile.member.id}`)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View profile <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <Avatar user={user} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{firstName(user)}</p>
            <p className="text-xs text-muted-foreground truncate">
              {profile?.job_title?.name ??
                (profile?.employment_type
                  ? getEmploymentLabel(profile.employment_type)
                  : "No job title set")}
            </p>
          </div>
        </div>

        {/* Clock in/out */}
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">
              {isClockedIn
                ? `Clocked in since ${new Date(todayRecord.clock_in).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                : "Clocked out"}
            </span>
          </div>
          {isClockedIn ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClockOut}
              disabled={clockOut.isPending}
            >
              <LogOut className="w-3.5 h-3.5 mr-1" /> Clock out
            </Button>
          ) : (
            <Button size="sm" onClick={handleClockIn} disabled={clockIn.isPending}>
              <LogIn className="w-3.5 h-3.5 mr-1" /> Clock in
            </Button>
          )}
        </div>

        {/* Leave balance */}
        <div className="mt-4 pt-4 border-t border-border flex-1">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Leave balance
            </p>
            <button
              onClick={() => navigate(`/w/${workspaceId}/hr/leave`)}
              className="text-xs text-primary hover:underline font-medium"
            >
              Request leave
            </button>
          </div>
          {balances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No leave policy assigned yet
            </p>
          ) : (
            <div className="space-y-2.5">
              {balances.map((b) => {
                const pct = b.total_days > 0 ? (b.remaining_days / b.total_days) * 100 : 0;
                return (
                  <div key={b.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground truncate">{b.policy?.name}</span>
                      <span className="font-medium flex-shrink-0 ml-2">
                        {b.remaining_days}/{b.total_days} days
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Team Absences widget ─────────────────────────────────────────────────────
function TeamAbsencesWidget({ workspaceId, profile }) {
  const navigate = useNavigate();
  const { data: chartData } = useOrgChart(workspaceId);
  const { data: whosOff = [] } = useWhosOff(workspaceId);

  const myTeamIds = useMemo(
    () => new Set((profile?.teams ?? []).map((t) => t.id)),
    [profile],
  );

  const teammateIds = useMemo(() => {
    if (!myTeamIds.size) return new Set();
    const ids = new Set();
    (chartData?.nodes ?? []).forEach((n) => {
      if (n.id === profile?.member?.id) return;
      if (n.teams?.some((t) => myTeamIds.has(t.id))) ids.add(n.id);
    });
    return ids;
  }, [chartData, myTeamIds, profile]);

  const teamAbsences = useMemo(
    () => whosOff.filter((off) => teammateIds.has(off.employee.id)),
    [whosOff, teammateIds],
  );

  return (
    <div className="bg-card border border-border rounded-md shadow-card h-full flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users2 className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Team Absences</h2>
          {teamAbsences.length > 0 && (
            <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
              {teamAbsences.length}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate(`/w/${workspaceId}/hr/leave`)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {!myTeamIds.size ? (
        <div className="flex flex-col items-center justify-center flex-1 py-10 text-center px-6">
          <p className="text-sm text-muted-foreground">
            You&apos;re not part of a team yet.
          </p>
        </div>
      ) : teamAbsences.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-10 text-center px-6">
          <Users2 className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium">Everyone&apos;s in</p>
          <p className="text-xs text-muted-foreground mt-1">
            No one on your team is off today.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 overflow-y-auto max-h-64">
          {teamAbsences.map((off) => (
            <div key={off.id} className="flex items-center gap-2.5 px-5 py-2.5">
              <Avatar user={off.employee.user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {off.employee.user.full_name}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {off.leave_type.replace("_", " ")}
                </p>
              </div>
              {off.is_today && (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 rounded-full px-1.5 py-0.5 flex-shrink-0">
                  Today
                </span>
              )}
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                {formatShort(off.start_date)} → {formatShort(off.end_date)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick Links widget ────────────────────────────────────────────────────────
const QUICK_LINKS = [
  { label: "Employee Hub", desc: "Teams & org chart", icon: Network, path: "people" },
  { label: "Leave", desc: "Requests & balances", icon: CalendarDays, path: "hr/leave" },
  { label: "Attendance", desc: "Clock-in history & hours", icon: Timer, path: "hr/attendance" },
  { label: "Departments", desc: "Company structure", icon: Users, path: "departments" },
];

function QuickLinksWidget({ workspaceId }) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-md shadow-card">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">Quick Links</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-border sm:divide-x">
        {QUICK_LINKS.map(({ label, desc, icon: Icon, path }) => (
          <button
            key={path}
            onClick={() => navigate(`/w/${workspaceId}/${path}`)}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-accent/50 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
              <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                {label}
              </p>
              <p className="text-xs text-muted-foreground truncate">{desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Composed personal overview ───────────────────────────────────────────────
export default function MyOverview() {
  const { workspaceId } = useParams();
  const { data: profile, isLoading: profileLoading } =
    useMyOrgProfile(workspaceId);
  const { data: allBalances = [] } = useLeaveBalances(workspaceId);

  const myBalances = useMemo(
    () =>
      profile?.member?.id
        ? allBalances.filter((b) => b.employee.id === profile.member.id)
        : allBalances,
    [allBalances, profile],
  );

  if (profileLoading) return <Loader className="h-48" />;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
        <div className="lg:col-span-2">
          <MyProfileWidget workspaceId={workspaceId} profile={profile} balances={myBalances} />
        </div>
        <div>
          <TeamAbsencesWidget workspaceId={workspaceId} profile={profile} />
        </div>
      </div>
      <QuickLinksWidget workspaceId={workspaceId} />
    </div>
  );
}
