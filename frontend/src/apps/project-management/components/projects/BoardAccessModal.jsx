import { useState, useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  Users,
  Lock,
  Unlock,
  Trash2,
  UserPlus,
  Check,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { useMembers } from "@/shared/hooks/useMembers";
import { useToast } from "@/shared/components/ui/toast";
import { Button } from "@/shared/components/ui/button";
import { Avatar } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import Modal from "@/shared/components/ui/Modal";
import { Loader } from "@/shared/components/ui/Loader";
import { cn } from "@/shared/lib/utils";
import { PROJECT_ROLES, ROLE_BADGE_VARIANT } from "@/shared/lib/constants";
import { useBoardRoleDefinitions } from "../../hooks/useBoardPermissions";
import {
  useBoardMembers,
  useUpdateBoardMember,
  useRemoveBoardMember,
  useBulkAddBoardMembers,
} from "../../hooks/useBoardMembers";
import { useUpdateBoard } from "../../hooks/useBoards";

const TABS = ["members", "permissions"];

export default function BoardAccessModal({
  open,
  onClose,
  workspaceId,
  boardId,
  board,
  canAdmin,
}) {
  const [tab, setTab] = useState("members");
  const [pickerOpen, setPickerOpen] = useState(false);
  const { toast } = useToast();

  const { data: boardMembers = [] } = useBoardMembers(workspaceId, boardId, {
    enabled: open,
  });
  const { data: wsMembers = [] } = useMembers(workspaceId);

  const updateMember = useUpdateBoardMember(workspaceId, boardId);
  const removeMember = useRemoveBoardMember(workspaceId, boardId);
  const updateBoard = useUpdateBoard(workspaceId, boardId);
  const bulkAdd = useBulkAddBoardMembers(workspaceId, boardId);

  const alreadyAdded = useMemo(
    () => new Set(boardMembers.map((m) => m.user.id)),
    [boardMembers],
  );

  const addableMembers = useMemo(
    () => wsMembers.filter((m) => !alreadyAdded.has(m.user.id)),
    [wsMembers, alreadyAdded],
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Project Access — ${board?.name}`}
      icon={Users}
      showFooter={false}
      maxWidth="672px"
      padding="p-0"
    >
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

      {/* Scrollable body */}
      <div className="overflow-y-auto p-5 max-h-[calc(85vh-110px)]">
        {tab === "members" && (
          <div className="space-y-4">
            {canAdmin && (
              <PrivateProjectToggle
                isPrivate={board?.is_private}
                onToggle={() =>
                  updateBoard.mutate({ is_private: !board?.is_private })
                }
              />
            )}

            <div className="space-y-1.5">
              {boardMembers.map((member) => (
                <MemberListItem
                  key={member.id}
                  member={member}
                  canAdmin={canAdmin}
                  onRoleChange={(role) =>
                    updateMember.mutate({ memberId: member.id, role })
                  }
                  onRemove={() => removeMember.mutate(member.id)}
                />
              ))}

              {boardMembers.length === 0 && !pickerOpen && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No board-specific members set — all workspace members inherit
                  their workspace role.
                </p>
              )}
            </div>

            {canAdmin && (
              <BulkMemberPicker
                isOpen={pickerOpen}
                setIsOpen={setPickerOpen}
                addableMembers={addableMembers}
                bulkAdd={bulkAdd}
                toast={toast}
              />
            )}
          </div>
        )}

        {tab === "permissions" && (
          <PermissionsTab workspaceId={workspaceId} boardId={boardId} />
        )}
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* SUB-COMPONENTS                                  */
/* ────────────────────────────────────────────────────────────────────────── */

function PrivateProjectToggle({ isPrivate, onToggle }) {
  return (
    <div
      data-tour="board_access_private_toggle"
      className="flex items-center justify-between p-3 rounded-lg border bg-background"
    >
      <div className="flex items-center gap-2.5">
        {isPrivate ? (
          <Lock className="w-4 h-4 text-amber-500" />
        ) : (
          <Unlock className="w-4 h-4 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Private board</p>
          <p className="text-xs text-muted-foreground">
            {isPrivate
              ? "Only members listed below can see this board."
              : "Visible to all workspace members."}
          </p>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          "relative w-10 h-5 rounded-full transition-colors focus:outline-none",
          isPrivate ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
            isPrivate && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

function MemberListItem({ member, canAdmin, onRoleChange, onRemove }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-background hover:bg-accent/30 transition-colors">
      <Avatar
        user={member.user}
        name={member.user.full_name || member.user.email}
        src={member.user.avatar}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {member.user.full_name || member.user.email}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {member.user.email}
        </p>
      </div>

      {canAdmin ? (
        <RoleDropdown value={member.role} onChange={onRoleChange} />
      ) : (
        <Badge variant={ROLE_BADGE_VARIANT[member.role]} size="sm">
          {member.role}
        </Badge>
      )}

      {canAdmin && (
        <button
          onClick={onRemove}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function BulkMemberPicker({
  isOpen,
  setIsOpen,
  addableMembers,
  bulkAdd,
  toast,
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [bulkRole, setBulkRole] = useState("editor");

  const filteredAddable = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return addableMembers;
    return addableMembers.filter(
      (m) =>
        (m.user.full_name || "").toLowerCase().includes(q) ||
        m.user.email.toLowerCase().includes(q),
    );
  }, [addableMembers, search]);

  const toggleMember = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleAll = () => {
    if (selected.size === filteredAddable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredAddable.map((m) => m.user.id)));
    }
  };

  const handleOpenPicker = () => {
    setSearch("");
    setSelected(new Set());
    setBulkRole("editor");
    setIsOpen(true);
  };

  const handleBulkAdd = () => {
    if (!selected.size) return;
    const members = [...selected].map((user_id) => ({
      user_id,
      role: bulkRole,
    }));
    bulkAdd.mutate(members, {
      onSuccess: ({ created, skipped }) => {
        const msg =
          created.length === 1
            ? "1 member added"
            : `${created.length} members added`;
        toast.success(
          skipped.length ? `${msg} (${skipped.length} already in board)` : msg,
        );
        setIsOpen(false);
      },
      onError: () => toast.error("Failed to add members"),
    });
  };

  if (!isOpen) {
    return (
      <div className="border-t pt-3 mt-1">
        <button
          data-tour="board_add_members"
          onClick={handleOpenPicker}
          disabled={addableMembers.length === 0}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <UserPlus className="w-4 h-4" />
          {addableMembers.length === 0
            ? "All workspace members already added"
            : "Add members"}
        </button>
      </div>
    );
  }

  return (
    <div className="border-t pt-3 mt-1 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select members to add"}
        </p>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div data-tour="board_member_search" className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          autoFocus
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="border rounded-md overflow-hidden max-h-52 overflow-y-auto">
        {filteredAddable.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No members match your search.
          </p>
        ) : (
          <>
            <button
              onClick={toggleAll}
              className="w-full flex items-center gap-3 px-3 py-2 text-xs text-muted-foreground hover:bg-accent/40 border-b bg-muted/30 transition-colors"
            >
              <span
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                  selected.size === filteredAddable.length
                    ? "bg-primary border-primary"
                    : "border-border",
                )}
              >
                {selected.size === filteredAddable.length && (
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                )}
              </span>
              <span className="font-medium">
                {selected.size === filteredAddable.length
                  ? "Deselect all"
                  : `Select all (${filteredAddable.length})`}
              </span>
            </button>

            {filteredAddable.map((m) => {
              const isChecked = selected.has(m.user.id);
              return (
                <button
                  key={m.user.id}
                  onClick={() => toggleMember(m.user.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors",
                    isChecked && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      isChecked ? "bg-primary border-primary" : "border-border",
                    )}
                  >
                    {isChecked && (
                      <Check className="w-2.5 h-2.5 text-primary-foreground" />
                    )}
                  </span>
                  <Avatar
                    user={m.user}
                    name={m.user.full_name || m.user.email}
                    src={m.user.avatar}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.user.full_name || m.user.email}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.user.email}
                    </p>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Assign as</span>
        <RoleDropdown value={bulkRole} onChange={setBulkRole} />
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleBulkAdd}
          disabled={selected.size === 0 || bulkAdd.isPending}
        >
          {bulkAdd.isPending
            ? "Adding…"
            : selected.size > 0
              ? `Add ${selected.size} member${selected.size > 1 ? "s" : ""}`
              : "Add members"}
        </Button>
      </div>
    </div>
  );
}

function PermissionsTab({ workspaceId, boardId }) {
  const { data: roleDefs, isLoading } = useBoardRoleDefinitions(
    workspaceId,
    boardId,
  );

  // Derive column headers from the first role's keys — no hardcoding needed.
  const actions = roleDefs ? Object.keys(Object.values(roleDefs)[0]) : [];

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-4">
        Effective permissions per role. The workspace role always caps the board
        role — the most restrictive wins.
      </p>
      <div className="overflow-x-auto">
        {isLoading ? (
          <Loader className="py-8" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide w-28">
                  Role
                </th>
                {actions.map((action) => (
                  <th
                    key={action}
                    className="text-center py-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide"
                  >
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(roleDefs).map(([role, perms]) => (
                <tr
                  key={role}
                  className="border-b last:border-0 hover:bg-accent/20 transition-colors"
                >
                  <td className="py-3 pr-4">
                    <Badge variant={ROLE_BADGE_VARIANT[role]} size="sm">
                      {role}
                    </Badge>
                  </td>
                  {actions.map((action) => (
                    <td key={action} className="text-center py-3 px-3">
                      {perms[action] ? (
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
        )}
      </div>
      <div className="mt-4 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Workspace Admin</strong> → always Admin on all projects.
        </p>
        <p>
          <strong>Workspace Member</strong> → defaults to Editor; can be
          restricted per board.
        </p>
        <p>
          <strong>Workspace Viewer</strong> → capped at Viewer regardless of
          board role.
        </p>
      </div>
    </div>
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

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            "w-52 z-[1000] bg-popover border rounded-md shadow-popover py-1",
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
