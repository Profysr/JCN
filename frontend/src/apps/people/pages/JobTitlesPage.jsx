import { useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { useToast } from "@/shared/components/ui/toast";
import Modal from "@/shared/components/ui/Modal";
import { ShortcutTooltip } from "@/shared/components/ui/ShortcutTooltip";
import { useCreateShortcut } from "@/apps/people/hooks/usePeopleShortcuts";
import {
  useJobTitles,
  useCreateJobTitle,
  useUpdateJobTitle,
  useDeleteJobTitle,
} from "@/apps/people/hooks/useOrg";

const BLANK = { name: "", level: 0 };

function JobTitleFormModal({ isOpen, onClose, initialData, workspaceId }) {
  const [form, setForm] = useState(BLANK);
  const isEditing = !!initialData;

  const createTitle = useCreateJobTitle(workspaceId);
  const updateTitle = useUpdateJobTitle(workspaceId);
  const isPending = createTitle.isPending || updateTitle.isPending;

  // reset on open
  useState(() => {
    if (isOpen) {
      setForm(initialData ? { name: initialData.name, level: initialData.level } : BLANK);
    }
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    const payload = { name: form.name.trim(), level: Number(form.level) };
    if (isEditing) {
      await updateTitle.mutateAsync({ titleId: initialData.id, ...payload });
    } else {
      await createTitle.mutateAsync(payload);
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Edit Job Title" : "New Job Title"}
      onConfirm={handleSubmit}
      confirmLabel={isEditing ? "Save" : "Create"}
      isLoading={isPending}
      isConfirmDisabled={!form.name.trim()}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Title Name</Label>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Senior Engineer"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            Level{" "}
            <span className="text-muted-foreground font-normal">(optional — used for ordering)</span>
          </Label>
          <Input
            type="number"
            min={0}
            value={form.level}
            onChange={(e) => set("level", e.target.value)}
            placeholder="0"
            className="w-28"
          />
          <p className="text-xs text-muted-foreground">
            Lower number = higher seniority. Titles with the same level are sorted alphabetically.
          </p>
        </div>
      </div>
    </Modal>
  );
}

export default function JobTitlesPage() {
  const { workspaceId } = useParams();
  const { data: titles = [], isLoading } = useJobTitles(workspaceId);
  const deleteTitle = useDeleteJobTitle(workspaceId);
  const { toast } = useToast();

  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', title }
  const [confirmDelete, setConfirmDelete] = useState(null);
  // reset form when modal opens
  const [formKey, setFormKey] = useState(0);

  const openCreate = () => { setFormKey((k) => k + 1); setModal({ mode: "create" }); };
  const openEdit = (title) => { setFormKey((k) => k + 1); setModal({ mode: "edit", title }); };
  const closeModal = () => setModal(null);

  useCreateShortcut(openCreate, { disabled: !!modal });

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteTitle.mutateAsync(confirmDelete.id);
      toast.success("Job title deleted");
      setConfirmDelete(null);
    } catch {
      toast.error("Couldn't delete job title", "It may be in use by existing profiles.");
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Job Titles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define the titles available in your workspace for member profiles.
          </p>
        </div>
        <ShortcutTooltip label="New Title" shortcut="n" side="bottom">
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" /> New Title
          </Button>
        </ShortcutTooltip>
      </div>

      {isLoading && <Loader className="h-48" />}

      {!isLoading && titles.length === 0 && (
        <EmptyState
          illustration="members"
          title="No job titles yet"
          description="Add titles so members can select them when setting up their profile."
          action={
            <ShortcutTooltip label="New Title" shortcut="n" side="bottom">
              <Button onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1.5" /> New Title
              </Button>
            </ShortcutTooltip>
          }
        />
      )}

      {!isLoading && titles.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div className="w-4 flex-shrink-0" />
            <div className="flex-1">Title</div>
            <div className="w-16 text-center">Level</div>
            <div className="w-16" />
          </div>

          <div className="divide-y divide-border/40">
            {titles.map((title) => (
              <div
                key={title.id}
                className="group flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                <span className="flex-1 text-sm font-medium">{title.name}</span>
                <span className="w-16 text-center text-xs text-muted-foreground font-mono">
                  {title.level}
                </span>
                <div className="w-16 flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(title)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(title)}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <JobTitleFormModal
        key={formKey}
        isOpen={modal !== null}
        onClose={closeModal}
        initialData={modal?.mode === "edit" ? modal.title : null}
        workspaceId={workspaceId}
      />

      <Modal
        variant="delete"
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={`Delete "${confirmDelete?.name}"?`}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        isLoading={deleteTitle.isPending}
      >
        <p className="text-sm text-muted-foreground">
          Members who have this title assigned will have their title cleared.
        </p>
      </Modal>
    </div>
  );
}
