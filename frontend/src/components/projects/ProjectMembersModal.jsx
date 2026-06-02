import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  X, Users, Lock, Unlock, Link2, Trash2, Plus,
  Check, ChevronDown, Copy, Clock,
} from "lucide-react";
import { useProjectMembers, useAddProjectMember, useUpdateProjectMember, useRemoveProjectMember } from "@/hooks/useProjectMembers";
import { useGuestTokens, useCreateGuestToken, useRevokeGuestToken } from "@/hooks/useGuestTokens";
import { useMembers } from "@/hooks/useMembers";
import { useUpdateProject } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const PROJECT_ROLES = [
  { value: "admin",  label: "Admin",  desc: "Full access, manage members" },
  { value: "editor", label: "Editor", desc: "Create, edit, delete tasks" },
  { value: "viewer", label: "Viewer", desc: "View only, no edits" },
  { value: "guest",  label: "Guest",  desc: "Read-only via share link" },
];

const ROLE_BADGE_VARIANT = {
  admin:  "default",
  editor: "secondary",
  viewer: "muted",
  guest:  "outline",
};

const ACTIONS = ["Create", "Edit", "Delete", "Admin"];
const ROLE_PERMS = {
  admin:  [true,  true,  true,  true ],
  editor: [true,  true,  true,  false],
  viewer: [false, false, false, false],
  guest:  [false, false, false, false],
};

const EXPIRY_OPTIONS = [
  { days: 7,  label: "7 days"  },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
];

const TABS = ["members", "permissions", "sharing"];

export default function ProjectMembersModal({
  open, onClose,
  workspaceSlug, projectId,
  project,
  canAdmin,
}) {
  const [tab, setTab]           = useState("members");
  const [addOpen, setAddOpen]   = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addRole, setAddRole]   = useState("editor");
  const [tokenLabel, setTokenLabel] = useState("");
  const [tokenDays, setTokenDays]   = useState(30);
  const [copied, setCopied]         = useState(null);

  const toast = useToast(); // full object: { toast, success, error, warning, info }

  const { data: projectMembers = [] } = useProjectMembers(workspaceSlug, projectId);
  const { data: wsMembers = [] }       = useMembers(workspaceSlug);
  const { data: guestTokens = [] }     = useGuestTokens(workspaceSlug, projectId);

  const addMember     = useAddProjectMember(workspaceSlug, projectId);
  const updateMember  = useUpdateProjectMember(workspaceSlug, projectId);
  const removeMember  = useRemoveProjectMember(workspaceSlug, projectId);
  const createToken   = useCreateGuestToken(workspaceSlug, projectId);
  const revokeToken   = useRevokeGuestToken(workspaceSlug, projectId);
  const updateProject = useUpdateProject(workspaceSlug, projectId);

  // Workspace members not yet in the project-level list
  const alreadyAdded = new Set(projectMembers.map((m) => m.user.id));
  const addableMembers = wsMembers.filter((m) => !alreadyAdded.has(m.user.id));

  const handleAddMember = () => {
    if (!selectedUserId) return;
    addMember.mutate(
      { user_id: selectedUserId, role: addRole },
      {
        onSuccess: () => {
          setSelectedUserId(""); setAddRole("editor"); setAddOpen(false);
          toast.success("Member added");
        },
        onError: () => toast.error("Failed to add member"),
      }
    );
  };

  const handleCopyLink = (token) => {
    const url = `${window.location.origin}/w/${workspaceSlug}/projects/${projectId}?guest_token=${token.token}`;
    navigator.clipboard.writeText(url);
    setCopied(token.id);
    setTimeout(() => setCopied(null), 2000);
    toast.success("Link copied");
  };

  const handleCreateToken = () => {
    createToken.mutate(
      { label: tokenLabel || "Shared link", days: tokenDays },
      {
        onSuccess: () => { setTokenLabel(""); toast.success("Guest link created"); },
        onError:   () => toast.error("Failed to create link"),
      }
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-xl shadow-xl w-full max-w-2xl animate-scale-in flex flex-col max-h-[85vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Dialog.Title className="text-sm font-semibold">
                Project Access — {project?.name}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div className="flex border-b px-5 flex-shrink-0">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-3 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px",
                  tab === t
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "members" ? "Members" : t === "permissions" ? "Permissions" : "Sharing"}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">

            {/* ── Members tab ── */}
            {tab === "members" && (
              <div className="space-y-4">
                {/* Private toggle */}
                {canAdmin && (
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-background">
                    <div className="flex items-center gap-2.5">
                      {project?.is_private
                        ? <Lock className="w-4 h-4 text-amber-500" />
                        : <Unlock className="w-4 h-4 text-muted-foreground" />
                      }
                      <div>
                        <p className="text-sm font-medium">Private project</p>
                        <p className="text-xs text-muted-foreground">
                          {project?.is_private
                            ? "Only members listed below can see this project."
                            : "Visible to all workspace members."}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        updateProject.mutate({ is_private: !project?.is_private })
                      }
                      className={cn(
                        "relative w-10 h-5 rounded-full transition-colors focus:outline-none",
                        project?.is_private ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                          project?.is_private && "translate-x-5"
                        )}
                      />
                    </button>
                  </div>
                )}

                {/* Member list */}
                <div className="space-y-1.5">
                  {projectMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-background hover:bg-accent/30 transition-colors"
                    >
                      <Avatar
                        name={member.user.display_name || member.user.email}
                        src={member.user.avatar}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.user.display_name || member.user.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{member.user.email}</p>
                      </div>

                      {canAdmin ? (
                        <RoleDropdown
                          value={member.role}
                          onChange={(role) =>
                            updateMember.mutate({ memberId: member.id, role })
                          }
                        />
                      ) : (
                        <Badge variant={ROLE_BADGE_VARIANT[member.role]} size="sm">
                          {member.role}
                        </Badge>
                      )}

                      {canAdmin && (
                        <button
                          onClick={() => removeMember.mutate(member.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {projectMembers.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No project-specific members set — all workspace members inherit their workspace role.
                    </p>
                  )}
                </div>

                {/* Add member */}
                {canAdmin && (
                  <div>
                    {addOpen ? (
                      <div className="flex items-center gap-2 pt-2 border-t mt-2">
                        <select
                          className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                          value={selectedUserId}
                          onChange={(e) => setSelectedUserId(e.target.value)}
                        >
                          <option value="">Select member…</option>
                          {addableMembers.map((m) => (
                            <option key={m.user.id} value={m.user.id}>
                              {m.user.display_name || m.user.email}
                            </option>
                          ))}
                        </select>
                        <RoleDropdown value={addRole} onChange={setAddRole} />
                        <Button
                          size="sm"
                          onClick={handleAddMember}
                          disabled={!selectedUserId || addMember.isPending}
                        >
                          {addMember.isPending ? "Adding…" : "Add"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddOpen(false)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground pt-2 border-t mt-2 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add member override
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Permissions tab ── */}
            {tab === "permissions" && (
              <div>
                <p className="text-xs text-muted-foreground mb-4">
                  Effective permissions per role. The workspace role always caps the project role — the most restrictive wins.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide w-28">Role</th>
                        {ACTIONS.map((a) => (
                          <th key={a} className="text-center py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            {a}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ROLE_PERMS).map(([role, perms]) => (
                        <tr key={role} className="border-b last:border-0 hover:bg-accent/20 transition-colors">
                          <td className="py-3 pr-4">
                            <Badge variant={ROLE_BADGE_VARIANT[role]} size="sm">
                              {role}
                            </Badge>
                          </td>
                          {perms.map((allowed, i) => (
                            <td key={i} className="text-center py-3 px-3">
                              {allowed
                                ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                                : <span className="text-muted-foreground/30 text-lg leading-none">—</span>
                              }
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground space-y-1">
                  <p><strong>Workspace Admin</strong> → always Admin on all projects.</p>
                  <p><strong>Workspace Member</strong> → defaults to Editor; can be restricted per project.</p>
                  <p><strong>Workspace Viewer</strong> → capped at Viewer regardless of project role.</p>
                </div>
              </div>
            )}

            {/* ── Sharing tab ── */}
            {tab === "sharing" && (
              <div className="space-y-5">
                {/* Active tokens */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Active guest links
                  </p>
                  {guestTokens.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No guest links yet.
                    </p>
                  )}
                  {guestTokens.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-background"
                    >
                      <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{t.label || "Shared link"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Expires {formatDistanceToNow(new Date(t.expires_at), { addSuffix: true })}
                          {t.is_expired && (
                            <Badge variant="destructive" size="sm">Expired</Badge>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCopyLink(t)}
                        className={cn(
                          "flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border transition-colors",
                          copied === t.id
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border hover:border-primary hover:text-primary"
                        )}
                      >
                        {copied === t.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied === t.id ? "Copied!" : "Copy link"}
                      </button>
                      {canAdmin && (
                        <button
                          onClick={() => revokeToken.mutate(t.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Revoke"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Create new token */}
                {canAdmin && (
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Create guest link
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="Link label (optional)…"
                        value={tokenLabel}
                        onChange={(e) => setTokenLabel(e.target.value)}
                      />
                      <select
                        className="text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        value={tokenDays}
                        onChange={(e) => setTokenDays(Number(e.target.value))}
                      >
                        {EXPIRY_OPTIONS.map((o) => (
                          <option key={o.days} value={o.days}>{o.label}</option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        onClick={handleCreateToken}
                        disabled={createToken.isPending}
                      >
                        {createToken.isPending ? "Creating…" : "Create"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Guest links grant read-only access. Anyone with the link can view tasks without signing in.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function RoleDropdown({ value, onChange }) {
  const current = PROJECT_ROLES.find((r) => r.value === value);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border bg-background hover:border-primary transition-colors">
          <span className="font-medium capitalize">{current?.label}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </Popover.Trigger>

      {/* Portal renders outside the modal's scroll container — no clipping */}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "w-52 z-[300] bg-popover border rounded-xl shadow-popover py-1",
            "animate-scale-in"
          )}
        >
          {PROJECT_ROLES.map((r) => (
            <Popover.Close asChild key={r.value}>
              <button
                onClick={() => onChange(r.value)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors",
                  value === r.value && "bg-primary/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.label}</span>
                  {value === r.value && <Check className="w-3.5 h-3.5 text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </button>
            </Popover.Close>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
