import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Plus, Trash2, Copy, Share2, X, ChevronRight, BarChart2,
  BarChart, TrendingUp, PieChart, Activity, Users, FileText,
  Clock, Target, Layers, Calendar, CheckSquare, ArrowLeft,
  Settings2, Download, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useReports, useCreateReport, useUpdateReport, useDeleteReport,
  useReportData, useCreateReportShare, useDeleteReportShare,
  useScheduledReports, useCreateScheduledReport,
} from "@/hooks/useReports";
import { useProjects } from "@/hooks/useProjects";
import {
  BarChart as RBarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart as RPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useToast } from "@/components/ui/toast";

// ── Chart type catalogue ──────────────────────────────────────────────────────
const CHART_TYPES = [
  { id: "bar",          label: "Bar Chart",       icon: BarChart,   category: "Basic"    },
  { id: "horizontal_bar", label: "Horizontal Bar", icon: BarChart,  category: "Basic"    },
  { id: "line",         label: "Line Chart",       icon: TrendingUp, category: "Basic"   },
  { id: "area",         label: "Area Chart",       icon: Activity,   category: "Basic"   },
  { id: "pie",          label: "Pie Chart",        icon: PieChart,   category: "Basic"   },
  { id: "donut",        label: "Donut Chart",      icon: PieChart,   category: "Basic"   },
  { id: "stacked_bar",  label: "Stacked Bar",      icon: BarChart,   category: "Advanced" },
  { id: "stacked_area", label: "Stacked Area",     icon: Activity,   category: "Advanced" },
  { id: "kpi",          label: "KPI Card",         icon: Target,     category: "Metric"   },
  { id: "table",        label: "Data Table",       icon: FileText,   category: "Metric"   },
];

// ── Data sources ──────────────────────────────────────────────────────────────
const DATA_SOURCES = [
  { id: "tasks",        label: "Tasks",           icon: CheckSquare, desc: "Task counts by status, priority, assignee, or type" },
  { id: "time_entries", label: "Time Entries",    icon: Clock,       desc: "Hours logged per member or project" },
  { id: "velocity",     label: "Sprint Velocity", icon: TrendingUp,  desc: "Completed tasks & story points per sprint" },
  { id: "throughput",   label: "Throughput",      icon: Activity,    desc: "Tasks completed over time" },
];

const GROUP_BY_OPTIONS = {
  tasks:        [{ v: "status", l: "Status" }, { v: "priority", l: "Priority" }, { v: "assignee", l: "Assignee" }, { v: "task_type", l: "Task Type" }],
  time_entries: [{ v: "member", l: "Member" }, { v: "project", l: "Project" }],
  velocity:     [],
  throughput:   [{ v: "day", l: "Daily" }, { v: "week", l: "Weekly" }, { v: "month", l: "Monthly" }],
};

const DATE_RANGE_OPTIONS = [
  { v: "7",   l: "Last 7 days"   },
  { v: "14",  l: "Last 14 days"  },
  { v: "30",  l: "Last 30 days"  },
  { v: "60",  l: "Last 60 days"  },
  { v: "90",  l: "Last 90 days"  },
  { v: "180", l: "Last 180 days" },
  { v: "365", l: "Last year"     },
];

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#f97316", "#84cc16"];

// ── Report templates ──────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    name: "Sprint Retrospective",
    config: { chart_type: "bar", data_source: "velocity", date_range_days: 90 },
  },
  {
    name: "Team Performance",
    config: { chart_type: "bar", data_source: "tasks", group_by: "assignee", date_range_days: 30 },
  },
  {
    name: "Project Health",
    config: { chart_type: "pie", data_source: "tasks", group_by: "status", date_range_days: 30 },
  },
  {
    name: "Time & Billing",
    config: { chart_type: "bar", data_source: "time_entries", group_by: "member", date_range_days: 30 },
  },
  {
    name: "Task Throughput",
    config: { chart_type: "line", data_source: "throughput", group_by: "week", date_range_days: 90 },
  },
];

// ── Chart renderer ────────────────────────────────────────────────────────────
function ChartPreview({ chartType, rawData }) {
  const data = rawData || [];

  if (!data.length) {
    return (
      <div className="h-56 flex flex-col items-center justify-center text-center gap-2 bg-muted/30 rounded-xl">
        <BarChart2 className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No data — configure source and filters, then save</p>
      </div>
    );
  }

  const tooltipStyle = {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    fontSize: 12,
  };

  if (chartType === "kpi") {
    const total = data.reduce((s, d) => s + (d.value || 0), 0);
    return (
      <div className="h-56 flex flex-col items-center justify-center bg-muted/20 rounded-xl">
        <p className="text-5xl font-black tabular-nums text-primary">{total}</p>
        <p className="text-sm text-muted-foreground mt-2">Total</p>
      </div>
    );
  }

  if (chartType === "table") {
    return (
      <div className="h-56 overflow-auto rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr>
              <th className="text-left p-2 font-semibold">Label</th>
              <th className="text-right p-2 font-semibold">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/40">
                <td className="p-2">{row.label}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{row.value ?? row.story_points ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chartType === "pie" || chartType === "donut") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <RPieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius={chartType === "donut" ? "50%" : 0}
            outerRadius="75%"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </RPieChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "line") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "area" || chartType === "stacked_area") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (chartType === "horizontal_bar") {
    const sorted = [...data].sort((a, b) => b.value - a.value);
    return (
      <ResponsiveContainer width="100%" height={Math.max(220, sorted.length * 36 + 20)}>
        <RBarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 80 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={76} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} maxBarSize={28} />
        </RBarChart>
      </ResponsiveContainer>
    );
  }

  // Default: vertical bar
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RBarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

// ── Share modal ───────────────────────────────────────────────────────────────
function ShareModal({ report, workspaceSlug, onClose }) {
  const toast        = useToast();
  const createShare  = useCreateReportShare(workspaceSlug);
  const deleteShare  = useDeleteReportShare(workspaceSlug);
  const [link, setLink] = useState(null);

  const handleCreate = () => {
    createShare.mutate(report.id, {
      onSuccess: (data) => {
        const url = `${window.location.origin}/reports/shared/${data.token}`;
        setLink(url);
      },
    });
  };

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Link copied!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2"><Share2 className="w-4 h-4" /> Share Report</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        {!link ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">Create a public read-only link anyone can view.</p>
            <button
              onClick={handleCreate}
              disabled={createShare.isPending}
              className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createShare.isPending ? "Creating…" : "Generate link"}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Link2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs truncate flex-1">{link}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={copy} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                Copy link
              </button>
              <button
                onClick={() => { deleteShare.mutate(report.id); setLink(null); }}
                className="px-3 py-2 border border-destructive/30 text-destructive rounded-lg text-sm hover:bg-destructive/10 transition-colors"
              >
                Revoke
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Config panel ──────────────────────────────────────────────────────────────
function ConfigPanel({ config, onChange, projects }) {
  const projectOptions = [{ v: "", l: "All projects" }, ...projects.map((p) => ({ v: p.id, l: p.name }))];
  const groupByOpts    = GROUP_BY_OPTIONS[config.data_source] || [];

  const set = (key, val) => onChange({ ...config, [key]: val });

  return (
    <div className="space-y-5">
      {/* Chart type */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chart Type</p>
        {["Basic", "Advanced", "Metric"].map((cat) => (
          <div key={cat} className="mb-2">
            <p className="text-[10px] text-muted-foreground mb-1">{cat}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {CHART_TYPES.filter((t) => t.category === cat).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => set("chart_type", t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-xs transition-colors text-left",
                      config.chart_type === t.id
                        ? "border-primary bg-primary/5 text-primary font-medium"
                        : "border-border hover:bg-accent text-foreground",
                    )}
                  >
                    <Icon className="w-3 h-3 flex-shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Data source */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Data Source</p>
        <div className="space-y-1.5">
          {DATA_SOURCES.map((ds) => {
            const Icon = ds.icon;
            return (
              <button
                key={ds.id}
                onClick={() => set("data_source", ds.id)}
                className={cn(
                  "w-full flex items-start gap-2 px-3 py-2 rounded-lg border text-left transition-colors",
                  config.data_source === ds.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent",
                )}
              >
                <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium">{ds.label}</p>
                  <p className="text-[10px] text-muted-foreground">{ds.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Filters</p>
        <div className="space-y-2">
          <div>
            <label className="text-[11px] text-muted-foreground mb-1 block">Project</label>
            <select
              value={config.project_id || ""}
              onChange={(e) => set("project_id", e.target.value || undefined)}
              className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {projectOptions.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>

          {groupByOpts.length > 0 && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Group by</label>
              <select
                value={config.group_by || groupByOpts[0]?.v || ""}
                onChange={(e) => set("group_by", e.target.value)}
                className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {groupByOpts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          )}

          {config.data_source !== "velocity" && (
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Date range</label>
              <select
                value={String(config.date_range_days || 30)}
                onChange={(e) => set("date_range_days", Number(e.target.value))}
                className="w-full text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {DATE_RANGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Report editor ─────────────────────────────────────────────────────────────
function ReportEditor({ report, workspaceSlug, onBack, onDelete }) {
  const toast      = useToast();
  const update     = useUpdateReport(workspaceSlug);
  const [name,     setName]     = useState(report.name);
  const [config,   setConfig]   = useState(report.config || { chart_type: "bar", data_source: "tasks" });
  const [showShare, setShowShare] = useState(false);
  const [dirty,    setDirty]    = useState(false);

  const { data: reportData, isLoading: dataLoading, refetch } = useReportData(workspaceSlug, report.id);
  const { data: projects = [] } = useProjects(workspaceSlug);

  const handleConfigChange = (newCfg) => {
    setConfig(newCfg);
    setDirty(true);
  };

  const handleSave = () => {
    update.mutate(
      { reportId: report.id, name, config },
      {
        onSuccess: () => {
          toast.success("Report saved");
          setDirty(false);
          refetch();
        },
      },
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
            className="text-sm font-semibold bg-transparent border-none outline-none focus:ring-0 hover:bg-muted/50 px-1 rounded"
            placeholder="Report name…"
          />
          {dirty && <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Unsaved</span>}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> Share
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || update.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Split layout: preview left, config right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chart preview */}
        <div className="flex-1 overflow-auto p-6">
          <div className="bg-card border border-border rounded-xl p-5 shadow-card min-h-[320px]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold">{name || "Untitled Report"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {DATA_SOURCES.find((d) => d.id === config.data_source)?.label || "No data source"} ·{" "}
                  {config.date_range_days ? `Last ${config.date_range_days} days` : "All time"}
                </p>
              </div>
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
                title="Refresh data"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>

            {dataLoading ? (
              <div className="h-56 flex items-center justify-center">
                <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
            ) : (
              <ChartPreview chartType={config.chart_type || "bar"} rawData={reportData?.data} />
            )}
          </div>

          {/* Data table below chart */}
          {reportData?.data?.length > 0 && (
            <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                <p className="text-xs font-semibold">Data Table</p>
                <span className="text-[11px] text-muted-foreground">{reportData.data.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20">
                    <tr>
                      <th className="text-left p-2.5 font-semibold text-muted-foreground">Label</th>
                      <th className="text-right p-2.5 font-semibold text-muted-foreground">Value</th>
                      {reportData.data[0]?.story_points !== undefined && (
                        <th className="text-right p-2.5 font-semibold text-muted-foreground">Story Points</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.data.map((row, i) => (
                      <tr key={i} className="border-t border-border hover:bg-muted/30">
                        <td className="p-2.5">{row.label}</td>
                        <td className="p-2.5 text-right tabular-nums font-medium">{row.value ?? 0}</td>
                        {row.story_points !== undefined && (
                          <td className="p-2.5 text-right tabular-nums font-medium">{row.story_points}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Config panel */}
        <div className="w-72 flex-shrink-0 border-l border-border overflow-auto p-4 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Configure</p>
          <ConfigPanel config={config} onChange={handleConfigChange} projects={projects} />
        </div>
      </div>

      {showShare && <ShareModal report={report} workspaceSlug={workspaceSlug} onClose={() => setShowShare(false)} />}
    </div>
  );
}

// ── Report list (home) ────────────────────────────────────────────────────────
function ReportList({ workspaceSlug, onSelect, onCreate }) {
  const { data: reports = [], isLoading } = useReports(workspaceSlug);
  const deleteReport = useDeleteReport(workspaceSlug);
  const createReport = useCreateReport(workspaceSlug);

  const handleTemplate = (tpl) => {
    createReport.mutate(
      { name: tpl.name, config: tpl.config },
      { onSuccess: (r) => onSelect(r) },
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" /> Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Build, save, and share custom charts from your project data.</p>
          </div>
          <button
            onClick={onCreate}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> New report
          </button>
        </div>

        {/* Saved reports */}
        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : reports.length > 0 ? (
          <div className="mb-8">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Saved Reports</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {reports.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onSelect(r)}
                  className="group relative bg-card border border-border rounded-xl p-4 text-left hover:shadow-card-hover hover:border-primary/30 transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <BarChart2 className="w-4 h-4 text-primary" />
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteReport.mutate(r.id); }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {DATA_SOURCES.find((d) => d.id === r.config?.data_source)?.label || "Custom"} ·{" "}
                    {CHART_TYPES.find((t) => t.id === r.config?.chart_type)?.label || "Chart"}
                  </p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Templates */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            {reports.length === 0 ? "Start with a template" : "Templates"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => handleTemplate(tpl)}
                disabled={createReport.isPending}
                className="bg-card border border-dashed border-border hover:border-primary/40 rounded-xl p-4 text-left hover:bg-accent/30 transition-all disabled:opacity-50"
              >
                <p className="text-sm font-medium mb-1">{tpl.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {DATA_SOURCES.find((d) => d.id === tpl.config.data_source)?.label} ·{" "}
                  {CHART_TYPES.find((t) => t.id === tpl.config.chart_type)?.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { workspaceSlug }       = useParams();
  const [selected, setSelected] = useState(null);
  const createReport            = useCreateReport(workspaceSlug);
  const deleteReport            = useDeleteReport(workspaceSlug);

  const handleCreate = () => {
    createReport.mutate(
      { name: "Untitled Report", config: { chart_type: "bar", data_source: "tasks", date_range_days: 30 } },
      { onSuccess: (r) => setSelected(r) },
    );
  };

  const handleDelete = () => {
    if (!selected) return;
    deleteReport.mutate(selected.id, { onSuccess: () => setSelected(null) });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {selected ? (
        <ReportEditor
          report={selected}
          workspaceSlug={workspaceSlug}
          onBack={() => setSelected(null)}
          onDelete={handleDelete}
        />
      ) : (
        <ReportList
          workspaceSlug={workspaceSlug}
          onSelect={setSelected}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
