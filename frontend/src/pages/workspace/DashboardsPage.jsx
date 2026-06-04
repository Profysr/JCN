import { useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, X, Lock, LayoutDashboard, BarChart2, Settings2, Trash2 } from "lucide-react";
import { useDashboards, useCreateDashboard, useUpdateDashboard, useDeleteDashboard } from "@/hooks/useDashboards";
import { useObjectives, CONFIDENCE_CONFIG } from "@/hooks/useGoals";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useProjects } from "@/hooks/useProjects";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { PRIORITIES, APP_COLORS, pickColor } from "@/lib/constants";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";

// ── Built-in: Overview tab ───────────────────────────────────────────────────
const PROJECT_COLORS = APP_COLORS; // canonical — from constants.js

function OverviewTab({ workspaceSlug }) {
  const { user } = useAuthStore();
  const { data: projects = [] } = useProjects(workspaceSlug);
  const { data: members  = [] } = useQuery({
    queryKey: ["workspace-members", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/members/`).then(r => r.data.results || r.data),
  });
  const totalTasks = projects.reduce((s, p) => s + (p.task_count || 0), 0);

  const stats = [
    { label: "Projects",  value: projects.length,  icon: "🗂",  color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
    { label: "Tasks",     value: totalTasks,        icon: "✅",  color: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" },
    { label: "Members",   value: members.length,    icon: "👥",  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  ];

  return (
    <div className="p-6 space-y-6">
      <GettingStartedChecklist workspaceSlug={workspaceSlug} />

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 shadow-card">
            <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center text-xl", s.color)}>{s.icon}</div>
            <div>
              <p className="text-2xl font-bold tabular-nums">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent projects */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.slice(0, 6).map((p, i) => {
            const color    = PROJECT_COLORS[i % PROJECT_COLORS.length];
            const done     = p.done_task_count || 0;
            const total    = p.task_count || 0;
            const pct      = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{ backgroundColor: color }}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{total} tasks · {members.length} members</p>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-right">{pct}% complete</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Built-in: Analytics tab ──────────────────────────────────────────────────
const PRI_CONFIG = Object.fromEntries(PRIORITIES.map(p => [p.value, { label: p.label, color: p.hex }]));

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color || "hsl(var(--primary))" }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

function AnalyticsTab({ workspaceSlug }) {
  const { data, isLoading } = useAnalytics(workspaceSlug);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>;
  if (!data)     return null;

  // Actual field names from WorkspaceAnalyticsView:
  // overview: { projects, tasks, members, open_tasks }
  // tasks_by_status:   [{status__name, status__color, count}]
  // tasks_by_priority: [{priority, count}]
  // workload:          [{name, email, assigned}]
  const overview        = data.overview        || {};
  const tasks_by_status   = data.tasks_by_status   || [];
  const tasks_by_priority = data.tasks_by_priority || [];
  const workload          = data.workload          || [];

  const maxStatus   = Math.max(1, ...tasks_by_status.map(s => s.count));
  const maxPriority = Math.max(1, ...tasks_by_priority.map(p => p.count));
  const maxWorkload = Math.max(1, ...workload.filter(w => w.assigned > 0).map(w => w.assigned));

  return (
    <div className="p-6 space-y-6">
      {/* Overview stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Projects",   value: overview.projects   ?? 0 },
          { label: "Tasks",      value: overview.tasks      ?? 0 },
          { label: "Members",    value: overview.members    ?? 0 },
          { label: "Open Tasks", value: overview.open_tasks ?? 0, alert: true },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 shadow-card">
            <p className={cn("text-2xl font-bold tabular-nums", s.alert && s.value > 0 && "text-orange-500")}>
              {s.value}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Tasks by status */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <h3 className="text-sm font-semibold mb-4">Tasks by Status</h3>
          {tasks_by_status.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-6">No data yet</p>
            : <div className="space-y-2.5">
                {tasks_by_status.map(s => (
                  <Bar key={s.status__name} label={s.status__name || "No status"} value={s.count} max={maxStatus} color={s.status__color} />
                ))}
              </div>
          }
        </div>

        {/* Tasks by priority */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <h3 className="text-sm font-semibold mb-4">Tasks by Priority</h3>
          {tasks_by_priority.length === 0
            ? <p className="text-xs text-muted-foreground text-center py-6">No data yet</p>
            : <div className="space-y-2.5">
                {tasks_by_priority.map(p => {
                  const cfg = PRI_CONFIG[p.priority] || PRI_CONFIG.no_priority;
                  return <Bar key={p.priority} label={cfg.label} value={p.count} max={maxPriority} color={cfg.color} />;
                })}
              </div>
          }
        </div>

        {/* Team workload */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card md:col-span-2">
          <h3 className="text-sm font-semibold mb-4">Team Workload</h3>
          {workload.filter(w => w.assigned > 0).length === 0
            ? <p className="text-xs text-muted-foreground text-center py-6">No assigned tasks yet</p>
            : <div className="space-y-2.5">
                {workload.filter(w => w.assigned > 0).map(w => (
                  <Bar key={w.email} label={w.name || w.email || "Unassigned"} value={w.assigned} max={maxWorkload} />
                ))}
              </div>
          }
        </div>
      </div>
    </div>
  );
}

// ── Custom dashboard tab ─────────────────────────────────────────────────────
const WIDGET_TYPES = [
  { id: "kpi",           label: "KPI Card",     icon: "📊", desc: "A single metric with trend"      },
  { id: "task_list",     label: "Task List",    icon: "✅", desc: "Filtered list of tasks"          },
  { id: "activity_feed", label: "Activity Feed",icon: "🔔", desc: "Recent task changes"             },
  { id: "text",          label: "Text Block",   icon: "📝", desc: "Markdown heading or notes"       },
  { id: "okr_progress",  label: "OKR Progress", icon: "🎯", desc: "Goal & key result status"        },
];

function OKRWidget({ workspaceSlug }) {
  const navigate = useNavigate();
  const { data: objectives = [] } = useObjectives(workspaceSlug);
  const top = objectives.slice(0, 3);

  if (top.length === 0) {
    return (
      <button
        onClick={() => navigate(`/w/${workspaceSlug}/goals`)}
        className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-4 transition-colors"
      >
        No goals yet — create your first objective →
      </button>
    );
  }

  return (
    <div className="space-y-3">
      {top.map((obj) => {
        const cfg = CONFIDENCE_CONFIG[obj.confidence] || CONFIDENCE_CONFIG.on_track;
        return (
          <div key={obj.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium truncate">{obj.title}</span>
              <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2", cfg.bg, cfg.color)}>
                {obj.progress}%
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${obj.progress}%`, backgroundColor: obj.confidence === "on_track" ? "#22c55e" : obj.confidence === "at_risk" ? "#f59e0b" : "#ef4444" }}
              />
            </div>
          </div>
        );
      })}
      {objectives.length > 3 && (
        <button
          onClick={() => navigate(`/w/${workspaceSlug}/goals`)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          +{objectives.length - 3} more goals →
        </button>
      )}
    </div>
  );
}

function WidgetCard({ widget, onRemove, canEdit, workspaceSlug }) {
  const { workspaceSlug: wsSlug } = useParams();
  const slug = workspaceSlug || wsSlug;

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card group relative">
      {canEdit && (
        <button
          onClick={() => onRemove(widget.id)}
          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
      <p className="text-xs font-semibold text-muted-foreground mb-1">{widget.type.replace(/_/g, " ").toUpperCase()}</p>
      <p className="font-semibold text-sm mb-3">{widget.title || "Untitled widget"}</p>
      <div className="text-xs text-muted-foreground">
        {widget.type === "kpi"           && <p className="text-3xl font-bold text-foreground">{widget.config?.value ?? "—"}</p>}
        {widget.type === "task_list"     && <p>Showing filtered task list</p>}
        {widget.type === "activity_feed" && <p>Recent activity will appear here</p>}
        {widget.type === "text"          && <p className="whitespace-pre-wrap">{widget.config?.content || "Add some text…"}</p>}
        {widget.type === "okr_progress"  && <OKRWidget workspaceSlug={slug} />}
      </div>
    </div>
  );
}

function AddWidgetModal({ onAdd, onClose }) {
  const [selected, setSelected] = useState(null);
  const [title, setTitle]       = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Add Widget</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {WIDGET_TYPES.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={cn(
                "flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-colors",
                selected === t.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
            >
              <span className="text-xl">{t.icon}</span>
              <span className="text-sm font-medium">{t.label}</span>
              <span className="text-[11px] text-muted-foreground">{t.desc}</span>
            </button>
          ))}
        </div>

        {selected && (
          <input
            autoFocus
            className="w-full text-sm bg-background border border-border rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Widget title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        )}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-accent transition-colors">Cancel</button>
          <button
            disabled={!selected}
            onClick={() => { onAdd({ id: crypto.randomUUID(), type: selected, title: title || WIDGET_TYPES.find(t => t.id === selected)?.label, config: {} }); onClose(); }}
            className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomDashboardTab({ dashboard, workspaceSlug }) {
  const [addWidgetOpen, setAddWidgetOpen] = useState(false);
  const updateDashboard = useUpdateDashboard(workspaceSlug);

  const widgets = dashboard.widgets || [];

  const addWidget = (widget) => {
    updateDashboard.mutate({ dashboardId: dashboard.id, widgets: [...widgets, widget] });
  };

  const removeWidget = (widgetId) => {
    updateDashboard.mutate({ dashboardId: dashboard.id, widgets: widgets.filter(w => w.id !== widgetId) });
  };

  return (
    <div className="p-6">
      {widgets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center text-2xl mb-4">📊</div>
          <p className="font-semibold mb-1">No widgets yet</p>
          <p className="text-sm text-muted-foreground mb-4">Add widgets to build your custom dashboard</p>
          <button
            onClick={() => setAddWidgetOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add widget
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {widgets.map(w => <WidgetCard key={w.id} widget={w} onRemove={removeWidget} canEdit />)}
          </div>
          <button
            onClick={() => setAddWidgetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-primary/40 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add widget
          </button>
        </>
      )}

      {addWidgetOpen && <AddWidgetModal onAdd={addWidget} onClose={() => setAddWidgetOpen(false)} />}
    </div>
  );
}

// ── Main DashboardsPage ───────────────────────────────────────────────────────
export default function DashboardsPage() {
  const { workspaceSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [newDashName, setNewDashName]   = useState("");
  const [addingDash,  setAddingDash]    = useState(false);
  const [renamingId,  setRenamingId]    = useState(null);
  const [renameVal,   setRenameVal]     = useState("");

  const { data: dashboards = [] } = useDashboards(workspaceSlug);
  const createDashboard = useCreateDashboard(workspaceSlug);
  const deleteDashboard = useDeleteDashboard(workspaceSlug);
  const updateDashboard = useUpdateDashboard(workspaceSlug);

  // Active tab: "overview" | "analytics" | <dashboard.id>
  const activeTab = searchParams.get("tab") || "overview";
  const setTab = (t) => setSearchParams({ tab: t }, { replace: true });

  const handleCreate = () => {
    if (!newDashName.trim()) return;
    createDashboard.mutate({ name: newDashName.trim(), widgets: [] }, {
      onSuccess: (d) => { setNewDashName(""); setAddingDash(false); setTab(d.id); },
    });
  };

  const startRename = (d) => { setRenamingId(d.id); setRenameVal(d.name); };
  const commitRename = () => {
    if (!renameVal.trim()) return;
    updateDashboard.mutate({ dashboardId: renamingId, name: renameVal.trim() }, {
      onSuccess: () => setRenamingId(null),
    });
  };

  const userDashboards = dashboards.filter(d => !d.is_builtin);
  const activeDashboard = userDashboards.find(d => d.id === activeTab);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-end gap-0 border-b border-border bg-card px-6 flex-shrink-0 overflow-x-auto">

        {/* Overview (built-in) */}
        <Tab active={activeTab === "overview"} onClick={() => setTab("overview")} locked icon={<LayoutDashboard className="w-3.5 h-3.5" />} label="Overview" />

        {/* Analytics (built-in) */}
        <Tab active={activeTab === "analytics"} onClick={() => setTab("analytics")} locked icon={<BarChart2 className="w-3.5 h-3.5" />} label="Analytics" />

        {/* User dashboards */}
        {userDashboards.map(d => (
          <div key={d.id} className="relative group">
            {renamingId === d.id ? (
              <div className="flex items-center px-3 pt-2 pb-0 border-b-2 border-primary">
                <input
                  autoFocus
                  value={renameVal}
                  onChange={e => setRenameVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                  className="text-sm bg-transparent border-none outline-none w-28"
                />
              </div>
            ) : (
              <Tab
                active={activeTab === d.id}
                onClick={() => setTab(d.id)}
                label={d.name}
                onRename={() => startRename(d)}
                onDelete={() => { deleteDashboard.mutate(d.id); if (activeTab === d.id) setTab("overview"); }}
              />
            )}
          </div>
        ))}

        {/* + Add dashboard */}
        {addingDash ? (
          <div className="flex items-center gap-1 px-3 pt-2 pb-1 border-b-2 border-primary">
            <input
              autoFocus
              value={newDashName}
              onChange={e => setNewDashName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setAddingDash(false); }}
              onBlur={() => { if (!newDashName.trim()) setAddingDash(false); else handleCreate(); }}
              placeholder="Dashboard name…"
              className="text-sm bg-transparent border-none outline-none w-32"
            />
          </div>
        ) : (
          <button
            onClick={() => setAddingDash(true)}
            className="flex items-center gap-1 px-3 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "overview"  && <OverviewTab  workspaceSlug={workspaceSlug} />}
        {activeTab === "analytics" && <AnalyticsTab workspaceSlug={workspaceSlug} />}
        {activeDashboard           && <CustomDashboardTab dashboard={activeDashboard} workspaceSlug={workspaceSlug} />}
      </div>
    </div>
  );
}

// ── Tab component ─────────────────────────────────────────────────────────────
function Tab({ active, onClick, label, icon, locked, onRename, onDelete }) {
  return (
    <div className="relative group flex-shrink-0">
      <button
        onClick={onClick}
        className={cn(
          "flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
          active
            ? "border-primary text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
        )}
      >
        {icon}
        {label}
        {locked && <Lock className="w-3 h-3 text-muted-foreground/50" />}
      </button>

      {/* Rename / delete controls for user dashboards */}
      {!locked && active && (
        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRename && (
            <button onClick={e => { e.stopPropagation(); onRename(); }} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <Settings2 className="w-3 h-3" />
            </button>
          )}
          {onDelete && (
            <button onClick={e => { e.stopPropagation(); onDelete(); }} className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
