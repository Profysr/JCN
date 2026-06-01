import { useState } from "react";
import { Plus, Play, CheckCircle, Trash2, Zap, ArrowRight } from "lucide-react";
import { useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint, useSprintBurndown } from "@/hooks/useSprints";
import BurndownChart from "@/components/projects/BurndownChart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  planning:  { label: "Planning",   color: "text-muted-foreground bg-muted border-border" },
  active:    { label: "Active",     color: "text-blue-600 bg-blue-50 border-blue-200" },
  completed: { label: "Completed",  color: "text-green-600 bg-green-50 border-green-200" },
};

const STEPS = [
  { n: 1, text: "Click + to create a sprint — give it a name and optional dates" },
  { n: 2, text: "Click ▶ to activate it — the sprint board becomes live" },
  { n: 3, text: "Move tasks from the Backlog below into your sprint" },
  { n: 4, text: "Work the board — the burndown chart tracks progress daily" },
  { n: 5, text: "Click ✓ to mark the sprint complete when done" },
];

export default function SprintPanel({ workspaceSlug, projectId, activeSprint, onSelectSprint }) {
  const { data: sprints = [] } = useSprints(workspaceSlug, projectId);
  const createSprint = useCreateSprint(workspaceSlug, projectId);
  const updateSprint = useUpdateSprint(workspaceSlug, projectId);
  const deleteSprint = useDeleteSprint(workspaceSlug, projectId);
  const { data: burndown } = useSprintBurndown(workspaceSlug, projectId, activeSprint?.id);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", goal: "", start_date: "", end_date: "" });

  const handleCreate = (e) => {
    e.preventDefault();
    createSprint.mutate(form, {
      onSuccess: (sprint) => {
        setCreating(false);
        setForm({ name: "", goal: "", start_date: "", end_date: "" });
        onSelectSprint(sprint);
      },
    });
  };

  return (
    <div className="w-72 flex-shrink-0 border-l flex flex-col bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Sprints</span>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent"
          title="New sprint"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* How-to guide — only shown when no sprints exist */}
        {sprints.length === 0 && !creating && (
          <div className="p-4">
            <p className="text-xs font-semibold text-foreground mb-3">How sprints work</p>
            <ol className="space-y-3">
              {STEPS.map(({ n, text }) => (
                <li key={n} className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0 text-[10px]">
                    {n}
                  </span>
                  <span className="leading-relaxed">{text}</span>
                </li>
              ))}
            </ol>
            <button
              onClick={() => setCreating(true)}
              className="mt-5 w-full flex items-center justify-center gap-2 text-sm font-medium text-primary border border-primary/30 rounded-lg py-2 hover:bg-primary/5 transition-colors"
            >
              <Plus className="w-4 h-4" /> Create your first sprint
            </button>
          </div>
        )}

        {/* Create form */}
        {creating && (
          <form onSubmit={handleCreate} className="p-4 border-b space-y-2.5">
            <p className="text-xs font-medium text-foreground">New Sprint</p>
            <input
              autoFocus
              className="w-full text-sm border rounded-md px-3 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
              placeholder="Sprint name (e.g. Sprint 1)"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              className="w-full text-xs border rounded-md px-3 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
              placeholder="Goal (optional)"
              value={form.goal}
              onChange={e => setForm({ ...form, goal: e.target.value })}
            />
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Dates (optional — set now or later)</p>
              <div className="flex gap-2">
                <input type="date" className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
                  value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                <input type="date" className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
                  value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" className="flex-1" disabled={createSprint.isPending}>
                {createSprint.isPending ? "Creating…" : "Create sprint"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            </div>
          </form>
        )}

        {/* Sprint list */}
        {sprints.length > 0 && (
          <div className="divide-y">
            {sprints.map((sprint) => {
              const cfg = STATUS_CONFIG[sprint.status] || STATUS_CONFIG.planning;
              const isSelected = activeSprint?.id === sprint.id;
              return (
                <div
                  key={sprint.id}
                  onClick={() => onSelectSprint(isSelected ? null : sprint)}
                  className={cn(
                    "px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium truncate flex-1 mr-2">{sprint.name}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium border", cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {sprint.task_count > 0 && (
                    <div className="h-1 bg-muted rounded-full mb-1.5 overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.round(sprint.completed_count / sprint.task_count * 100)}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{sprint.completed_count}/{sprint.task_count} tasks</span>
                      {sprint.start_date && sprint.end_date && (
                        <span className="text-[11px]">
                          {new Date(sprint.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
                          {new Date(sprint.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      {sprint.status === "planning" && (
                        <button
                          onClick={e => { e.stopPropagation(); updateSprint.mutate({ sprintId: sprint.id, status: "active" }); }}
                          className="text-muted-foreground hover:text-blue-500 p-1 rounded hover:bg-accent"
                          title="Start sprint"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {sprint.status === "active" && (
                        <button
                          onClick={e => { e.stopPropagation(); updateSprint.mutate({ sprintId: sprint.id, status: "completed" }); }}
                          className="text-muted-foreground hover:text-green-500 p-1 rounded hover:bg-accent"
                          title="Complete sprint"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm(`Delete "${sprint.name}"?`)) deleteSprint.mutate(sprint.id); }}
                        className="text-muted-foreground hover:text-destructive p-1 rounded hover:bg-accent"
                        title="Delete sprint"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Burndown chart for selected sprint */}
        {activeSprint && burndown && burndown.total > 0 && (
          <div className="p-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">Burndown</p>
              <div className="flex gap-3 text-xs">
                <span className="text-green-600 font-medium">{burndown.completed} done</span>
                <span className="text-orange-500 font-medium">{burndown.remaining} left</span>
              </div>
            </div>
            <BurndownChart data={burndown} height={140} />
          </div>
        )}

        {/* No sprint selected prompt */}
        {sprints.length > 0 && !activeSprint && (
          <div className="p-4 text-center text-xs text-muted-foreground mt-2">
            <ArrowRight className="w-4 h-4 mx-auto mb-1 opacity-40" />
            Click a sprint above to view its board and burndown
          </div>
        )}
      </div>
    </div>
  );
}
