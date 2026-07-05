import { useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Briefcase,
  Building2,
  Users2,
  MapPin,
  Calendar,
  Hash,
  User,
  Users,
} from "lucide-react";
import Modal from "@/shared/components/ui/Modal";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import { ShortcutTooltip } from "@/shared/components/ui/ShortcutTooltip";
import { cn } from "@/shared/lib/utils";
import {
  ONBOARDING_STATUS,
  PROFILE_STATUS_CONFIG,
  getEmploymentLabel,
  formatDate,
} from "@/apps/people/constants";

// ── Small presentational atoms ────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/30">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2 border-b border-border/40 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

function Chip({ label, color, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium",
        className,
      )}
      style={color ? { backgroundColor: `${color}18`, color } : undefined}
    >
      {label}
    </span>
  );
}

// ── Profile body (the scrollable content) ────────────────────────────────────
function ProfileBody({ profile }) {
  const member = profile.member;
  const user = member?.user;
  const statusCfg =
    PROFILE_STATUS_CONFIG[profile.status] ??
    PROFILE_STATUS_CONFIG[ONBOARDING_STATUS.DRAFT];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Hero */}
      <div className="border-b border-border/60">
        <div className="h-20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
        <div className="px-6 pb-5">
          <div className="-mt-8 mb-3 flex items-end justify-between">
            <Avatar
              user={user}
              name={user?.full_name || user?.email}
              size="xl"
              className="ring-4 ring-background rounded-full"
            />
            <span
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold",
                statusCfg.className,
              )}
            >
              {statusCfg.label}
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-tight">
            {user?.full_name || user?.email}
          </h2>
          {profile.job_title && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {profile.job_title.name}
              {profile.job_title.level > 0 && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                  L{profile.job_title.level}
                </span>
              )}
            </p>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>

          <div className="flex flex-wrap gap-2 mt-3">
            {profile.employment_type && (
              <Chip
                label={getEmploymentLabel(profile.employment_type)}
                className="bg-muted text-muted-foreground"
              />
            )}
            {profile.location && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {profile.location}
              </span>
            )}
            {profile.start_date && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3" />
                Joined {formatDate(profile.start_date)}
              </span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <SectionCard title="Reports to" icon={User}>
            {profile.manager ? (
              <div className="flex items-center gap-2">
                <Avatar
                  user={{
                    full_name: profile.manager.name,
                    email: profile.manager.email,
                  }}
                  name={profile.manager.name || profile.manager.email}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {profile.manager.name || profile.manager.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {profile.manager.email}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No manager set
              </p>
            )}
          </SectionCard>

          {profile.direct_reports_count > 0 && (
            <SectionCard title="Direct Reports" icon={Users}>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">
                  {profile.direct_reports_count}
                </span>
                <span className="text-sm text-muted-foreground">
                  {profile.direct_reports_count === 1 ? "person" : "people"}{" "}
                  reporting to them
                </span>
              </div>
            </SectionCard>
          )}

          <SectionCard title="Employment" icon={Briefcase}>
            <DetailRow
              label="Type"
              value={getEmploymentLabel(profile.employment_type)}
            />
            <DetailRow label="Employee ID" value={profile.employee_id || null} />
            <DetailRow label="Start date" value={formatDate(profile.start_date)} />
            <DetailRow label="Location" value={profile.location || null} />
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="sm:col-span-2 flex flex-col gap-4">
          <SectionCard title="Departments" icon={Building2}>
            {profile.departments?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.departments.map((d) => (
                  <Chip key={d.id} label={d.name} color={d.color} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Not in any department
              </p>
            )}
          </SectionCard>

          <SectionCard title="Teams" icon={Users2}>
            {profile.teams?.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.teams.map((t) => (
                  <Chip key={t.id} label={t.name} color={t.color} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Not in any team
              </p>
            )}
          </SectionCard>

          <SectionCard title="Submission Details" icon={Hash}>
            <DetailRow
              label="Submitted"
              value={formatDate(profile.submitted_at)}
            />
            <DetailRow
              label="Employee ID"
              value={profile.employee_id || null}
            />
            <DetailRow label="Workspace role" value={member?.role} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function PendingProfileModal({
  profiles,
  index,
  onClose,
  onNavigate,
  onApprove,
  isApproving,
}) {
  const profile = profiles[index];
  const total = profiles.length;
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  // Keyboard shortcuts: ← → navigate · Enter approve · Esc close (Esc is handled by Modal)
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "ArrowLeft" && hasPrev) { onNavigate(index - 1); return; }
      if (e.key === "ArrowRight" && hasNext) { onNavigate(index + 1); return; }
      if (e.key === "Enter" && !isApproving) { onApprove(profile?.id); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, hasPrev, hasNext, isApproving, profile?.id, onNavigate, onApprove]);

  const handleApprove = async () => {
    await onApprove(profile.id);
    // Auto-advance after approval; after the list shrinks this index may now
    // point to the next person. If the list is now empty, onClose is called
    // by the parent page when profiles.length reaches 0.
    if (!hasNext) onClose();
  };

  return (
    <Modal
      isOpen={!!profile}
      onClose={onClose}
      showHeader={false}
      showFooter={false}
      flexBody
      padding=""
      maxWidth="860px"
    >
      {/* ── Navigation bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 bg-muted/30 flex-shrink-0">
        <ShortcutTooltip label="Previous profile" shortcut="←" side="bottom">
          <button
            onClick={() => onNavigate(index - 1)}
            disabled={!hasPrev}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
        </ShortcutTooltip>

        <span className="text-sm text-muted-foreground font-medium">
          {index + 1} / {total} pending
        </span>

        <ShortcutTooltip label="Next profile" shortcut="→" side="bottom">
          <button
            onClick={() => onNavigate(index + 1)}
            disabled={!hasNext}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </ShortcutTooltip>
      </div>

      {/* ── Scrollable profile body ───────────────────────────────────────── */}
      {profile && <ProfileBody profile={profile} />}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/60 bg-muted/30 flex-shrink-0">
        <p className="text-xs text-muted-foreground hidden sm:block">
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">←</kbd>
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">→</kbd>
          {" "}navigate ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">Enter</kbd>
          {" "}approve
        </p>
        <div className="flex items-center gap-2 ml-auto">
          {hasNext && (
            <ShortcutTooltip label="Skip to next" shortcut="→" side="top">
              <Button variant="ghost" size="sm" onClick={() => onNavigate(index + 1)}>
                Skip
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </ShortcutTooltip>
          )}
          <ShortcutTooltip label="Approve profile" shortcut="Enter" side="top">
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isApproving}
              className="min-w-28"
            >
              {isApproving ? (
                <Loader size="sm" className="mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
          </ShortcutTooltip>
        </div>
      </div>
    </Modal>
  );
}
