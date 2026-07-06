import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Plus, Pencil, Trash2, Users, Crown, X, Search,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import Select from "@/shared/components/ui/Select";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Loader } from "@/shared/components/ui/Loader";
import { Avatar } from "@/shared/components/ui/avatar";
import { useToast } from "@/shared/components/ui/toast";
import Modal from "@/shared/components/ui/Modal";
import { ShortcutTooltip } from "@/shared/components/ui/ShortcutTooltip";
import { cn } from "@/shared/lib/utils";
import { useMembers } from "@/shared/hooks/useMembers";
import { useCreateShortcut } from "@/apps/people/hooks/usePeopleShortcuts";
import {
  useTeams,
  useTeamMembers,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useAddTeamMember,
  useRemoveTeamMember,
  useDepartments,
} from "@/apps/people/hooks/useOrg";
import { ORG_COLORS, generateIdentifier } from "@/apps/people/constants";

// ── Team card ─────────────────────────────────────────────────────────────────
function TeamCard({ team, isSelected, onClick }) {
  const _memberUsers = [];

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-md border p-4 transition-all duration-150 group shadow-sm hover:shadow-card-hover",
        isSelected
          ? "border-primary/50 bg-primary/5 shadow-card"
          : "border-border bg-card hover:border-primary/30",
      )}
    >
      {/* Team avatar + identifier */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-bold text-xs text-white flex-shrink-0"
          style={{ background: team.color }}
        >
          {team.identifier}
        </div>
        {team.department && (
          <span
            className="px-2 py-0.5 rounded text-[10px] font-semibold"
            style={{
              background: team.department.color + "22",
              color: team.department.color,
            }}
          >
            {team.department.name}
          </span>
        )}
      </div>

      {/* Name */}
      <p className="font-semibold text-sm truncate">{team.name}</p>
      {team.description && (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {team.description}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/50">
        {team.lead ? (
          <div className="flex items-center gap-1.5">
            <Avatar user={team.lead.user} size="xs" />
            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
              {team.lead.user.full_name}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/40 italic">No lead</span>
        )}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          {team.member_count}
        </span>
      </div>
    </button>
  );
}

// ── Team detail panel ─────────────────────────────────────────────────────────
function TeamDetail({ team, workspaceId, allMembers, onEdit, onClose }) {
  const { data: memberships = [], isLoading } = useTeamMembers(workspaceId, team.id);
  const removeTeamMember = useRemoveTeamMember(workspaceId, team.id);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  const memberIds = new Set(memberships.map((m) => m.member.id));

  const availableToAdd = useMemo(
    () =>
      allMembers.filter(
        (m) =>
          !memberIds.has(m.id) &&
          (memberSearch === "" ||
            m.user.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
            m.user.email.toLowerCase().includes(memberSearch.toLowerCase())),
      ),
    [allMembers, memberIds, memberSearch],
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold text-xs text-white flex-shrink-0"
          style={{ background: team.color }}
        >
          {team.identifier}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm truncate">{team.name}</h2>
          {team.department && (
            <span className="text-xs text-muted-foreground">
              {team.department.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(team)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit team"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Description */}
        {team.description && (
          <p className="text-sm text-muted-foreground">{team.description}</p>
        )}

        {/* Lead */}
        {team.lead && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/40 border border-border/50">
            <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <Avatar user={team.lead.user} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {team.lead.user.full_name}
              </p>
              <p className="text-xs text-muted-foreground truncate">Team lead</p>
            </div>
          </div>
        )}

        {/* Members */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Members ({memberships.length})
            </h3>
            <button
              onClick={() => setShowAddMember((v) => !v)}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              + Add member
            </button>
          </div>

          {/* Add member search */}
          {showAddMember && (
            <AddMemberPanel
              workspaceId={workspaceId}
              teamId={team.id}
              available={availableToAdd}
              search={memberSearch}
              onSearchChange={setMemberSearch}
              onAdded={() => {
                setShowAddMember(false);
                setMemberSearch("");
              }}
            />
          )}

          {isLoading && <Loader className="h-16" />}

          {!isLoading && memberships.length === 0 && (
            <p className="text-sm text-muted-foreground/60 italic text-center py-4">
              No members yet
            </p>
          )}

          <div className="space-y-1 mt-2">
            {memberships.map((m) => (
              <div
                key={m.id}
                className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/40 transition-colors"
              >
                <Avatar user={m.member.user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.member.user.full_name || m.member.user.email}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.member.user.email}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {m.is_lead && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Lead
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground capitalize">
                    {m.member.role}
                  </span>
                  <button
                    onClick={() => removeTeamMember.mutate(m.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from team"
                    aria-label="Remove from team"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add member panel (inline search inside detail) ─────────────────────────
function AddMemberPanel({ workspaceId, teamId, available, search, onSearchChange, onAdded }) {
  const addMember = useAddTeamMember(workspaceId, teamId);

  const handleAdd = async (memberId) => {
    await addMember.mutateAsync({ member_id: memberId });
    onAdded();
  };

  return (
    <div className="mb-3 rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search members…"
          className="pl-8 h-8 text-xs"
          autoFocus
        />
      </div>
      {available.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">
          {search ? "No members found" : "All members are already in this team"}
        </p>
      ) : (
        <div className="space-y-0.5 max-h-40 overflow-y-auto">
          {available.map((m) => (
            <button
              key={m.id}
              onClick={() => handleAdd(m.id)}
              disabled={addMember.isPending}
              className="w-full flex items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent transition-colors"
            >
              <Avatar user={m.user} size="xs" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">
                  {m.user.full_name || m.user.email}
                </p>
              </div>
              <span className="text-[10px] text-primary font-medium">Add</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit team modal ──────────────────────────────────────────────────
const BLANK = {
  name: "",
  identifier: "",
  description: "",
  color: ORG_COLORS[0],
  department_id: null,
  lead_id: null,
};

function TeamFormModal({ isOpen, onClose, initialData, departments, members, workspaceId }) {
  const [form, setForm] = useState(BLANK);
  const [identifierLocked, setIdentifierLocked] = useState(false);
  const isEditing = !!initialData;

  const createTeam = useCreateTeam(workspaceId);
  const updateTeam = useUpdateTeam(workspaceId);
  const isPending = createTeam.isPending || updateTeam.isPending;

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setForm({
        name: initialData.name,
        identifier: initialData.identifier,
        description: initialData.description || "",
        color: initialData.color,
        department_id: initialData.department?.id || null,
        lead_id: initialData.lead?.id || null,
      });
      setIdentifierLocked(true);
    } else {
      setForm(BLANK);
      setIdentifierLocked(false);
    }
  }, [isOpen, initialData]);

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleNameChange = (e) => {
    set("name", e.target.value);
    if (!identifierLocked) set("identifier", generateIdentifier(e.target.value));
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      identifier: form.identifier.trim(),
      description: form.description.trim(),
      color: form.color,
    };
    if (form.department_id) payload.department_id = form.department_id;
    if (form.lead_id) payload.lead_id = form.lead_id;

    if (isEditing) {
      await updateTeam.mutateAsync({ teamId: initialData.id, ...payload });
    } else {
      await createTeam.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Team" : "Create Team"}
      onConfirm={handleSubmit}
      confirmLabel={isEditing ? "Save changes" : "Create"}
      isLoading={isPending}
      isConfirmDisabled={!form.name.trim() || !form.identifier.trim()}
    >
      <div className="space-y-4">
        {/* Name + Identifier */}
        <div className="flex gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={form.name}
              onChange={handleNameChange}
              placeholder="Frontend"
              autoFocus
            />
          </div>
          <div className="w-28 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Identifier</label>
            <Input
              value={form.identifier}
              onChange={(e) => {
                setIdentifierLocked(true);
                set("identifier", e.target.value.slice(0, 6).toUpperCase());
              }}
              placeholder="FE"
              className="font-mono uppercase"
              maxLength={6}
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Description <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What this team works on…"
            rows={2}
            className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>

        {/* Color */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Color</label>
          <div className="flex gap-2">
            {ORG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform active:scale-90",
                  form.color === c && "ring-2 ring-offset-2 ring-offset-background scale-110",
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {/* Department */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Department <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <Select
            placeholder="No department (cross-functional)"
            value={form.department_id || ""}
            onChange={(v) => set("department_id", v || null)}
            options={[
              { value: "", label: "No department (cross-functional)" },
              ...departments.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>

        {/* Lead */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Team Lead <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <Select
            searchable
            placeholder="No lead assigned"
            value={form.lead_id || ""}
            onChange={(v) => set("lead_id", v || null)}
            options={[
              { value: "", label: "No lead assigned" },
              ...members.map((m) => ({
                value: m.id,
                label: m.user.full_name || m.user.email,
                avatar: { name: m.user.full_name || m.user.email, src: m.user.avatar },
              })),
            ]}
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TeamsPage() {
  const { workspaceId } = useParams();
  const { data: teams = [], isLoading } = useTeams(workspaceId);
  const { data: departments = [] } = useDepartments(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const deleteTeam = useDeleteTeam(workspaceId);
  const { toast } = useToast();

  const [selectedTeam, setSelectedTeam] = useState(null);
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', team }
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Keep selectedTeam in sync when teams list updates
  useEffect(() => {
    if (selectedTeam) {
      const updated = teams.find((t) => t.id === selectedTeam.id);
      if (updated) setSelectedTeam(updated);
      else setSelectedTeam(null);
    }
  }, [teams]);

  const openCreate = () => setModal({ mode: "create" });
  const openEdit = (team) => {
    setModal({ mode: "edit", team });
  };

  useCreateShortcut(openCreate, { disabled: !!modal });
  const closeModal = () => setModal(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteTeam.mutateAsync(confirmDelete.id);
      if (selectedTeam?.id === confirmDelete.id) setSelectedTeam(null);
      setConfirmDelete(null);
      toast.success("Team deleted");
    } catch (err) {
      toast.error(
        "Couldn't delete team",
        err.message,
      );
    }
  };

  const handleCloseDetail = () => setSelectedTeam(null);

  return (
    <div className="p-8 h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {teams.length} team{teams.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        <ShortcutTooltip label="New Team" shortcut="n" side="bottom">
          <Button data-tour="create_team" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> New Team
          </Button>
        </ShortcutTooltip>
      </div>

      {/* Content */}
      {isLoading && <Loader className="h-48" />}

      {!isLoading && teams.length === 0 && (
        <EmptyState
          illustration="members"
          title="No teams yet"
          description="Create teams to group members by function or project."
          action={
            <ShortcutTooltip label="New Team" shortcut="n" side="bottom">
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" /> New Team
              </Button>
            </ShortcutTooltip>
          }
        />
      )}

      {!isLoading && teams.length > 0 && (
        <div className={cn("flex gap-6", selectedTeam ? "items-start" : "")}>
          {/* Grid */}
          <div
            className={cn(
              "grid gap-4 transition-all duration-200",
              selectedTeam
                ? "flex-1 grid-cols-1 sm:grid-cols-2"
                : "w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            )}
          >
            {teams.map((team) => (
              <div key={team.id} className="relative group/card">
                <TeamCard
                  team={team}
                  isSelected={selectedTeam?.id === team.id}
                  onClick={() =>
                    setSelectedTeam(selectedTeam?.id === team.id ? null : team)
                  }
                />
                {/* Card delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(team);
                  }}
                  className="absolute top-2 right-2 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/card:opacity-100 transition-all"
                  title="Delete team"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {selectedTeam && (
            <div className="w-80 flex-shrink-0 rounded-md border border-border bg-card shadow-card overflow-hidden max-h-[calc(100vh-180px)] flex flex-col">
              <TeamDetail
                team={selectedTeam}
                workspaceId={workspaceId}
                allMembers={members}
                onEdit={openEdit}
                onClose={handleCloseDetail}
              />
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <TeamFormModal
        isOpen={modal !== null}
        onClose={closeModal}
        initialData={modal?.mode === "edit" ? modal.team : null}
        departments={departments}
        members={members}
        workspaceId={workspaceId}
      />

      {/* Delete confirm */}
      <Modal
        variant="delete"
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        isLoading={deleteTeam.isPending}
      >
        <p className="text-sm text-muted-foreground">
          This will permanently delete the team. Members won&apos;t be removed
          from the workspace.
        </p>
      </Modal>
    </div>
  );
}
