import { useState, useEffect } from "react";
import { useCreateTask } from "@/hooks/useTasks";
import { useTaskTemplates, useCreateTaskTemplate } from "@/hooks/useTaskHierarchy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronDown, LayoutTemplate, Plus } from "lucide-react";
import { TASK_TYPES } from "@/lib/taskTypes";
import { cn } from "@/lib/utils";

const PRIORITIES = [
  { value: "no_priority", label: "None" },
  { value: "low",         label: "Low" },
  { value: "medium",      label: "Medium" },
  { value: "high",        label: "High" },
  { value: "urgent",      label: "Urgent" },
];

const PRIORITY_COLORS = {
  no_priority: "border-input text-muted-foreground",
  low:         "border-blue-300   text-blue-600   bg-blue-50",
  medium:      "border-yellow-300 text-yellow-600 bg-yellow-50",
  high:        "border-orange-300 text-orange-600 bg-orange-50",
  urgent:      "border-red-300    text-red-600    bg-red-50",
};

export default function CreateTaskModal({
  open, onClose, workspaceSlug, projectId,
  defaultStatusId, statuses = [], members = [],
  defaultParentId = null,
  defaultDate = null,
}) {
  const { mutate, isPending } = useCreateTask(workspaceSlug, projectId);
  const { data: templates = [] } = useTaskTemplates(workspaceSlug, projectId);
  const createTemplate = useCreateTaskTemplate(workspaceSlug, projectId);

  const [title,           setTitle]           = useState("");
  const [priority,        setPriority]        = useState("no_priority");
  const [taskType,        setTaskType]        = useState("task");
  const [statusId,        setStatusId]        = useState("");
  const [assigneeId,      setAssigneeId]      = useState("");
  const [dueDate,         setDueDate]         = useState(defaultDate || "");
  const [startDate,       setStartDate]       = useState("");
  const [estimatePoints,  setEstimatePoints]  = useState("");
  const [estimateHours,   setEstimateHours]   = useState("");
  const [parentId,        setParentId]        = useState(defaultParentId || "");
  const [desc,            setDesc]            = useState("");
  const [showAdvanced,    setShowAdvanced]    = useState(false);
  const [templateOpen,    setTemplateOpen]    = useState(false);
  const [newTplName,      setNewTplName]      = useState("");
  const [creatingTpl,     setCreatingTpl]     = useState(false);

  // Sync defaultDate whenever the modal opens with a new date
  useEffect(() => {
    if (open) setDueDate(defaultDate || "");
  }, [open, defaultDate]);

  const reset = () => {
    setTitle(""); setPriority("no_priority"); setTaskType("task");
    setStatusId(""); setAssigneeId(""); setDueDate(defaultDate || ""); setStartDate("");
    setEstimatePoints(""); setEstimateHours(""); setParentId(defaultParentId || "");
    setDesc(""); setShowAdvanced(false);
  };

  const applyTemplate = (tpl) => {
    setTaskType(tpl.task_type || "task");
    setPriority(tpl.priority || "no_priority");
    if (tpl.description) setDesc(tpl.description);
    setTemplateOpen(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    mutate(
      {
        title,
        priority,
        task_type:       taskType,
        status_id:       statusId || defaultStatusId || null,
        assignee_id:     assigneeId || null,
        due_date:        dueDate || null,
        start_date:      startDate || null,
        estimate_points: estimatePoints ? parseInt(estimatePoints) : null,
        estimate_hours:  estimateHours  ? parseFloat(estimateHours) : null,
        parent_id:       parentId || null,
        description:     desc,
      },
      { onSuccess: () => { onClose(); reset(); } },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border rounded-xl shadow-xl w-full max-w-lg animate-scale-in max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-card z-10">
            <Dialog.Title className="text-sm font-semibold">Create Task</Dialog.Title>
            <div className="flex items-center gap-2">
              {/* Template picker — always visible */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setTemplateOpen(o => !o); setCreatingTpl(false); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-md px-2.5 py-1.5 hover:bg-accent transition-colors"
                >
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Template
                  {templates.length > 0 && (
                    <span className="bg-primary/20 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none">{templates.length}</span>
                  )}
                </button>
                {templateOpen && (
                  <div className="absolute right-0 top-9 z-50 w-56 bg-popover border rounded-xl shadow-popover p-1.5">
                    {templates.length === 0 && !creatingTpl ? (
                      <div className="px-3 py-3 text-center">
                        <p className="text-xs text-muted-foreground mb-2">No templates yet.</p>
                        <button
                          type="button"
                          onClick={() => setCreatingTpl(true)}
                          className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                        >
                          <Plus className="w-3 h-3" /> Save current as template
                        </button>
                      </div>
                    ) : (
                      <>
                        {templates.map(tpl => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => { applyTemplate(tpl); setTemplateOpen(false); }}
                            className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-accent transition-colors"
                          >
                            <p className="font-medium text-sm">{tpl.name}</p>
                            {tpl.description && (
                              <p className="text-xs text-muted-foreground truncate">{tpl.description}</p>
                            )}
                          </button>
                        ))}
                        <div className="border-t mt-1 pt-1">
                          <button
                            type="button"
                            onClick={() => setCreatingTpl(true)}
                            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded-lg transition-colors flex items-center gap-1.5"
                          >
                            <Plus className="w-3 h-3" /> Save current as template
                          </button>
                        </div>
                      </>
                    )}
                    {/* Inline template name input */}
                    {creatingTpl && (
                      <div className="px-2 pt-1 pb-2 border-t mt-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">Template name</p>
                        <input
                          autoFocus
                          className="w-full text-xs border rounded px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
                          placeholder="e.g. Bug Report"
                          value={newTplName}
                          onChange={e => setNewTplName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Escape") setCreatingTpl(false);
                            if (e.key === "Enter" && newTplName.trim()) {
                              createTemplate.mutate({ name: newTplName.trim(), task_type: taskType, priority, description: desc });
                              setNewTplName(""); setCreatingTpl(false); setTemplateOpen(false);
                            }
                          }}
                        />
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            disabled={!newTplName.trim() || createTemplate.isPending}
                            onClick={() => {
                              createTemplate.mutate({ name: newTplName.trim(), task_type: taskType, priority, description: desc });
                              setNewTplName(""); setCreatingTpl(false); setTemplateOpen(false);
                            }}
                            className="flex-1 text-xs bg-primary text-primary-foreground rounded py-1 font-medium disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button type="button" onClick={() => setCreatingTpl(false)} className="text-xs text-muted-foreground px-2">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Dialog.Close asChild>
                <button className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent">
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            {/* Type chips */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Type</p>
              <div className="flex flex-wrap gap-1.5">
                {TASK_TYPES.map((t) => {
                  const Icon = t.icon;
                  const active = taskType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTaskType(t.value)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
                        active
                          ? `${t.bg} ${t.color} border-current`
                          : "border-input text-muted-foreground hover:bg-accent"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div>
              <Label htmlFor="task-title" className="text-xs font-medium">Title</Label>
              <Input
                id="task-title"
                className="mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                required
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <Label className="text-xs font-medium">Description</Label>
              <textarea
                className="mt-1 w-full text-sm border rounded-md px-3 py-2 bg-background outline-none focus:ring-1 focus:ring-ring resize-none placeholder:text-muted-foreground"
                rows={2}
                placeholder="Optional description…"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            {/* Row: status + priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Status</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={statusId || defaultStatusId || ""}
                  onChange={(e) => setStatusId(e.target.value)}
                >
                  {statuses.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Priority</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPriority(p.value)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium border transition-colors",
                        priority === p.value
                          ? PRIORITY_COLORS[p.value]
                          : "border-input text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row: assignee + due date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Assignee</Label>
                <select
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user?.id} value={m.user?.id}>
                      {m.user?.full_name || m.user?.email}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium">Due Date</Label>
                <input
                  type="date"
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Advanced toggle — estimates, start date, parent */}
            <button
              type="button"
              onClick={() => setShowAdvanced(o => !o)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
              {showAdvanced ? "Hide" : "Show"} advanced options
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-1">
                {/* Start date */}
                <div>
                  <Label className="text-xs font-medium">Start Date</Label>
                  <input
                    type="date"
                    className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                {/* Estimates */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium">Story Points</Label>
                    <input
                      type="number"
                      min="0"
                      placeholder="e.g. 3"
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={estimatePoints}
                      onChange={(e) => setEstimatePoints(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium">Est. Hours</Label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="e.g. 4.5"
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                      value={estimateHours}
                      onChange={(e) => setEstimateHours(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => { onClose(); reset(); }}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isPending || !title.trim()}>
                {isPending ? "Creating…" : "Create Task"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
