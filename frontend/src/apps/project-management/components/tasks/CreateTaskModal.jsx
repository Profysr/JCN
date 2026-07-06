import { useState, useEffect } from "react";
import { useCreateTask } from "@/apps/project-management/hooks/useTasks";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ChevronDown } from "lucide-react";
import Modal from "@/shared/components/ui/Modal";
import Select from "@/shared/components/ui/Select";
import { useToast } from "@/shared/components/ui/toast";
import { PRIORITIES, TASK_TYPES } from "@/shared/lib/constants";
import { cn } from "@/shared/lib/utils";

export default function CreateTaskModal({
  open,
  onClose,
  workspaceId,
  boardId,
  defaultStatusId,
  statuses = [],
  members = [],
  defaultParentId = null,
  defaultDate = null,
}) {
  const { mutate, isPending } = useCreateTask(workspaceId, boardId);
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [taskType, setTaskType] = useState("task");
  const [statusId, setStatusId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState(defaultDate || "");
  const [startDate, setStartDate] = useState("");
  const [estimatePoints, setEstimatePoints] = useState("");
  const [estimateHours, setEstimateHours] = useState("");
  const [parentId, setParentId] = useState(defaultParentId || "");
  const [desc, setDesc] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync defaultDate whenever the modal opens with a new date
  useEffect(() => {
    if (open) setDueDate(defaultDate || "");
  }, [open, defaultDate]);

  const reset = () => {
    setTitle("");
    setPriority("medium");
    setTaskType("task");
    setStatusId("");
    setAssigneeId("");
    setDueDate(defaultDate || "");
    setStartDate("");
    setEstimatePoints("");
    setEstimateHours("");
    setParentId(defaultParentId || "");
    setDesc("");
    setShowAdvanced(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (startDate && dueDate && startDate > dueDate) {
      toast({
        title: "Start date cannot be after the due date",
        type: "error",
      });
      return;
    }
    mutate(
      {
        title: title.trim(),
        priority,
        task_type: taskType,
        status_id: statusId || defaultStatusId || null,
        assignee_id: assigneeId || null,
        due_date: dueDate || null,
        start_date: startDate || null,
        estimate_points: estimatePoints ? parseInt(estimatePoints) : null,
        estimate_hours: estimateHours ? parseFloat(estimateHours) : null,
        parent_id: parentId || null,
        description: desc,
      },
      {
        onSuccess: () => {
          onClose();
          reset();
        },
        onError: () => toast({ title: "Failed to create task", type: "error" }),
      },
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Create Task"
      showFooter={false}
      padding="p-0"
      flexBody
      // maxWidth="512px"
    >
      <div className="overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type chips */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              Type
            </p>
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
                        : "border-input text-muted-foreground hover:bg-accent",
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
          <div data-tour="task_title_input">
            <Label htmlFor="task-title" className="text-xs font-medium">
              Title
            </Label>
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

          {/* Description, status/priority, assignee/due — all optional, tour highlights them as one group */}
          <div data-tour="task_optional_fields" className="space-y-3">
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
                <Select
                  className="mt-1"
                  value={statusId || defaultStatusId || ""}
                  onChange={setStatusId}
                  placeholder="Select status"
                  options={statuses.map((s) => ({
                    value: s.id,
                    label: s.name,
                    color: s.color,
                  }))}
                />
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
                          ? p.modalBtnCls
                          : "border-input text-muted-foreground hover:bg-accent",
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
                <Select
                  className="mt-1"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  searchable
                  placeholder="Unassigned"
                  options={[
                    { value: "", label: "Unassigned" },
                    ...members.map((m) => ({
                      value: m.user?.id,
                      label: m.user?.full_name || m.user?.email,
                      avatar: {
                        name: m.user?.full_name || m.user?.email,
                        src: m.user?.avatar,
                      },
                    })),
                  ]}
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Due Date</Label>
                <input
                  type="date"
                  min={startDate || undefined}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Advanced toggle — estimates, start date, parent */}
          <button
            type="button"
            onClick={() => setShowAdvanced((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 transition-transform",
                showAdvanced && "rotate-180",
              )}
            />
            {showAdvanced ? "Hide" : "Show"} advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-3 pt-1">
              {/* Start date */}
              <div>
                <Label className="text-xs font-medium">Start Date</Label>
                <input
                  type="date"
                  max={dueDate || undefined}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onClose();
                reset();
              }}
            >
              Cancel
            </Button>
            <Button
              data-tour="task_submit"
              type="submit"
              size="sm"
              disabled={isPending || !title.trim()}
            >
              {isPending ? "Creating…" : "Create Task"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
