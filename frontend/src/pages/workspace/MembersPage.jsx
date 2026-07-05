import {
  UserPlus,
  Trash2,
  Crown,
  Link as LinkIcon,
  Clock,
  X,
  ChevronRight,
  CheckSquare,
  Square,
  UserCheck,
  Shield,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import Select from "@/shared/components/ui/Select";
import { cn } from "@/shared/lib/utils";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { getWorkspaceRoleConfig } from "@/shared/lib/constants";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useAuthStore } from "@/store/authStore";
import { usePermission } from "@/contexts/PermissionsContext";
import InviteModal from "@/shared/components/workspace/InviteModal";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/Tabs";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import { useToast } from "@/shared/components/ui/toast";
import AppAccessTab from "@/pages/workspace/AppAccessTab";
import RolesSection from "@/shared/components/workspace/RolesSection";
import PermissionsModal from "@/shared/components/workspace/PermissionsModal";
import { Loader } from "@/shared/components/ui/Loader";

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
   PENDING INVITES CARD
   ========================================== */
function PendingInvitesCard({ invites, onCopy, copiedToken, onCancel }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-2 bg-muted/40 border-b">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Pending invites ({invites.length})
        </span>
      </div>
      <div className="divide-y">
        {invites.map((invite) => (
          <PendingInviteItem
            key={invite.id}
            invite={invite}
            onCopy={onCopy}
            copiedToken={copiedToken}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}

/* ==========================================
   BULK ACTION TOOLBAR
   ========================================== */
function BulkActionBar({ count, roles, bulkRoleId, onRoleChange, onApply, isPending, onClear }) {
  return (
    <div className="mb-2 flex items-center gap-3 px-3 py-2 rounded-lg border bg-primary/5 border-primary/20">
      <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />
      <span className="text-sm font-medium text-primary">{count} selected</span>
      <Select
        size="sm"
        className="ml-2 w-44"
        placeholder="Assign role…"
        value={bulkRoleId}
        onChange={onRoleChange}
        options={roles.map((r) => ({
          value: r.id,
          label: `${r.name}${r.is_system ? " 🔒" : ""}`,
        }))}
      />
      <Button size="sm" disabled={!bulkRoleId || isPending} onClick={onApply}>
        {isPending ? "Assigning…" : "Apply"}
      </Button>
      <button
        onClick={onClear}
        className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear
      </button>
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
  onOpenProfile,
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
      onClick={onOpenProfile}
      className="flex items-center justify-between px-4 py-3 transition-colors cursor-pointer hover:bg-accent/40 border-l-2 border-l-transparent"
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
          <span onClick={(e) => e.stopPropagation()}>
            <Select
              size="sm"
              className="max-w-[140px]"
              placeholder="Select role…"
              value={roles.find((r) => r.name === member.role)?.id ?? ""}
              onChange={(v) => onRoleChange(member.id, v)}
              options={roles.map((r) => ({
                value: r.id,
                label: `${r.name}${r.is_system ? " 🔒" : ""}`,
              }))}
            />
          </span>
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

        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
      </div>
    </div>
  );
}

/* ==========================================
   MAIN PAGE
   ========================================== */
export default function MembersPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
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
      {
        onSuccess: clearChecked,
        onError: (err) => showError("Failed to assign roles", err),
      },
    );
  };

  const { toast } = useToast();
  const showError = (title, err) =>
    toast({ title, description: err.message, variant: "destructive" });

  const { isOwner, can } = usePermission();
  const isAdmin = isOwner || can("settings.manage");

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
      <div className="flex-1 overflow-y-auto p-8 px-4 space-y-6">
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
        <Tabs value={activeTab} onChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="app-access">App Access</TabsTrigger>
            <TabsTrigger value="roles" icon={Shield}>
              Roles & Permissions
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── Members tab ── */}
        {activeTab === "members" && (
          <div key="members" className="animate-slide-up space-y-6">
            {/* Pending invites */}
            {isAdmin && pendingInvites.length > 0 && (
              <PendingInvitesCard
                invites={pendingInvites}
                onCopy={copyInviteLink}
                copiedToken={copiedToken}
                onCancel={(token) =>
                  cancelInvite.mutate(token, {
                    onError: (err) => showError("Failed to cancel invite", err),
                  })
                }
              />
            )}

            {/* Active members */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                Active Members
              </h2>

              {/* Bulk action toolbar */}
              {isAdmin && checkedIds.size > 0 && (
                <BulkActionBar
                  count={checkedIds.size}
                  roles={roles}
                  bulkRoleId={bulkRoleId}
                  onRoleChange={setBulkRoleId}
                  onApply={handleBulkAssign}
                  isPending={bulkAssignRole.isPending}
                  onClear={clearChecked}
                />
              )}

              <div className="rounded-lg border bg-card overflow-hidden">
                {isLoading ? (
                  <Loader className="p-6" />
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
                        onOpenProfile={() =>
                          navigate(`/w/${workspaceId}/people/${member.id}`)
                        }
                        isChecked={checkedIds.has(member.id)}
                        onCheck={toggleCheck}
                        roles={roles}
                        onRoleChange={(memberId, roleId) =>
                          assignRole.mutate(
                            { memberId, roleId },
                            { onError: (err) => showError("Failed to assign role", err) },
                          )
                        }
                        onRemove={(target) =>
                          setConfirmState({
                            message: `Remove ${target.user?.full_name || target.user?.email} from this workspace?`,
                            onConfirm: () =>
                              removeMember.mutate(target.id, {
                                onError: (err) => showError("Failed to remove member", err),
                              }),
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── App Access tab ── */}
        {activeTab === "app-access" && (
          <div key="app-access" className="animate-slide-up">
            <AppAccessTab
              workspaceId={workspaceId}
              members={members}
              roles={roles}
              isAdmin={isAdmin}
              user={user}
              workspace={workspace}
              onSwitchToRoles={() => setActiveTab("roles")}
            />
          </div>
        )}

        {/* ── Roles & Permissions tab ── */}
        {activeTab === "roles" && (
          <div key="roles" className="animate-slide-up">
            <RolesSection
              workspaceId={workspaceId}
              isAdmin={isAdmin}
              onOpenPermissionsRef={() => setPermsRefOpen(true)}
            />
          </div>
        )}
      </div>

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
        <PermissionsModal
          workspaceId={workspaceId}
          onClose={() => setPermsRefOpen(false)}
        />
      )}
    </div>
  );
}
