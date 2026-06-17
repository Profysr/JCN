import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  X,
  Users,
  Lock,
  Unlock,
  Trash2,
  Plus,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  useBoardMembers,
  useAddBoardMember,
  useUpdateBoardMember,
  useRemoveBoardMember,
} from "@/hooks/useProjectMembers";
import { useMembers } from "@/hooks/useMembers";
import { useUpdateBoard } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PROJECT_ROLES,
  ROLE_BADGE_VARIANT,
  ROLE_PERMS,
  PERMISSION_MATRIX_ACTIONS,
} from "@/lib/constants";

const TABS = ["members", "permissions"];

export default function ProjectMembersModal({
  open,
  onClose,
  workspaceId,
  boardId,
  project,
  canAdmin,
}) {
  const [tab, setTab] = useState("members");
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [addRole, setAddRole] = useState("editor");

  const toast = useToast();

  const { data: projectMembers = [] } = useBoardMembers(workspaceId, boardId, { enabled: open });
  const { data: wsMembers = [] } = useMembers(workspaceId);

  const addMember = useAddBoardMember(workspaceId, boardId);
  const updateMember = useUpdateBoardMember(workspaceId, boardId);
  const removeMember = useRemoveBoardMember(workspaceId, boardId);
  const updateProject = useUpdateBoard(workspaceId, boardId);

  // Workspace members not yet in the project-level list
  const alreadyAdded = new Set(projectMembers.map((m) => m.user.id));
  const addableMembers = wsMembers.filter((m) => !alreadyAdded.has(m.user.id));

  const handleAddMember = () => {
    if (!selectedUserId) return;
    addMember.mutate(
      { user_id: selectedUserId, role: addRole },
      {
        onSuccess: () => {
          setSelectedUserId("");
          setAddRole("editor");
          setAddOpen(false);
          toast.success("Member added");
        },
        onError: () => toast.error("Failed to add member"),
      },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-md shadow-xl w-full max-w-2xl animate-scale-in flex flex-col max-h-[85vh]">
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
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "members" ? "Members" : "Permissions"}
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
                      {project?.is_private ? (
                        <Lock className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Unlock className="w-4 h-4 text-muted-foreground" />
                      )}
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
                        updateProject.mutate({
                          is_private: !project?.is_private,
                        })
                      }
                      className={cn(
                        "relative w-10 h-5 rounded-full transition-colors focus:outline-none",
                        project?.is_private ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                          project?.is_private && "translate-x-5",
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
                        <p className="text-sm font-medium truncate">
                          {member.user.display_name || member.user.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {member.user.email}
                        </p>
                      </div>

                      {canAdmin ? (
                        <RoleDropdown
                          value={member.role}
                          onChange={(role) =>
                            updateMember.mutate({ memberId: member.id, role })
                          }
                        />
                      ) : (
                        <Badge
                          variant={ROLE_BADGE_VARIANT[member.role]}
                          size="sm"
                        >
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
                      No project-specific members set — all workspace members
                      inherit their workspace role.
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
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAddOpen(false)}
                        >
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
                  Effective permissions per role. The workspace role always caps
                  the project role — the most restrictive wins.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide w-28">
                          Role
                        </th>
                        {PERMISSION_MATRIX_ACTIONS.map((a) => (
                          <th
                            key={a.label}
                            className="text-center py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                          >
                            {a.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(ROLE_PERMS).map(([role, perms]) => (
                        <tr
                          key={role}
                          className="border-b last:border-0 hover:bg-accent/20 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <Badge variant={ROLE_BADGE_VARIANT[role]} size="sm">
                              {role}
                            </Badge>
                          </td>
                          {perms.map((allowed, i) => (
                            <td key={i} className="text-center py-3 px-3">
                              {allowed ? (
                                <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                              ) : (
                                <span className="text-muted-foreground/30 text-lg leading-none">
                                  —
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground space-y-1">
                  <p>
                    <strong>Workspace Admin</strong> → always Admin on all
                    projects.
                  </p>
                  <p>
                    <strong>Workspace Member</strong> → defaults to Editor; can
                    be restricted per project.
                  </p>
                  <p>
                    <strong>Workspace Viewer</strong> → capped at Viewer
                    regardless of project role.
                  </p>
                </div>
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
            "w-52 z-[300] bg-popover border rounded-md shadow-popover py-1",
            "animate-scale-in",
          )}
        >
          {PROJECT_ROLES.map((r) => (
            <Popover.Close asChild key={r.value}>
              <button
                onClick={() => onChange(r.value)}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-accent transition-colors",
                  value === r.value && "bg-primary/5",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.label}</span>
                  {value === r.value && (
                    <Check className="w-3.5 h-3.5 text-primary" />
                  )}
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
