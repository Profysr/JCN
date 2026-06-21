import {
  UserPlus,
  Shield,
  User,
  Eye,
  Trash2,
  Crown,
  Link,
  Clock,
  X,
  Briefcase,
  Calendar,
  MapPin,
  ChevronRight,
  Users,
  Building2,
  Hash,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useMembers,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/shared/hooks/useMembers";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useAuthStore } from "@/store/authStore";
import api from "@/shared/lib/api";
import InviteModal from "@/shared/components/workspace/InviteModal";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import {
  useOrgProfile,
  useUpdateOrgProfile,
  useJobTitles,
} from "@/apps/org-structure/hooks/useOrg";

export const ROLES = ["admin", "member", "viewer"];
export const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    icon: Shield,
    className: "text-primary bg-primary/10 border-primary/20",
  },
  member: {
    label: "Member",
    icon: User,
    className: "text-foreground bg-secondary border-border",
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    className: "text-muted-foreground bg-secondary border-border",
  },
};

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time", color: "bg-emerald-100 text-emerald-700" },
  { value: "part_time", label: "Part-time", color: "bg-blue-100 text-blue-700" },
  { value: "contractor", label: "Contractor", color: "bg-amber-100 text-amber-700" },
  { value: "intern", label: "Intern", color: "bg-violet-100 text-violet-700" },
];

/* ==========================================
   INVITE FORM WORKSPACE HEADER
   ========================================== */
export function InviteFormHeader({ workspaceName }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-primary/5 border-b border-primary/15">
      <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <UserPlus className="w-4 h-4" />
      </div>
      <div>
        <p className="text-sm font-semibold">Invite people to {workspaceName}</p>
        <p className="text-xs text-muted-foreground">They'll receive a link to join this workspace.</p>
      </div>
    </div>
  );
}

/* ==========================================
   PENDING INVITE ROW
   ========================================== */
export function PendingInviteItem({ invite, onCopy, copiedToken, onCancel }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <p className="text-sm font-medium">{invite.email}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          <span className="capitalize">{invite.role}</span>
          {invite.invited_by &&
            ` · by ${invite.invited_by.full_name || invite.invited_by.email}`}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onCopy(invite.token)}
          className={cn(
            "flex items-center gap-1.5 text-xs border rounded px-2.5 py-1.5 transition-colors",
            copiedToken === invite.token
              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          <Link className="w-3 h-3" />
          {copiedToken === invite.token ? "Copied!" : "Copy link"}
        </button>
        <button
          onClick={() => onCancel(invite.token)}
          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Cancel invite"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ==========================================
   ACTIVE MEMBER ROW
   ========================================== */
export function ActiveMemberItem({
  member,
  isSelf,
  isWorkspaceOwner,
  isAdmin,
  isSelected,
  onSelect,
  onRoleChange,
  onRemove,
}) {
  const roleConf = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
  const RoleIcon = roleConf.icon;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between px-4 py-3 transition-colors cursor-pointer",
        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-accent/40 border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-center gap-3">
        <Avatar name={member.user?.full_name || member.user?.email} src={member.user?.avatar} size="md" />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium leading-tight">{member.user?.full_name || "-"}</p>
            {isWorkspaceOwner && (
              <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" title="Owner" />
            )}
            {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          </div>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">{member.user?.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && !isSelf && !isWorkspaceOwner ? (
          <select
            className="text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring"
            value={member.role}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
            ))}
          </select>
        ) : (
          <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium", roleConf.className)}>
            <RoleIcon className="w-3 h-3" />
            {roleConf.label}
          </span>
        )}

        {isAdmin && !isSelf && !isWorkspaceOwner && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(member); }}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove member"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <ChevronRight className={cn("w-4 h-4 text-muted-foreground/40 transition-transform", isSelected && "text-primary rotate-90")} />
      </div>
    </div>
  );
}

/* ==========================================
   PROFILE SIDE PANEL
   ========================================== */
function ProfileField({ label, icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

function MemberProfilePanel({ member, workspaceId, isAdmin, onClose }) {
  const { data: profile, isLoading } = useOrgProfile(workspaceId, member.id);
  const { data: jobTitles = [] } = useJobTitles(workspaceId);
  const updateProfile = useUpdateOrgProfile(workspaceId, member.id);

  const [editing, setEditing] = useState({});

  const save = (field, value) => {
    setEditing((p) => ({ ...p, [field]: false }));
    updateProfile.mutate({ [field]: value });
  };

  const empType = EMPLOYMENT_TYPES.find((t) => t.value === profile?.employment_type);

  return (
    <div className="w-80 border-l bg-card flex flex-col h-full animate-panel-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">Member Profile</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity block */}
        <div className="p-5 border-b flex flex-col items-center text-center gap-3">
          <Avatar name={member.user?.full_name || member.user?.email} src={member.user?.avatar} size="lg" />
          <div>
            <p className="font-semibold">{member.user?.full_name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{member.user?.email}</p>
          </div>
          {empType && (
            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", empType.color)}>
              {empType.label}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Loading profile…</div>
        )}

        {!isLoading && profile && (
          <div className="p-5 space-y-5">
            {/* Job Title */}
            <ProfileField label="Job Title" icon={Briefcase}>
              {isAdmin && editing.job_title_id ? (
                <select
                  autoFocus
                  className="w-full text-sm border rounded px-2 py-1 bg-background"
                  defaultValue={profile.job_title?.id ?? ""}
                  onBlur={(e) => save("job_title_id", e.target.value || null)}
                >
                  <option value="">— None —</option>
                  {jobTitles.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() => isAdmin && setEditing((p) => ({ ...p, job_title_id: true }))}
                  className={cn("text-sm text-left w-full", isAdmin && "hover:text-primary cursor-pointer", !profile.job_title && "text-muted-foreground italic")}
                >
                  {profile.job_title?.name || (isAdmin ? "Click to set" : "—")}
                </button>
              )}
            </ProfileField>

            {/* Employment type — admin editable */}
            {isAdmin && (
              <ProfileField label="Employment Type" icon={User}>
                <select
                  className="text-sm border rounded px-2 py-1 bg-background w-full"
                  value={profile.employment_type || "full_time"}
                  onChange={(e) => updateProfile.mutate({ employment_type: e.target.value })}
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </ProfileField>
            )}

            {/* Departments */}
            {profile.departments?.length > 0 && (
              <ProfileField label="Department" icon={Building2}>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {profile.departments.map((d) => (
                    <span key={d.id} className="text-xs px-2 py-0.5 rounded-full border" style={{ color: d.color, borderColor: d.color + "44", background: d.color + "18" }}>
                      {d.name}
                    </span>
                  ))}
                </div>
              </ProfileField>
            )}

            {/* Teams */}
            {profile.teams?.length > 0 && (
              <ProfileField label="Teams" icon={Users}>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {profile.teams.map((t) => (
                    <span key={t.id} className="text-xs px-2 py-0.5 rounded-full border" style={{ color: t.color, borderColor: t.color + "44", background: t.color + "18" }}>
                      {t.name}
                    </span>
                  ))}
                </div>
              </ProfileField>
            )}

            {/* Manager */}
            {profile.manager && (
              <ProfileField label="Reports To" icon={User}>
                <p className="text-sm">{profile.manager.name}</p>
                <p className="text-xs text-muted-foreground">{profile.manager.email}</p>
              </ProfileField>
            )}

            {/* Direct reports */}
            {profile.direct_reports_count > 0 && (
              <ProfileField label="Direct Reports" icon={Users}>
                <p className="text-sm">{profile.direct_reports_count} {profile.direct_reports_count === 1 ? "person" : "people"}</p>
              </ProfileField>
            )}

            {/* Employee ID */}
            <ProfileField label="Employee ID" icon={Hash}>
              {isAdmin && editing.employee_id ? (
                <input
                  autoFocus
                  type="text"
                  className="text-sm border rounded px-2 py-1 bg-background w-full"
                  defaultValue={profile.employee_id || ""}
                  onBlur={(e) => save("employee_id", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                />
              ) : (
                <button
                  onClick={() => isAdmin && setEditing((p) => ({ ...p, employee_id: true }))}
                  className={cn("text-sm text-left w-full", isAdmin && "hover:text-primary cursor-pointer", !profile.employee_id && "text-muted-foreground italic")}
                >
                  {profile.employee_id || (isAdmin ? "Click to set" : "—")}
                </button>
              )}
            </ProfileField>

            {/* Start Date */}
            <ProfileField label="Start Date" icon={Calendar}>
              {isAdmin && editing.start_date ? (
                <input
                  autoFocus
                  type="date"
                  className="text-sm border rounded px-2 py-1 bg-background w-full"
                  defaultValue={profile.start_date || ""}
                  onBlur={(e) => { save("start_date", e.target.value || null); }}
                />
              ) : (
                <button
                  onClick={() => isAdmin && setEditing((p) => ({ ...p, start_date: true }))}
                  className={cn("text-sm text-left w-full", isAdmin && "hover:text-primary cursor-pointer", !profile.start_date && "text-muted-foreground italic")}
                >
                  {profile.start_date
                    ? new Date(profile.start_date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
                    : isAdmin ? "Click to set" : "—"}
                </button>
              )}
            </ProfileField>

            {/* Location */}
            <ProfileField label="Location" icon={MapPin}>
              {isAdmin && editing.location ? (
                <input
                  autoFocus
                  type="text"
                  className="text-sm border rounded px-2 py-1 bg-background w-full"
                  defaultValue={profile.location || ""}
                  onBlur={(e) => save("location", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                />
              ) : (
                <button
                  onClick={() => isAdmin && setEditing((p) => ({ ...p, location: true }))}
                  className={cn("text-sm text-left w-full", isAdmin && "hover:text-primary cursor-pointer", !profile.location && "text-muted-foreground italic")}
                >
                  {profile.location || (isAdmin ? "Click to set" : "—")}
                </button>
              )}
            </ProfileField>

            {/* Bio */}
            <ProfileField label="Bio" icon={null}>
              {isAdmin && editing.bio ? (
                <textarea
                  autoFocus
                  className="text-sm border rounded px-2 py-1 bg-background w-full resize-none"
                  rows={3}
                  defaultValue={profile.bio || ""}
                  onBlur={(e) => save("bio", e.target.value)}
                />
              ) : (
                <button
                  onClick={() => isAdmin && setEditing((p) => ({ ...p, bio: true }))}
                  className={cn("text-sm text-left w-full leading-relaxed", isAdmin && "hover:text-primary cursor-pointer", !profile.bio && "text-muted-foreground italic")}
                >
                  {profile.bio || (isAdmin ? "Click to add bio" : "—")}
                </button>
              )}
            </ProfileField>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==========================================
   MAIN PAGE
   ========================================== */
export default function MembersPage() {
  const { workspaceId } = useParams();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useMembers(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["workspace-invites", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/invites/pending/`).then((r) => r.data),
    enabled: !!workspaceId,
  });

  const updateRole = useUpdateMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);

  const cancelInvite = useMutation({
    mutationFn: (token) =>
      api.delete(`/api/workspaces/${workspaceId}/invites/${token}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] }),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);

  const currentMember = members.find((m) => m.user?.email === user?.email);
  const isAdmin =
    currentMember?.role === "admin" || workspace?.owner?.email === user?.email;

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/invites/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={cn("flex-1 overflow-y-auto p-8 space-y-6", selectedMember && "max-w-3xl")}>
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {members.length} member{members.length !== 1 ? "s" : ""} · {workspace?.name}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Invite members
            </Button>
          )}
        </div>

        {/* Pending invites */}
        {isAdmin && pendingInvites.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 flex items-center gap-2 bg-muted/40 border-b">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Pending invites ({pendingInvites.length})
              </span>
            </div>
            <div className="divide-y">
              {pendingInvites.map((invite) => (
                <PendingInviteItem
                  key={invite.id}
                  invite={invite}
                  onCopy={copyInviteLink}
                  copiedToken={copiedToken}
                  onCancel={(token) => cancelInvite.mutate(token)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Active members */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            Active Members
          </h2>
          <div className="rounded-lg border bg-card overflow-hidden">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : (
              <div className="divide-y">
                {members.map((member) => (
                  <ActiveMemberItem
                    key={member.id}
                    member={member}
                    isSelf={member.user?.email === user?.email}
                    isWorkspaceOwner={workspace?.owner?.email === member.user?.email}
                    isAdmin={isAdmin}
                    isSelected={member.id === selectedMemberId}
                    onSelect={() =>
                      setSelectedMemberId((prev) =>
                        prev === member.id ? null : member.id,
                      )
                    }
                    onRoleChange={(memberId, nextRole) =>
                      updateRole.mutate({ memberId, role: nextRole })
                    }
                    onRemove={(target) =>
                      setConfirmState({
                        message: `Remove ${target.user?.full_name || target.user?.email} from this workspace?`,
                        onConfirm: () => removeMember.mutate(target.id),
                      })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Profile side panel */}
      {selectedMember && (
        <MemberProfilePanel
          member={selectedMember}
          workspaceId={workspaceId}
          isAdmin={isAdmin}
          onClose={() => setSelectedMemberId(null)}
        />
      )}

      {/* Modals */}
      <InviteModal
        workspaceId={workspaceId}
        workspaceName={workspace?.name || ""}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />

      {confirmState && (
        <ConfirmModal
          title="Remove member?"
          message={confirmState.message}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
