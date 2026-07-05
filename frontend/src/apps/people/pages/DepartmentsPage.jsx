import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { Plus, ChevronRight, Pencil, Trash2, Users, X, Search, Settings2, Crown } from "lucide-react";
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
import { usePermission } from "@/contexts/PermissionsContext";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
  useDepartmentMembers,
  useAddDepartmentMember,
  useRemoveDepartmentMember,
} from "@/apps/people/hooks/useOrg";
import GettingStartedChecklist from "@/apps/people/components/GettingStartedChecklist";
import { ORG_COLORS, generateIdentifier } from "@/apps/people/constants";

function buildTree(depts) {
  const map = {};
  depts.forEach((d) => { map[d.id] = { ...d, children: [] }; });
  const roots = [];
  depts.forEach((d) => {
    if (d.parent?.id && map[d.parent.id]) {
      map[d.parent.id].children.push(map[d.id]);
    } else {
      roots.push(map[d.id]);
    }
  });
  return roots;
}

// ── Department row (recursive) ────────────────────────────────────────────────
function DeptNode({ node, depth, onEdit, onDelete, onSelect, selectedId }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md py-1.5 pr-2 transition-colors cursor-pointer",
          isSelected ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/50",
        )}
        style={{ paddingLeft: `${8 + depth * 20}px` }}
        onClick={() => onSelect?.(node)}
      >
        {/* Expand toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); hasChildren && setOpen((v) => !v); }}
          className={cn(
            "w-5 h-5 flex items-center justify-center rounded flex-shrink-0 text-muted-foreground transition-transform duration-150",
            hasChildren
              ? "hover:bg-accent cursor-pointer"
              : "opacity-0 pointer-events-none",
            open && "rotate-90",
          )}
        >
          <ChevronRight className="w-3 h-3" />
        </button>

        {/* Color swatch */}
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: node.color }}
        />

        {/* Identifier */}
        <span
          className="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded flex-shrink-0"
          style={{ background: node.color + "22", color: node.color }}
        >
          {node.identifier}
        </span>

        {/* Name */}
        <span className="flex-1 text-sm font-medium truncate">{node.name}</span>

        {/* Head avatar */}
        {node.head && (
          <Avatar
            user={node.head.user}
            size="xs"
            className="flex-shrink-0"
          />
        )}

        {/* Member count */}
        <span className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
          <Users className="w-3 h-3" />
          {node.member_count}
        </span>

        {/* Hover actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(node); }}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit department"
            aria-label="Edit department"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete department"
            aria-label="Delete department"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && hasChildren && (
        <div className="border-l border-border/40 ml-[18px]">
          {node.children.map((child) => (
            <DeptNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onSelect={onSelect}
              selectedId={selectedId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Department detail panel ───────────────────────────────────────────────────
function DeptAddMemberPanel({ workspaceId, deptId, available, search, onSearchChange, onAdded }) {
  const addMember = useAddDepartmentMember(workspaceId, deptId);

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
          {search ? "No members found" : "All members are already in this department"}
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
                <p className="text-xs font-medium truncate">{m.user.full_name || m.user.email}</p>
              </div>
              <span className="text-[10px] text-primary font-medium">Add</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DeptDetail({ dept, workspaceId, allMembers, onEdit, onClose }) {
  const { data: memberships = [], isLoading } = useDepartmentMembers(workspaceId, dept.id);
  const removeMember = useRemoveDepartmentMember(workspaceId, dept.id);
  const [showAdd, setShowAdd] = useState(false);
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
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: dept.color }}
        />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-sm truncate">{dept.name}</h2>
          {dept.parent && (
            <span className="text-xs text-muted-foreground">{dept.parent.name}</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(dept)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit department"
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
        {dept.description && (
          <p className="text-sm text-muted-foreground">{dept.description}</p>
        )}

        {/* Head */}
        {dept.head && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/40 border border-border/50">
            <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <Avatar user={dept.head.user} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{dept.head.user.full_name}</p>
              <p className="text-xs text-muted-foreground">Department head</p>
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
              onClick={() => setShowAdd((v) => !v)}
              className="text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              + Add member
            </button>
          </div>

          {showAdd && (
            <DeptAddMemberPanel
              workspaceId={workspaceId}
              deptId={dept.id}
              available={availableToAdd}
              search={memberSearch}
              onSearchChange={setMemberSearch}
              onAdded={() => { setShowAdd(false); setMemberSearch(""); }}
            />
          )}

          {isLoading && <Loader className="h-16" />}

          {!isLoading && memberships.length === 0 && (
            <p className="text-sm text-muted-foreground/60 italic text-center py-4">No members yet</p>
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
                  <p className="text-xs text-muted-foreground truncate">{m.member.user.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {m.is_head && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      Head
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-muted text-muted-foreground capitalize">
                    {m.member.role}
                  </span>
                  <button
                    onClick={() => removeMember.mutate(m.id)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from department"
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

// ── Create / Edit modal ───────────────────────────────────────────────────────
const BLANK = {
  name: "",
  identifier: "",
  description: "",
  color: ORG_COLORS[0],
  parent_id: null,
  head_id: null,
};

function DeptFormModal({ isOpen, onClose, initialData, allDepts, members, workspaceId }) {
  const [form, setForm] = useState(BLANK);
  const [identifierLocked, setIdentifierLocked] = useState(false);
  const isEditing = !!initialData;

  const createDept = useCreateDepartment(workspaceId);
  const updateDept = useUpdateDepartment(workspaceId);
  const isPending = createDept.isPending || updateDept.isPending;

  useEffect(() => {
    if (!isOpen) return;
    if (initialData) {
      setForm({
        name: initialData.name,
        identifier: initialData.identifier,
        description: initialData.description || "",
        color: initialData.color,
        parent_id: initialData.parent?.id || null,
        head_id: initialData.head?.id || null,
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
    if (!identifierLocked) {
      set("identifier", generateIdentifier(e.target.value));
    }
  };

  const handleSubmit = async () => {
    const payload = {
      name: form.name.trim(),
      identifier: form.identifier.trim(),
      description: form.description.trim(),
      color: form.color,
    };
    if (form.parent_id) payload.parent_id = form.parent_id;
    if (form.head_id) payload.head_id = form.head_id;

    if (isEditing) {
      await updateDept.mutateAsync({ deptId: initialData.id, ...payload });
    } else {
      await createDept.mutateAsync(payload);
    }
    onClose();
  };

  const parentOptions = allDepts.filter(
    (d) => !isEditing || d.id !== initialData?.id,
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Department" : "Create Department"}
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
              placeholder="Engineering"
              autoFocus
            />
          </div>
          <div className="w-28 space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Identifier
            </label>
            <Input
              value={form.identifier}
              onChange={(e) => {
                setIdentifierLocked(true);
                set("identifier", e.target.value.slice(0, 6).toUpperCase());
              }}
              placeholder="ENG"
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
            placeholder="What this department does…"
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
                style={{ background: c, ringColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Parent department */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Parent Department <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <Select
            placeholder="No parent (top-level)"
            value={form.parent_id || ""}
            onChange={(v) => set("parent_id", v || null)}
            options={[
              { value: "", label: "No parent (top-level)" },
              ...parentOptions.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>

        {/* Head */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Head <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <Select
            searchable
            placeholder="No head assigned"
            value={form.head_id || ""}
            onChange={(v) => set("head_id", v || null)}
            options={[
              { value: "", label: "No head assigned" },
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
export default function DepartmentsPage() {
  const { workspaceId } = useParams();
  const { data: depts = [], isLoading } = useDepartments(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const deleteDept = useDeleteDepartment(workspaceId);
  const { toast } = useToast();
  const { isOwner, can } = usePermission();
  const isAdmin = isOwner || can("org.manage");

  const [selectedDept, setSelectedDept] = useState(null);
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', dept }
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Keep selectedDept in sync when depts list updates
  useEffect(() => {
    if (selectedDept) {
      const updated = depts.find((d) => d.id === selectedDept.id);
      if (updated) setSelectedDept(updated);
      else setSelectedDept(null);
    }
  }, [depts]);

  const tree = useMemo(() => buildTree(depts), [depts]);

  const openCreate = () => setModal({ mode: "create" });
  const openEdit = (dept) => { setModal({ mode: "edit", dept }); };

  useEffect(() => {
    const handleKey = (e) => {
      if (modal) return;
      if (e.target.matches("input,textarea,[contenteditable]")) return;
      if (e.key === "n") { e.preventDefault(); openCreate(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [modal]);
  const closeModal = () => setModal(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDept.mutateAsync(confirmDelete.id);
      toast.success("Department deleted");
      if (selectedDept?.id === confirmDelete.id) setSelectedDept(null);
      setConfirmDelete(null);
    } catch (err) {
      toast.error("Couldn't delete department", err.message);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <GettingStartedChecklist />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {depts.length} department{depts.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              to={`/w/${workspaceId}/org/job-titles`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border rounded-md px-3 py-1.5 hover:bg-accent transition-colors"
            >
              <Settings2 className="w-4 h-4" /> Job Titles
            </Link>
          )}
          <ShortcutTooltip label="New Department" shortcut="n" side="bottom">
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> New Department
            </Button>
          </ShortcutTooltip>
        </div>
      </div>

      {/* Content */}
      {isLoading && <Loader className="h-48" />}

      {!isLoading && depts.length === 0 && (
        <EmptyState
          illustration="members"
          title="No departments yet"
          description="Add departments to give your workspace a company structure."
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> New Department
            </Button>
          }
        />
      )}

      {!isLoading && depts.length > 0 && (
        <div className={cn("flex gap-6", selectedDept ? "items-start" : "")}>
          {/* Tree */}
          <div className={cn("flex-1 rounded-md border border-border overflow-hidden")}>
            {/* Column headers */}
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <div className="w-5 flex-shrink-0" />
              <div className="w-2.5 flex-shrink-0" />
              <div className="w-10 flex-shrink-0" />
              <div className="flex-1">Name</div>
              <div className="w-6 flex-shrink-0" />
              <div className="w-12 flex-shrink-0 text-right">Members</div>
              <div className="w-14 flex-shrink-0" />
            </div>
            <div className="divide-y divide-border/30 py-1">
              {tree.map((root) => (
                <DeptNode
                  key={root.id}
                  node={root}
                  depth={0}
                  onEdit={openEdit}
                  onDelete={setConfirmDelete}
                  onSelect={(d) => setSelectedDept((prev) => prev?.id === d.id ? null : d)}
                  selectedId={selectedDept?.id}
                />
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selectedDept && (
            <div className="w-80 flex-shrink-0 rounded-md border border-border bg-card shadow-card overflow-hidden max-h-[calc(100vh-220px)] flex flex-col">
              <DeptDetail
                dept={selectedDept}
                workspaceId={workspaceId}
                allMembers={members}
                onEdit={openEdit}
                onClose={() => setSelectedDept(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* Create / Edit modal */}
      <DeptFormModal
        isOpen={modal !== null}
        onClose={closeModal}
        initialData={modal?.mode === "edit" ? modal.dept : null}
        allDepts={depts}
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
        isLoading={deleteDept.isPending}
      >
        <p className="text-sm text-muted-foreground">
          This will permanently delete the department and all its sub-departments.
          Members won&apos;t be removed from the workspace.
        </p>
      </Modal>
    </div>
  );
}
