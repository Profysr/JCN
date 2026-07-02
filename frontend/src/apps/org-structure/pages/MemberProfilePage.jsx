import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Users2,
  MapPin,
  Calendar,
  Hash,
  User,
  ChevronRight,
  Users,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Loader } from "@/shared/components/ui/Loader";
import { cn } from "@/shared/lib/utils";
import { useOrgProfile } from "@/apps/org-structure/hooks/useOrg";
import {
  ONBOARDING_STATUS,
  PROFILE_STATUS_CONFIG,
  getEmploymentLabel,
  formatDate,
} from "@/apps/org-structure/constants";

function SectionCard({ title, icon: Icon, children, className }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/60 bg-muted/30">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border/40 last:border-b-0">
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

export default function MemberProfilePage() {
  const { workspaceId, memberId } = useParams();
  const navigate = useNavigate();
  const { data: profile, isLoading, isError } = useOrgProfile(workspaceId, memberId);

  if (isLoading) {
    return <Loader className="h-screen" />;
  }

  if (isError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3 text-center">
        <p className="text-lg font-semibold">Member not found</p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Go back
        </button>
      </div>
    );
  }

  const member = profile.member;
  const user = member?.user;
  const statusCfg = PROFILE_STATUS_CONFIG[profile.status] ?? PROFILE_STATUS_CONFIG[ONBOARDING_STATUS.DRAFT];

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-6 py-3 bg-background/80 backdrop-blur border-b border-border/60">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
        <span className="text-sm font-medium truncate">{user?.full_name || user?.email}</span>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Hero card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6 shadow-sm">
          {/* Banner */}
          <div className="h-24 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />

          <div className="px-6 pb-6">
            {/* Avatar overlapping banner */}
            <div className="-mt-10 mb-4 flex items-end justify-between">
              <Avatar
                user={user}
                name={user?.full_name || user?.email}
                size="xl"
                className="ring-4 ring-background rounded-full"
              />
              <span className={cn("px-3 py-1 rounded-full text-xs font-semibold", statusCfg.className)}>
                {statusCfg.label}
              </span>
            </div>

            {/* Name & title */}
            <h1 className="text-2xl font-bold tracking-tight">
              {user?.full_name || user?.email}
            </h1>
            {profile.job_title && (
              <p className="text-base text-muted-foreground mt-0.5">
                {profile.job_title.name}
                {profile.job_title.level > 0 && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    L{profile.job_title.level}
                  </span>
                )}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-2 mt-4">
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

            {/* Bio */}
            {profile.bio && (
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left column: manager + reporting */}
          <div className="flex flex-col gap-5">
            {/* Manager */}
            <SectionCard title="Reports to" icon={User}>
              {profile.manager ? (
                <Link
                  to={`/w/${workspaceId}/people/${profile.manager.id}`}
                  className="flex items-center gap-3 group"
                >
                  <Avatar
                    user={{ full_name: profile.manager.name, email: profile.manager.email }}
                    name={profile.manager.name || profile.manager.email}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium group-hover:text-primary transition-colors truncate">
                      {profile.manager.name || profile.manager.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{profile.manager.email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 group-hover:text-primary transition-colors" />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground italic">No manager set</p>
              )}
            </SectionCard>

            {/* Direct reports count */}
            {profile.direct_reports_count > 0 && (
              <SectionCard title="Direct Reports" icon={Users}>
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold">{profile.direct_reports_count}</span>
                  <span className="text-sm text-muted-foreground">
                    {profile.direct_reports_count === 1 ? "person" : "people"} reporting to them
                  </span>
                </div>
              </SectionCard>
            )}

            {/* Employment details */}
            <SectionCard title="Employment" icon={Briefcase}>
              <DetailRow label="Type" value={getEmploymentLabel(profile.employment_type)} />
              <DetailRow label="Employee ID" value={profile.employee_id || null} />
              <DetailRow label="Start date" value={formatDate(profile.start_date)} />
              <DetailRow label="Location" value={profile.location || null} />
            </SectionCard>
          </div>

          {/* Right column: departments + teams */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            {/* Departments */}
            <SectionCard title="Departments" icon={Building2}>
              {profile.departments?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.departments.map((d) => (
                    <Chip key={d.id} label={d.name} color={d.color} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not in any department</p>
              )}
            </SectionCard>

            {/* Teams */}
            <SectionCard title="Teams" icon={Users2}>
              {profile.teams?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {profile.teams.map((t) => (
                    <Chip key={t.id} label={t.name} color={t.color} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Not in any team</p>
              )}
            </SectionCard>

            {/* Profile metadata */}
            <SectionCard title="Profile Details" icon={Hash}>
              <DetailRow label="Status" value={statusCfg.label} />
              <DetailRow label="Submitted" value={formatDate(profile.submitted_at)} />
              <DetailRow label="Approved" value={formatDate(profile.approved_at)} />
              {profile.approved_by && (
                <DetailRow
                  label="Approved by"
                  value={profile.approved_by?.user?.full_name || "—"}
                />
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
