import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Zap, ToggleLeft, ToggleRight, Trash2, ChevronDown, ChevronRight, Check, X, ArrowLeft, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/constants";
import { useAutomations, useCreateAutomation, useUpdateAutomation, useDeleteAutomation } from "@/hooks/useAutomations";
import { format } from "date-fns";

const TRIGGER_OPTIONS = [
  { value: "task.created",        label: "Task is created" },
  { value: "task.status_changed", label: "Task status changes" },
  { value: "task.assigned",       label: "Task is assigned" },
  { value: "task.overdue",        label: "Task becomes overdue" },
];

const CONDITION_FIELDS = [
  { value: "priority",  label: "Priority" },
  { value: "assignee",  label: "Assignee" },
  { value: "status",    label: "Status" },
  { value: "task_type", label: "Task Type" },
];

const CONDITION_OPERATORS = {
  priority:  ["equals", "not_equals"],
  assignee:  ["is_set", "is_not_set"],
  status:    ["equals"],
  task_type: ["equals"],
};

const ACTION_TYPES = [
  { value: "change_priority",   label: "Change priority" },
  { value: "change_status",     label: "Change status" },
  { value: "set_assignee",      label: "Set assignee" },
  { value: "add_label",         label: "Add label" },
  { value: "post_comment",      label: "Post comment" },
  { value: "send_notification", label: "Send notification" },
];

const PRIORITY_OPTIONS = PRIORITIES.map(p => ({ value: p.value, label: p.label }));

const AUTOMATION_TEMPLATES = [
  {
    name: "Set urgent priority when a Bug is created",
    trigger: { type: "task.created" },
    conditions: [{ field: "task_type", operator: "equals", value: "bug" }],
    actions: [{ type: "change_priority", payload: { priority: "urgent" } }],
  },
  {
    name: "Post a comment when task is marked Done",
    trigger: { type: "task.status_changed" },
    conditions: [],
    actions: [{ type: "post_comment", payload: { body: "✅ This task has been marked as done." } }],
  },
  {
    name: "Notify assignee when task is assigned",
    trigger: { type: "task.assigned" },
    conditions: [{ field: "assignee", operator: "is_set" }],
    actions: [{ type: "send_notification", payload: { message: "You have been assigned a task." } }],
  },
];

export default function AutomationsPage() {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const { data: rules = [], isLoading } = useAutomations(workspaceSlug, projectId);
  const createRule  = useCreateAutomation(workspaceSlug, projectId);
  const updateRule  = useUpdateAutomation(workspaceSlug, projectId);
  const deleteRule  = useDeleteAutomation(workspaceSlug, projectId);

  const [building, setBuilding] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    trigger: { type: "task.created" },
    conditions: [],
    actions: [],
  });
  const [expandedRule, setExpandedRule] = useState(null);

  const handleSave = () => {
    if (!draft.name.trim() || !draft.actions.length) return;
    createRule.mutate(draft, { onSuccess: () => { setBuilding(false); resetDraft(); } });
  };

  const resetDraft = () => setDraft({ name: "", trigger: { type: "task.created" }, conditions: [], actions: [] });

  const addCondition = () =>
    setDraft(d => ({ ...d, conditions: [...d.conditions, { field: "priority", operator: "equals", value: "" }] }));

  const addAction = () =>
    setDraft(d => ({ ...d, actions: [...d.actions, { type: "change_status", payload: {} }] }));

  const removeCondition = (i) =>
    setDraft(d => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }));

  const removeAction = (i) =>
    setDraft(d => ({ ...d, actions: d.actions.filter((_, idx) => idx !== i) }));

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/w/${workspaceSlug}/projects/${projectId}`)}
              className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
              title="Back to board"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" /> Automations
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Rules that run automatically when task events happen.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setBuilding(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Rule
          </Button>
        </div>

        {/* Template gallery — shown only on empty state to help new users get started */}
        {!building && rules.length === 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Start from a template</p>
            <div className="grid grid-cols-1 gap-3">
              {AUTOMATION_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => { setDraft({ name: tpl.name, trigger: tpl.trigger, conditions: tpl.conditions, actions: tpl.actions }); setBuilding(true); }}
                  className="text-left p-4 rounded-xl border hover:border-primary/30 hover:bg-primary/5 transition-colors"
                >
                  <p className="font-medium text-sm">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When: {TRIGGER_OPTIONS.find(t => t.value === tpl.trigger.type)?.label}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Rule builder */}
        {building && (
          <div className="border rounded-xl p-5 mb-6 bg-card space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">New automation rule</h2>
              <div className="flex items-center gap-2">
                {/* Template picker — always available inside the builder */}
                <TemplatePicker
                  onSelect={tpl => setDraft({ name: tpl.name, trigger: tpl.trigger, conditions: tpl.conditions, actions: tpl.actions })}
                />
                <button onClick={() => { setBuilding(false); resetDraft(); }} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Rule name</label>
              <input
                autoFocus
                className="w-full border rounded-md px-3 py-2 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                placeholder="e.g. Auto-notify assignee on overdue"
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              />
            </div>

            {/* Trigger */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">WHEN</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background outline-none focus:ring-1 focus:ring-ring"
                value={draft.trigger.type}
                onChange={e => setDraft(d => ({ ...d, trigger: { type: e.target.value } }))}
              >
                {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {/* Conditions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">AND (conditions)</label>
                <button onClick={addCondition} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add condition
                </button>
              </div>
              {draft.conditions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">No conditions — rule fires for every matching trigger.</p>
              )}
              <div className="space-y-2">
                {draft.conditions.map((cond, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                      value={cond.field}
                      onChange={e => {
                        const updated = [...draft.conditions];
                        updated[i] = { ...updated[i], field: e.target.value, operator: CONDITION_OPERATORS[e.target.value][0], value: "" };
                        setDraft(d => ({ ...d, conditions: updated }));
                      }}
                    >
                      {CONDITION_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <select
                      className="border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                      value={cond.operator}
                      onChange={e => { const updated = [...draft.conditions]; updated[i] = { ...updated[i], operator: e.target.value }; setDraft(d => ({ ...d, conditions: updated })); }}
                    >
                      {(CONDITION_OPERATORS[cond.field] || []).map(op => <option key={op} value={op}>{op.replace(/_/g, " ")}</option>)}
                    </select>
                    {!["is_set", "is_not_set"].includes(cond.operator) && (
                      <input
                        className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                        placeholder="value…"
                        value={cond.value}
                        onChange={e => { const updated = [...draft.conditions]; updated[i] = { ...updated[i], value: e.target.value }; setDraft(d => ({ ...d, conditions: updated })); }}
                      />
                    )}
                    <button onClick={() => removeCondition(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">THEN (actions)</label>
                <button onClick={addAction} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add action
                </button>
              </div>
              {draft.actions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Add at least one action.</p>
              )}
              <div className="space-y-2">
                {draft.actions.map((action, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                      value={action.type}
                      onChange={e => { const updated = [...draft.actions]; updated[i] = { type: e.target.value, payload: {} }; setDraft(d => ({ ...d, actions: updated })); }}
                    >
                      {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>

                    {/* Payload inputs per action type */}
                    {action.type === "change_priority" && (
                      <select
                        className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                        value={action.payload?.priority || ""}
                        onChange={e => { const updated = [...draft.actions]; updated[i] = { ...updated[i], payload: { priority: e.target.value } }; setDraft(d => ({ ...d, actions: updated })); }}
                      >
                        <option value="">Select priority…</option>
                        {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    )}
                    {action.type === "post_comment" && (
                      <input
                        className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                        placeholder="Comment body…"
                        value={action.payload?.body || ""}
                        onChange={e => { const updated = [...draft.actions]; updated[i] = { ...updated[i], payload: { body: e.target.value } }; setDraft(d => ({ ...d, actions: updated })); }}
                      />
                    )}
                    {action.type === "send_notification" && (
                      <input
                        className="flex-1 border rounded-md px-2 py-1.5 text-xs bg-background outline-none"
                        placeholder="Notification message…"
                        value={action.payload?.message || ""}
                        onChange={e => { const updated = [...draft.actions]; updated[i] = { ...updated[i], payload: { message: e.target.value } }; setDraft(d => ({ ...d, actions: updated })); }}
                      />
                    )}
                    <button onClick={() => removeAction(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => { setBuilding(false); resetDraft(); }}>Cancel</Button>
              <Button size="sm" onClick={handleSave} disabled={createRule.isPending || !draft.name.trim() || !draft.actions.length}>
                {createRule.isPending ? "Saving…" : "Save Rule"}
              </Button>
            </div>
          </div>
        )}

        {/* Rules list */}
        {rules.length === 0 && !building ? (
          <div className="text-center py-16 text-muted-foreground">
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No automation rules yet.</p>
            <p className="text-xs mt-1">Create a rule or start from a template above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => (
              <RuleCard
                key={rule.id}
                rule={rule}
                expanded={expandedRule === rule.id}
                onToggleExpand={() => setExpandedRule(e => e === rule.id ? null : rule.id)}
                onToggleActive={() => updateRule.mutate({ id: rule.id, data: { is_active: !rule.is_active } })}
                onDelete={() => deleteRule.mutate(rule.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplatePicker({ onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      >
        <LayoutTemplate className="w-3.5 h-3.5" />
        Use template
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 bg-popover border rounded-xl shadow-lg p-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 pt-1 pb-2">
            Templates
          </p>
          {AUTOMATION_TEMPLATES.map((tpl, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onSelect(tpl); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
            >
              <p className="text-sm font-medium">{tpl.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                When: {TRIGGER_OPTIONS.find(t => t.value === tpl.trigger.type)?.label}
                {tpl.conditions.length > 0 && ` · ${tpl.conditions.length} condition${tpl.conditions.length > 1 ? "s" : ""}`}
                {" · "}{tpl.actions.length} action{tpl.actions.length > 1 ? "s" : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function RuleCard({ rule, expanded, onToggleExpand, onToggleActive, onDelete }) {
  const triggerLabel = TRIGGER_OPTIONS.find(t => t.value === rule.trigger?.type)?.label || rule.trigger?.type;

  return (
    <div className={cn("border rounded-xl overflow-hidden transition-colors", rule.is_active ? "border-border" : "border-border/50 opacity-60")}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggleActive} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
          {rule.is_active
            ? <ToggleRight className="w-5 h-5 text-primary" />
            : <ToggleLeft className="w-5 h-5" />}
        </button>
        <div className="flex-1 min-w-0" onClick={onToggleExpand}>
          <p className="font-medium text-sm truncate cursor-pointer">{rule.name}</p>
          <p className="text-xs text-muted-foreground">When: {triggerLabel} · Fired {rule.fire_count}×</p>
        </div>
        <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onToggleExpand} className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          {/* Recent logs */}
          {rule.logs_preview?.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Recent executions</p>
              <div className="space-y-1.5">
                {rule.logs_preview.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-xs">
                    <span className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      log.exec_status === "success" ? "bg-emerald-500" : log.exec_status === "partial" ? "bg-yellow-500" : "bg-red-500"
                    )} />
                    <span className="text-muted-foreground">{format(new Date(log.created_at), "MMM d, h:mm a")}</span>
                    <span className={cn(
                      "font-medium",
                      log.exec_status === "success" ? "text-emerald-600" : "text-red-500"
                    )}>
                      {log.exec_status}
                    </span>
                    <span className="text-muted-foreground">· {log.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
