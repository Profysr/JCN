import { useState, useEffect } from "react";
import { Loader } from "@/shared/components/ui/Loader";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import { useParams, useNavigate } from "react-router-dom";
import {
  Plus,
  FormInput,
  Trash2,
  GripVertical,
  Copy,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  Eye,
  Send,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import Select from "@/shared/components/ui/Select";
import { cn } from "@/shared/lib/utils";
import {
  useForms,
  useForm,
  useCreateForm,
  useUpdateForm,
  useDeleteForm,
  useUpdateFormFields,
  useFormSubmissions,
  useUpdateSubmissionStatus,
} from "@/apps/project-management/hooks/useForms";
import { useBoardSocket } from "@/apps/project-management/hooks/useBoardSocket";
import { useToast } from "@/shared/components/ui/toast";
import { format } from "date-fns";

const FIELD_TYPES = [
  { value: "short_text", label: "Short Text" },
  { value: "long_text", label: "Long Text" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multiselect", label: "Multi-Select" },
  { value: "date", label: "Date" },
];

export default function FormsPage() {
  const { workspaceId, boardId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useBoardSocket();

  const { data: forms = [], isLoading } = useForms(workspaceId, boardId);
  const createForm = useCreateForm(workspaceId, boardId);
  const deleteForm = useDeleteForm(workspaceId, boardId);

  const [selectedFormId, setSelectedFormId] = useState(null);
  const [tab, setTab] = useState("builder"); // "builder" | "submissions"

  const handleCreate = () => {
    createForm.mutate(
      { name: "New Form", description: "" },
      { onSuccess: (f) => setSelectedFormId(f.id) },
    );
  };

  if (isLoading) return <Loader className="flex-1" />;

  return (
    <div className="flex h-full">
      {/* Sidebar — forms list */}
      <div className="w-56 flex-shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(`/w/${workspaceId}/boards/${boardId}`)}
              className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="Back to board"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
              Forms
            </span>
          </div>
          <button
            onClick={handleCreate}
            className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {forms.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No forms yet.
              <br />
              <button
                onClick={handleCreate}
                className="text-primary hover:underline mt-1"
              >
                Create first form
              </button>
            </div>
          ) : (
            <div className="space-y-0.5 px-2">
              {forms.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFormId(f.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                    selectedFormId === f.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:bg-accent",
                  )}
                >
                  <FormInput className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      {selectedFormId ? (
        <FormEditor
          key={selectedFormId}
          workspaceId={workspaceId}
          boardId={boardId}
          formId={selectedFormId}
          onDelete={() => {
            deleteForm.mutate(selectedFormId);
            setSelectedFormId(null);
          }}
          tab={tab}
          setTab={setTab}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <FormInput className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              Select a form or create a new one.
            </p>
            <Button size="sm" className="mt-4" onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-1.5" /> New Form
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormEditor({ workspaceId, boardId, formId, onDelete, tab, setTab }) {
  const { data: form, isLoading } = useForm(workspaceId, boardId, formId);
  const updateForm = useUpdateForm(workspaceId, boardId, formId);
  const updateFields = useUpdateFormFields(workspaceId, boardId, formId);
  const { toast } = useToast();

  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Local drafts for name + description — only save on blur, not on every keystroke (Fix 3)
  const [nameDraft, setNameDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");

  // Sync local drafts when server data loads
  useEffect(() => {
    if (form) {
      setNameDraft(form.name || "");
      setDescDraft(form.description || "");
    }
  }, [form?.id]); // only on form switch, not every refetch

  const [localFields, setLocalFields] = useState(null);
  const fields = localFields ?? (form?.fields || []);

  // Save fields to server — only called from removeField / addField / field onBlur (Fix 3)
  const saveFields = (newFields) => {
    setLocalFields(newFields);
    updateFields.mutate(newFields);
  };

  // Local-only field update — does NOT fire the API (Fix 3)
  const patchFieldLocally = (i, patch) => {
    const updated = [...fields];
    updated[i] = { ...updated[i], ...patch };
    setLocalFields(updated);
  };

  // Called from FieldCard onBlur — fires the API once after editing stops
  const flushField = (i, patch) => {
    const updated = [...fields];
    updated[i] = { ...updated[i], ...patch };
    saveFields(updated);
  };

  const addField = () =>
    saveFields([
      ...fields,
      {
        label: "New field",
        field_type: "short_text",
        placeholder: "",
        is_required: false,
        options: [],
        order: fields.length,
      },
    ]);

  const removeField = (i) => saveFields(fields.filter((_, idx) => idx !== i));

  const shareUrl = `${window.location.origin}/forms/${form?.token}`;

  if (isLoading) return <Loader className="flex-1" />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Form header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div className="flex-1 min-w-0">
          {/* Fix 3: onChange only updates local draft; onBlur saves to server */}
          <input
            className="text-lg font-bold bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors w-full"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              if (nameDraft.trim() && nameDraft !== form?.name)
                updateForm.mutate({ name: nameDraft.trim() });
            }}
          />
          <input
            className="text-xs text-muted-foreground bg-transparent outline-none w-full mt-0.5"
            placeholder="Add a description…"
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              if (descDraft !== form?.description)
                updateForm.mutate({ description: descDraft });
            }}
          />
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => updateForm.mutate({ is_active: !form?.is_active })}
            className="flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5"
          >
            {form?.is_active ? (
              <ToggleRight className="w-4 h-4 text-emerald-500" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-muted-foreground" />
            )}
            {form?.is_active ? "Active" : "Inactive"}
          </button>

          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl);
              toast.success("Link copied!");
            }}
            className="flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 hover:bg-accent transition-colors"
          >
            <Copy className="w-3.5 h-3.5" /> Copy link
          </button>

          <button
            onClick={() => window.open(`/forms/${form?.token}`, "_blank")}
            className="p-1.5 border rounded-lg hover:bg-accent transition-colors text-muted-foreground"
            title="Preview form"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            className="p-1.5 border rounded-lg text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete form?"
          message={`"${form?.name}" and all its submissions will be permanently deleted.`}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex border-b px-6 flex-shrink-0">
        {[
          ["builder", "Builder"],
          ["submissions", `Submissions (${form?.submission_count || 0})`],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "text-sm py-2.5 px-1 mr-6 border-b-2 transition-colors",
              tab === value
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "builder" ? (
          <div className="max-w-2xl mx-auto px-6 py-6 space-y-3">
            {fields.map((field, i) => (
              <FieldCard
                key={i}
                field={field}
                index={i}
                onChange={(patch) => patchFieldLocally(i, patch)}
                onFlush={(patch) => flushField(i, patch)}
                onRemove={() => removeField(i)}
              />
            ))}
            <button
              onClick={addField}
              className="w-full py-3 border-2 border-dashed rounded-md text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add field
            </button>
          </div>
        ) : (
          <SubmissionsPanel
            workspaceId={workspaceId}
            boardId={boardId}
            formId={formId}
            form={form}
          />
        )}
      </div>
    </div>
  );
}

function FieldCard({ field, index, onChange, onFlush, onRemove }) {
  const [expanded, setExpanded] = useState(true);
  // Local drafts for text inputs — keeps typing smooth, no per-keystroke API calls
  const [label, setLabel] = useState(field.label);
  const [placeholder, setPlaceholder] = useState(field.placeholder);

  // Sync if parent resets this card (e.g. after a server round-trip)
  useEffect(() => {
    setLabel(field.label);
  }, [field.label]);
  useEffect(() => {
    setPlaceholder(field.placeholder);
  }, [field.placeholder]);

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
        <span className="flex-1 text-sm font-medium truncate">
          {label || "Untitled field"}
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {FIELD_TYPES.find((t) => t.value === field.field_type)?.label}
        </span>
        {field.is_required && (
          <span className="text-xs text-red-500 font-medium">Required</span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-muted-foreground hover:text-destructive p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Label
              </label>
              <input
                className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  onChange({ label: e.target.value });
                }}
                onBlur={() => {
                  if (label !== field.label) onFlush({ label });
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Type
              </label>
              {/* Type change fires immediately — it's a single click, not keystroke spam */}
              <Select
                value={field.field_type}
                onChange={(v) => onFlush({ field_type: v })}
                options={FIELD_TYPES}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Placeholder
              </label>
              <input
                className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                value={placeholder}
                onChange={(e) => {
                  setPlaceholder(e.target.value);
                  onChange({ placeholder: e.target.value });
                }}
                onBlur={() => {
                  if (placeholder !== field.placeholder) onFlush({ placeholder });
                }}
                placeholder="Optional…"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={field.is_required}
                  onChange={(e) => onFlush({ is_required: e.target.checked })}
                  className="rounded"
                />
                Required field
              </label>
            </div>
          </div>
          {["dropdown", "multiselect"].includes(field.field_type) && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Options (one per line)
              </label>
              <textarea
                className="w-full border rounded-md px-2.5 py-1.5 text-sm bg-background outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={3}
                value={(field.options || []).join("\n")}
                onChange={(e) =>
                  onChange({
                    options: e.target.value.split("\n").filter(Boolean),
                  })
                }
                placeholder="Option A&#10;Option B&#10;Option C"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmissionsPanel({ workspaceId, boardId, formId, form }) {
  const { data: submissions = [] } = useFormSubmissions(
    workspaceId,
    boardId,
    formId,
  );
  const updateStatus = useUpdateSubmissionStatus(workspaceId, boardId, formId);
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="px-6 py-4 space-y-3">
      {submissions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Send className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No submissions yet.</p>
          <p className="text-xs mt-1">
            Share the form link to start receiving responses.
          </p>
        </div>
      ) : (
        submissions.map((sub) => (
          <div
            key={sub.id}
            className="border rounded-md bg-card overflow-hidden"
          >
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => setExpanded((e) => (e === sub.id ? null : sub.id))}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  {sub.submitter_email || "Anonymous"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(sub.submitted_at), "MMM d, yyyy · h:mm a")}
                </p>
              </div>
              <span onClick={(e) => e.stopPropagation()}>
                <Select
                  size="sm"
                  className="w-32"
                  value={sub.status}
                  onChange={(v) => updateStatus.mutate({ id: sub.id, status: v })}
                  options={[
                    { value: "new", label: "New" },
                    { value: "in_review", label: "In Review" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
              </span>
              {sub.task_title && (
                <span className="text-xs text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Task created
                </span>
              )}
            </div>
            {expanded === sub.id && (
              <div className="border-t px-4 py-3 bg-muted/20 space-y-2">
                {form?.fields?.map((field) => (
                  <div key={field.id}>
                    <p className="text-xs font-medium text-muted-foreground">
                      {field.label}
                    </p>
                    <p className="text-sm">
                      {sub.answers?.[field.id] || (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
