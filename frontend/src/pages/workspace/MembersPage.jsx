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
  Send,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useMembers,
  useInviteMember,
  useUpdateMemberRole,
  useRemoveMember,
} from "@/hooks/useMembers";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";

import { ConfirmModal } from "@/components/ui/ConfirmModal";

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

/* ==========================================
   1. INVITE FORM WORKSPACE HEADER
   ========================================== */
export function InviteFormHeader({ workspaceName }) {
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
   2. PENDING INVITE LIST ROW ITEM
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
   3. ACTIVE MEMBER LIST ROW ITEM
   ========================================== */
export function ActiveMemberItem({
  member,
  isSelf,
  isWorkspaceOwner,
  isAdmin,
  onRoleChange,
  onRemove,
}) {
  const roleConf = ROLE_CONFIG[member.role] || ROLE_CONFIG.member;
  const RoleIcon = roleConf.icon;

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm flex-shrink-0">
          {member.user?.full_name?.[0]?.toUpperCase() ||
            member.user?.email?.[0]?.toUpperCase()}
        </div>
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
            className="text-xs border rounded px-2 py-1 bg-background outline-none focus:ring-1 focus:ring-ring"
            value={member.role}
            onChange={(e) => onRoleChange(member.id, e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_CONFIG[r].label}
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
            onClick={() => onRemove(member)}
            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove member"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ==========================================
   MAIN COMPONENT
   ========================================== */

export default function MembersPage() {
  const { workspaceId } = useParams();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  // Data fetching hooks
  const { data: members = [], isLoading } = useMembers(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);

  const { data: pendingInvites = [] } = useQuery({
    queryKey: ["workspace-invites", workspaceId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/invites/pending/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
  });

  // Action Mutation hooks
  const inviteMember = useInviteMember(workspaceId);
  const updateRole = useUpdateMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);

  const cancelInvite = useMutation({
    mutationFn: (token) =>
      api.delete(`/api/workspaces/${workspaceId}/invites/${token}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["workspace-invites", workspaceId] }),
  });

  // Local state configurations
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [confirmState, setConfirmState] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [copiedToken, setCopiedToken] = useState(null);

  // Authorization checks
  const currentMember = members.find((m) => m.user?.email === user?.email);
  const isAdmin =
    currentMember?.role === "admin" || workspace?.owner?.email === user?.email;

  // Handlers
  const handleInvite = (e) => {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    inviteMember.mutate(
      { email, role },
      {
        onSuccess: () => {
          setInviteSuccess(`Invite sent to ${email}`);
          setEmail("");
          qc.invalidateQueries({
            queryKey: ["workspace-invites", workspaceId],
          });
          setTimeout(() => setInviteSuccess(""), 4000);
        },
        onError: (err) => {
          setInviteError(
            err.response?.data?.email?.[0] ||
              err.response?.data?.non_field_errors?.[0] ||
              "Failed to send invite.",
          );
        },
      },
    );
  };

  const copyInviteLink = (token) => {
    navigator.clipboard.writeText(`${window.location.origin}/invites/${token}`);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  return (
    <div className="p-8 max-w-7xl space-y-6">
      {/* 1. Page Title Header Block */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Members</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {members.length} member{members.length !== 1 ? "s" : ""} ·{" "}
          {workspace?.name}
        </p>
      </div>

      {/* 2. Admin Management / Invitation Block */}
      {isAdmin && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <InviteFormHeader workspaceName={workspace?.name} />

          <form onSubmit={handleInvite} className="p-4">
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="flex-1"
              />
              <select
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_CONFIG[r].label}
                  </option>
                ))}
              </select>
              <Button
                type="submit"
                disabled={inviteMember.isPending}
                className="gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                {inviteMember.isPending ? "Sending…" : "Send Invite"}
              </Button>
            </div>

            {inviteError && (
              <p className="text-xs text-destructive mt-2 flex items-center gap-1.5">
                <X className="w-3.5 h-3.5" /> {inviteError}
              </p>
            )}
            {inviteSuccess && (
              <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {inviteSuccess}
              </p>
            )}
          </form>

          {/* Pending Invites List Sub-Block */}
          {pendingInvites.length > 0 && (
            <div className="border-t">
              <div className="px-4 py-2.5 flex items-center gap-2 bg-muted/40">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">
                  Pending ({pendingInvites.length})
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
        </div>
      )}

      {/* 3. Active Members Layout Wrapper */}
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
                  isWorkspaceOwner={
                    workspace?.owner?.email === member.user?.email
                  }
                  isAdmin={isAdmin}
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

      {/* 4. Global Action Confirmation Modal */}
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