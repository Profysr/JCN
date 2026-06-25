import {
  UserPlus,
  User,
  Trash2,
  Crown,
  Link as LinkIcon,
  Clock,
  X,
  Briefcase,
  Calendar,
  MapPin,
  ChevronRight,
  Users,
  Building2,
  Hash,
  CheckSquare,
  Square,
  UserCheck,
  Check,
  Minus,
  Shield,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useMembers,
  useRemoveMember,
  usePendingInvites,
  useCancelInvite,
} from "@/shared/hooks/useMembers";
import {
  useRoles,
  useAssignRole,
  useBulkAssignRole,
} from "@/shared/hooks/useRoles";
import { APP_DEFS } from "@/shared/lib/navLinks";
import {
  EMPLOYMENT_TYPES,
  WORKSPACE_ROLE_CONFIG,
  getWorkspaceRoleConfig,
} from "@/shared/lib/constants";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useAuthStore } from "@/store/authStore";
import { usePermission } from "@/contexts/PermissionsContext";
import InviteModal from "@/shared/components/workspace/InviteModal";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import RolesSection from "@/shared/components/workspace/RolesSection";
import PermissionsReferenceModal from "@/shared/components/workspace/PermissionsReferenceModal";
import {
  useOrgProfile,
  useUpdateOrgProfile,
  useJobTitles,
} from "@/apps/org-structure/hooks/useOrg";

/** App definitions used in the App Access tab — derived from the central APP_DEFS registry. */
const APP_ACCESS_DEFS = APP_DEFS.filter((a) => a.key !== "workspace").map(
  (a) => ({ ...a, label: a.shortLabel }),
);

/* ==========================================
   INVITE FORM WORKSPACE HEADER
   ========================================== */
function InviteFormHeader({ workspaceName }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 bg-primary/5 border-b border-primary/15">
      <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <UserPlus className="w-4 h-4" />
      </div>
      <div>
        <p className="text-sm font-semibold">
          Invite people to {workspaceName}
        </p>
        <p className="text-xs text-muted-foreground">
          They'll receive a link to join this workspace.
        </p>
      </div>
    </div>
  );
}

/* ==========================================
   PENDING INVITE ROW
   ========================================== */
function PendingInviteItem({ invite, onCopy, copiedToken, onCancel }) {
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
          <LinkIcon className="w-3 h-3" />
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
function ActiveMemberItem({
  member,
  isSelf,
  isWorkspaceOwner,
  isAdmin,
  isSelected,
  onSelect,
  isChecked,
  onCheck,
  onRoleChange,
  onRemove,
  roles = [],
}) {
  const roleConf = getWorkspaceRoleConfig(member.role);
  const RoleIcon = roleConf.icon;
  const checkable = isAdmin && !isSelf && !isWorkspaceOwner;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between px-4 py-3 transition-colors cursor-pointer",
        isSelected
          ? "bg-primary/5 border-l-2 border-l-primary"
          : "hover:bg-accent/40 border-l-2 border-l-transparent",
      )}
    >
      <div className="flex items-center gap-3">
        {checkable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCheck?.(member.id);
            }}
            className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
            title={isChecked ? "Deselect" : "Select"}
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        )}
        <Avatar user={member.user} size="md" />
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium leading-tight">
              {member.user?.full_name || "-"}
            </p>
            {isWorkspaceOwner && (
              <Crown
                className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0"
                title="Owner"
              />
            )}
            {isSelf && (
              <span className="text-xs text-muted-foreground">(you)</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-tight mt-0.5">
            {member.user?.email}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isAdmin && !isSelf && !isWorkspaceOwner ? (
          <select
            className="text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring max-w-[140px]"
            value={roles.find((r) => r.name === member.role)?.id ?? ""}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
          >
            <option value="" disabled>
              Select role…
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_system ? " 🔒" : ""}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={cn(
              "flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium",
              roleConf.className,
            )}
          >
            <RoleIcon className="w-3 h-3" />
            {roleConf.label}
          </span>
        )}

        {isAdmin && !isSelf && !isWorkspaceOwner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(member);
            }}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove member"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground/40 transition-transform",
            isSelected && "text-primary rotate-90",
          )}
        />
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
      {Icon && (
        <Icon className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">
          {label}
        </p>
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

  const empType = EMPLOYMENT_TYPES.find(
    (t) => t.value === profile?.employment_type,
  );

  return (
    <div className="w-80 border-l bg-card flex flex-col h-full animate-panel-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">Member Profile</span>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-accent text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Identity block */}
        <div className="p-5 border-b flex flex-col items-center text-center gap-3">
          <Avatar
            name={member.user?.full_name || member.user?.email}
            src={member.user?.avatar}
            size="lg"
          />
          <div>
            <p className="font-semibold">{member.user?.full_name || "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {member.user?.email}
            </p>
          </div>
          {empType && (
            <span
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-full",
                empType.color,
              )}
            >
              {empType.label}
            </span>
          )}
        </div>

        {isLoading && (
          <div className="p-6 text-sm text-muted-foreground">
            Loading profile…
          </div>
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
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  onClick={() =>
                    isAdmin && setEditing((p) => ({ ...p, job_title_id: true }))
                  }
                  className={cn(
                    "text-sm text-left w-full",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.job_title && "text-muted-foreground italic",
                  )}
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
                  onChange={(e) =>
                    updateProfile.mutate({ employment_type: e.target.value })
                  }
                >
                  {EMPLOYMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </ProfileField>
            )}

            {/* Departments */}
            {profile.departments?.length > 0 && (
              <ProfileField label="Department" icon={Building2}>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {profile.departments.map((d) => (
                    <span
                      key={d.id}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{
                        color: d.color,
                        borderColor: d.color + "44",
                        background: d.color + "18",
                      }}
                    >
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
                    <span
                      key={t.id}
                      className="text-xs px-2 py-0.5 rounded-full border"
                      style={{
                        color: t.color,
                        borderColor: t.color + "44",
                        background: t.color + "18",
                      }}
                    >
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
                <p className="text-xs text-muted-foreground">
                  {profile.manager.email}
                </p>
              </ProfileField>
            )}

            {/* Direct reports */}
            {profile.direct_reports_count > 0 && (
              <ProfileField label="Direct Reports" icon={Users}>
                <p className="text-sm">
                  {profile.direct_reports_count}{" "}
                  {profile.direct_reports_count === 1 ? "person" : "people"}
                </p>
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
                  onClick={() =>
                    isAdmin && setEditing((p) => ({ ...p, employee_id: true }))
                  }
                  className={cn(
                    "text-sm text-left w-full",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.employee_id && "text-muted-foreground italic",
                  )}
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
                  onBlur={(e) => {
                    save("start_date", e.target.value || null);
                  }}
                />
              ) : (
                <button
                  onClick={() =>
                    isAdmin && setEditing((p) => ({ ...p, start_date: true }))
                  }
                  className={cn(
                    "text-sm text-left w-full",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.start_date && "text-muted-foreground italic",
                  )}
                >
                  {profile.start_date
                    ? new Date(profile.start_date).toLocaleDateString(
                        undefined,
                        { year: "numeric", month: "long", day: "numeric" },
                      )
                    : isAdmin
                      ? "Click to set"
                      : "—"}
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
                  onClick={() =>
                    isAdmin && setEditing((p) => ({ ...p, location: true }))
                  }
                  className={cn(
                    "text-sm text-left w-full",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.location && "text-muted-foreground italic",
                  )}
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
                  onClick={() =>
                    isAdmin && setEditing((p) => ({ ...p, bio: true }))
                  }
                  className={cn(
                    "text-sm text-left w-full leading-relaxed",
                    isAdmin && "hover:text-primary cursor-pointer",
                    !profile.bio && "text-muted-foreground italic",
                  )}
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
   APP ACCESS TAB
   ========================================== */

/** Resolves a member's role object from the roles list. */
function getMemberRole(member, roles) {
  return roles.find((r) => r.name === member.role) ?? null;
}

/** Returns true if the member's role grants access to an app. */
function memberHasAppAccess(member, appDef, roles, isWorkspaceOwner) {
  if (isWorkspaceOwner || member.role === "Admin") return true;
  const role = getMemberRole(member, roles);
  return role?.app_access?.[appDef.key] === true;
}

/**
 * Clickable access cell for admin users.
 * Fires onToggle(e) so the parent can open a role-picker popover.
 */
function AppAccessCell({ hasAccess, appDef, isInteractive, onToggle }) {
  const base =
    "w-6 h-6 rounded-full flex items-center justify-center transition-transform";
  const interactive = isInteractive
    ? "cursor-pointer hover:scale-110 hover:ring-2 hover:ring-offset-1"
    : "";
  const ringColor = hasAccess
    ? "hover:ring-emerald-400"
    : "hover:ring-primary/40";

  return (
    <div className="flex items-center justify-center">
      <span
        className={cn(
          base,
          interactive,
          ringColor,
          hasAccess ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted",
        )}
        title={
          hasAccess
            ? `Has ${appDef.label} access${isInteractive ? " — click to change" : ""}`
            : `No ${appDef.label} access${isInteractive ? " — click to grant" : ""}`
        }
        onClick={isInteractive ? onToggle : undefined}
      >
        {hasAccess ? (
          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Minus className="w-3.5 h-3.5 text-muted-foreground/40" />
        )}
      </span>
    </div>
  );
}

function AppAccessTab({
  workspaceId,
  members,
  roles,
  isAdmin,
  user,
  workspace,
  onSwitchToRoles,
}) {
  const assignRole = useAssignRole(workspaceId);
  const bulkAssignRole = useBulkAssignRole(workspaceId);

  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkRoleId, setBulkRoleId] = useState("");

  // Per-cell popover state: { memberId, appKey, hasAccess, rect: DOMRect }
  const [cellPopover, setCellPopover] = useState(null);
  const popoverRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    if (!cellPopover) return;
    const handler = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setCellPopover(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [cellPopover]);

  const visibleApps = APP_ACCESS_DEFS;

  const toggleCheck = (id) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearChecked = () => {
    setCheckedIds(new Set());
    setBulkRoleId("");
  };

  const handleBulkAssign = () => {
    if (!bulkRoleId || checkedIds.size === 0) return;
    bulkAssignRole.mutate(
      { roleId: bulkRoleId, memberIds: [...checkedIds] },
      { onSuccess: clearChecked },
    );
  };

  const openCellPopover = (e, member, appDef, hasAccess) => {
    if (!isAdmin) return;
    const isSelf = member.user?.email === user?.email;
    const isOwner = workspace?.owner?.email === member.user?.email;
    if (isSelf || isOwner) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCellPopover({
      memberId: member.id,
      appKey: appDef.key,
      hasAccess,
      rect,
    });
  };

  // Roles filtered to those that grant / revoke the selected app's permission
  const popoverApp = cellPopover
    ? APP_ACCESS_DEFS.find((a) => a.key === cellPopover.appKey)
    : null;
  const rolesWithAccess = popoverApp
    ? roles.filter((r) => r.app_access?.[popoverApp.key] === true)
    : [];
  const rolesWithoutAccess = popoverApp
    ? roles.filter((r) => !r.app_access?.[popoverApp.key])
    : [];
  const suggestedRoles = cellPopover?.hasAccess
    ? rolesWithoutAccess
    : rolesWithAccess;

  // Build a quick lookup: app key → member count with access
  const appMemberCounts = Object.fromEntries(
    visibleApps.map((app) => [
      app.key,
      members.filter((m) =>
        memberHasAppAccess(
          m,
          app,
          roles,
          workspace?.owner?.email === m.user?.email,
        ),
      ).length,
    ]),
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {visibleApps.map((app) => {
          const Icon = app.icon;
          return (
            <div
              key={app.key}
              className="rounded-lg border bg-card px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                <Icon className={cn("w-4 h-4", app.colors?.text)} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{app.label}</p>
                <p className="text-lg font-semibold leading-tight">
                  {appMemberCounts[app.key]}
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    / {members.length}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk toolbar */}
      {isAdmin && checkedIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-primary/5 border-primary/20">
          <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-primary">
            {checkedIds.size} selected
          </span>
          <select
            className="ml-2 text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring"
            value={bulkRoleId}
            onChange={(e) => setBulkRoleId(e.target.value)}
          >
            <option value="">Assign role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_system ? " 🔒" : ""}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!bulkRoleId || bulkAssignRole.isPending}
            onClick={handleBulkAssign}
          >
            {bulkAssignRole.isPending ? "Assigning…" : "Apply"}
          </Button>
          <button
            onClick={clearChecked}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Access table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Table header */}
        <div
          className="grid bg-muted/30 border-b"
          style={{
            gridTemplateColumns: `1fr 160px ${visibleApps.map(() => "80px").join(" ")}`,
          }}
        >
          <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Member
          </div>
          <div className="px-2 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Role
          </div>
          {visibleApps.map((app) => {
            const Icon = app.icon;
            return (
              <div
                key={app.key}
                className="flex flex-col items-center justify-center py-2.5 gap-1"
              >
                <Icon className={cn("w-3.5 h-3.5", app.colors?.text)} />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {app.label === "Org Structure" ? "Org" : app.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Table rows */}
        <div className="divide-y">
          {members.map((member) => {
            const isSelf = member.user?.email === user?.email;
            const isWorkspaceOwner =
              workspace?.owner?.email === member.user?.email;
            const checkable = isAdmin && !isSelf && !isWorkspaceOwner;
            const isChecked = checkedIds.has(member.id);
            const roleConf = getWorkspaceRoleConfig(member.role);
            const RoleIcon = roleConf.icon;
            const memberRole = getMemberRole(member, roles);

            return (
              <div
                key={member.id}
                className={cn(
                  "grid items-center transition-colors",
                  isChecked ? "bg-primary/5" : "hover:bg-accent/30",
                )}
                style={{
                  gridTemplateColumns: `1fr 160px ${visibleApps.map(() => "80px").join(" ")}`,
                }}
              >
                {/* Member info */}
                <div className="flex items-center gap-3 px-4 py-3">
                  {checkable && (
                    <button
                      type="button"
                      onClick={() => toggleCheck(member.id)}
                      className="flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <Avatar user={member.user} size="sm" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="text-sm font-medium truncate">
                        {member.user?.full_name || "—"}
                      </p>
                      {isWorkspaceOwner && (
                        <Crown className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                      )}
                      {isSelf && (
                        <span className="text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {member.user?.email}
                    </p>
                  </div>
                </div>

                {/* Role — admin can change it inline */}
                <div className="px-2 py-3">
                  {isAdmin && !isSelf && !isWorkspaceOwner ? (
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring w-full"
                      value={memberRole?.id ?? ""}
                      onChange={(e) =>
                        assignRole.mutate({
                          memberId: member.id,
                          roleId: e.target.value,
                        })
                      }
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                          {r.is_system ? " 🔒" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium",
                        roleConf.className,
                      )}
                    >
                      <RoleIcon className="w-3 h-3" />
                      {roleConf.label}
                    </span>
                  )}
                </div>

                {/* App access cells */}
                {visibleApps.map((app) => {
                  const hasAccess = memberHasAppAccess(
                    member,
                    app,
                    roles,
                    isWorkspaceOwner,
                  );
                  const interactive = isAdmin && !isSelf && !isWorkspaceOwner;
                  return (
                    <div key={app.key} className="px-2 py-3">
                      <AppAccessCell
                        hasAccess={hasAccess}
                        appDef={app}
                        isInteractive={interactive}
                        onToggle={(e) =>
                          openCellPopover(e, member, app, hasAccess)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-cell role picker popover */}
      {cellPopover && popoverApp && (
        <div
          ref={popoverRef}
          className="fixed z-50 w-56 rounded-lg border bg-card shadow-xl py-1"
          style={{
            top: cellPopover.rect.bottom + 6,
            left: Math.min(cellPopover.rect.left - 80, window.innerWidth - 232),
          }}
        >
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
            {cellPopover.hasAccess
              ? `Revoke ${popoverApp.label} access`
              : `Grant ${popoverApp.label} access`}
          </p>
          <p className="px-3 pb-1.5 text-[11px] text-muted-foreground/60">
            {cellPopover.hasAccess
              ? `Choose a role without ${popoverApp.label} access`
              : `Choose a role with ${popoverApp.label} access`}
          </p>
          <div className="border-t" />
          {suggestedRoles.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-muted-foreground">
              No matching roles.{" "}
              <button
                className="text-primary underline"
                onClick={() => {
                  setCellPopover(null);
                  onSwitchToRoles?.();
                }}
              >
                Create one in Roles & Permissions
              </button>
            </div>
          ) : (
            suggestedRoles.map((r) => (
              <button
                key={r.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
                onClick={() => {
                  assignRole.mutate({
                    memberId: cellPopover.memberId,
                    roleId: r.id,
                  });
                  setCellPopover(null);
                }}
              >
                <span className="flex-1 truncate">{r.name}</span>
                {r.is_system && (
                  <span className="text-[10px] text-muted-foreground/50">
                    🔒
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Access is controlled by each member's role. Click a{" "}
        <Check className="w-3 h-3 inline text-emerald-500" /> or{" "}
        <Minus className="w-3 h-3 inline text-muted-foreground/40" /> to pick a
        different role, or use the role dropdown to change their role directly.
        Manage roles in the{" "}
        <button
          className="text-primary underline"
          onClick={() => onSwitchToRoles?.()}
        >
          Roles & Permissions
        </button>{" "}
        tab.
      </p>
    </div>
  );
}

/* ==========================================
   MAIN PAGE
   ========================================== */
export default function MembersPage() {
  const { workspaceId } = useParams();
  const { user } = useAuthStore();

  const { data: members = [], isLoading } = useMembers(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: roles = [] } = useRoles(workspaceId);
  const { data: pendingInvites = [] } = usePendingInvites(workspaceId);

  const assignRole = useAssignRole(workspaceId);
  const bulkAssignRole = useBulkAssignRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const cancelInvite = useCancelInvite(workspaceId);

  const [activeTab, setActiveTab] = useState("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [permsRefOpen, setPermsRefOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [copiedToken, setCopiedToken] = useState(null);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkRoleId, setBulkRoleId] = useState("");

  const toggleCheck = (id) =>
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const clearChecked = () => {
    setCheckedIds(new Set());
    setBulkRoleId("");
  };

  const handleBulkAssign = () => {
    if (!bulkRoleId || checkedIds.size === 0) return;
    bulkAssignRole.mutate(
      { roleId: bulkRoleId, memberIds: [...checkedIds] },
      { onSuccess: clearChecked },
    );
  };

  const { isOwner, can } = usePermission();
  const isAdmin = isOwner || can("settings.manage");

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  useEffect(() => {
    const handler = () => setPermsRefOpen(true);
    window.addEventListener("jcn:open-permissions", handler);
    return () => window.removeEventListener("jcn:open-permissions", handler);
  }, []);

  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/invites/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {members.length} member{members.length !== 1 ? "s" : ""} ·{" "}
              {workspace?.name}
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setInviteOpen(true)} className="gap-2">
              <UserPlus className="w-4 h-4" />
              Invite members
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b">
          {[
            { key: "members", label: "Members" },
            { key: "app-access", label: "App Access" },
            { key: "roles", label: "Roles & Permissions", icon: Shield },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedMemberId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Members tab ── */}
        {activeTab === "members" && (
          <>
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

              {/* Bulk action toolbar */}
              {isAdmin && checkedIds.size > 0 && (
                <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-lg border bg-primary/5 border-primary/20">
                  <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-primary">
                    {checkedIds.size} selected
                  </span>
                  <select
                    className="ml-2 text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring"
                    value={bulkRoleId}
                    onChange={(e) => setBulkRoleId(e.target.value)}
                  >
                    <option value="">Assign role…</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.is_system ? " 🔒" : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    disabled={!bulkRoleId || bulkAssignRole.isPending}
                    onClick={handleBulkAssign}
                  >
                    {bulkAssignRole.isPending ? "Assigning…" : "Apply"}
                  </Button>
                  <button
                    onClick={clearChecked}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}

              <div className="rounded-lg border bg-card overflow-hidden">
                {isLoading ? (
                  <div className="p-6 text-sm text-muted-foreground">
                    Loading…
                  </div>
                ) : (
                  <div className="divide-y">
                    {members.map((member) => (
                      <ActiveMemberItem
                        key={member.id}
                        member={member}
                        isSelf={member.user?.email === user?.email}
                        isWorkspaceOwner={
                          workspace?.owner?.email === member.user?.email
                        }
                        isAdmin={isAdmin}
                        isSelected={member.id === selectedMemberId}
                        onSelect={() =>
                          setSelectedMemberId((prev) =>
                            prev === member.id ? null : member.id,
                          )
                        }
                        isChecked={checkedIds.has(member.id)}
                        onCheck={toggleCheck}
                        roles={roles}
                        onRoleChange={(memberId, roleId) =>
                          assignRole.mutate({ memberId, roleId })
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
          </>
        )}

        {/* ── App Access tab ── */}
        {activeTab === "app-access" && (
          <AppAccessTab
            workspaceId={workspaceId}
            members={members}
            roles={roles}
            isAdmin={isAdmin}
            user={user}
            workspace={workspace}
            onSwitchToRoles={() => setActiveTab("roles")}
          />
        )}

        {/* ── Roles & Permissions tab ── */}
        {activeTab === "roles" && (
          <RolesSection
            workspaceId={workspaceId}
            isAdmin={isAdmin}
            onOpenPermissionsRef={() => setPermsRefOpen(true)}
          />
        )}
      </div>

      {/* Profile side panel — only in Members tab */}
      {activeTab === "members" && selectedMember && (
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

      {permsRefOpen && (
        <PermissionsReferenceModal
          workspaceId={workspaceId}
          onClose={() => setPermsRefOpen(false)}
        />
      )}
    </div>
  );
}
