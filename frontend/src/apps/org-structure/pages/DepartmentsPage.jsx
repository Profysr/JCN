import { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Plus, ChevronRight, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Loader } from "@/shared/components/ui/Loader";
import { Avatar } from "@/shared/components/ui/avatar";
import { useToast } from "@/shared/components/ui/toast";
import Modal from "@/shared/components/ui/Modal";
import { cn } from "@/shared/lib/utils";
import { useMembers } from "@/shared/hooks/useMembers";
import {
  useDepartments,
  useCreateDepartment,
  useUpdateDepartment,
  useDeleteDepartment,
} from "@/apps/org-structure/hooks/useOrg";
import GettingStartedChecklist from "@/apps/org-structure/components/GettingStartedChecklist";

const DEPT_COLORS = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#10b981",
  "#f59e0b", "#ef4444", "#06b6d4", "#ec4899",
];

function generateIdentifier(name) {
  if (!name) return "";
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((w) => w[0]).join("").slice(0, 6).toUpperCase();
}

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
function DeptNode({ node, depth, onEdit, onDelete }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-accent/50 transition-colors"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        {/* Expand toggle */}
        <button
          onClick={() => hasChildren && setOpen((v) => !v)}
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
            onClick={() => onEdit(node)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit department"
            aria-label="Edit department"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(node)}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit modal ───────────────────────────────────────────────────────
const BLANK = {
  name: "",
  identifier: "",
  description: "",
  color: DEPT_COLORS[0],
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
            {DEPT_COLORS.map((c) => (
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
          <select
            value={form.parent_id || ""}
            onChange={(e) => set("parent_id", e.target.value || null)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">No parent (top-level)</option>
            {parentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Head */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Head <span className="text-muted-foreground/50">(optional)</span>
          </label>
          <select
            value={form.head_id || ""}
            onChange={(e) => set("head_id", e.target.value || null)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">No head assigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.user.full_name || m.user.email}
              </option>
            ))}
          </select>
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

  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', dept }
  const [confirmDelete, setConfirmDelete] = useState(null); // null | dept

  const tree = useMemo(() => buildTree(depts), [depts]);

  const openCreate = () => setModal({ mode: "create" });
  const openEdit = (dept) => setModal({ mode: "edit", dept });
  const closeModal = () => setModal(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteDept.mutateAsync(confirmDelete.id);
      toast.success("Department deleted");
      setConfirmDelete(null);
    } catch (err) {
      toast.error(
        "Couldn't delete department",
        err?.response?.data?.detail ?? "Please try again.",
      );
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
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" /> New Department
        </Button>
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
        <div className="rounded-md border border-border overflow-hidden">
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

          {/* Tree */}
          <div className="divide-y divide-border/30 py-1">
            {tree.map((root) => (
              <DeptNode
                key={root.id}
                node={root}
                depth={0}
                onEdit={openEdit}
                onDelete={setConfirmDelete}
              />
            ))}
          </div>
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
