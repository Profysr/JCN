import { useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { useParams } from "react-router-dom";
import {
  Upload,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RotateCcw,
  FileText,
  Loader2,
  ChevronRight,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useImportSources,
  useImportJobs,
  useUploadImport,
  useUpdateImportMapping,
  useRunImport,
  useRollbackImport,
  useDeleteImportJob,
} from "@/hooks/useImport";
import { useWorkspaceSocket } from "@/hooks/useWorkspaceSocket";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/toast";

// ── Source icons ──────────────────────────────────────────────────────────────
import {
  SiJira,
  SiClickup,
  SiAsana,
  SiGithub,
  SiNotion
} from "react-icons/si";
import { CgMonday } from "react-icons/cg";
import { FileSpreadsheet } from "lucide-react";

// Brand colour + icon component for each supported import source.
// Adding a new source = one entry here, nothing else to change.
const SOURCE_ICONS = {
  jira: { icon: SiJira, color: "#0052CC" },
  clickup: { icon: SiClickup, color: "#7B68EE" },
  monday: { icon: CgMonday, color: "#F64048" },
  notion: { icon: SiNotion, color: "currentColor" },
  github: { icon: SiGithub, color: "currentColor" },
  asana: { icon: SiAsana, color: "#F06A6A" },
  csv: { icon: FileSpreadsheet, color: "#16A34A" },
};

// Export instructions shown in step 1 for each source
const SOURCE_EXPORT_HINT = {
  jira:    "Export from Jira: Issues → Export → XML export",
  clickup: "Export from ClickUp: Space Settings → Import/Export → Export as CSV",
  monday:  "Export from Monday: Board → ⋯ → Export board to Excel/CSV",
  notion:  "Export from Notion: Settings → Export content → CSV",
  github:  "Export from GitHub: Issues tab → Export to CSV (via GitHub CLI or third-party)",
  asana:   "Export from Asana: Project → ⋯ → Export/Print → CSV",
  csv:     "Upload any CSV file — you'll map the columns in the next step.",
};

function SourceIcon({ sourceId, size = 28 }) {
  const entry = SOURCE_ICONS[sourceId];
  if (!entry) return <FileSpreadsheet size={size} />;
  const Icon = entry.icon;
  return <Icon size={size} color={entry.color} />;
}

function SourceCard({ source, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(source.id)}
      className={cn(
        "flex flex-col items-center gap-2 p-4 rounded-md border text-center transition-all",
        selected === source.id
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-accent",
      )}
    >
      <SourceIcon sourceId={source.id} size={28} />
      <span className="text-sm font-medium">{source.label}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {source.format}
      </span>
    </button>
  );
}

// ── File drop zone ────────────────────────────────────────────────────────────
function DropZone({ source, onFile, uploading }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handle = (file) => {
    if (!file) return;
    onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handle(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed cursor-pointer h-40 transition-colors",
        dragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40 hover:bg-accent/30",
      )}
    >
      {uploading ? (
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      ) : (
        <>
          <Upload className="w-7 h-7 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">
              Drop your file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {source === "jira" ? "Jira XML export" : "CSV export from your tool"}{" "}
              · Max 50 MB
            </p>
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={source === "jira" ? ".xml" : ".csv"}
        onChange={(e) => handle(e.target.files[0])}
      />
    </div>
  );
}

// ── Field mapping table ───────────────────────────────────────────────────────
const JCN_FIELDS = [
  { v: "skip", l: "— Skip —" },
  { v: "title", l: "Title" },
  { v: "description", l: "Description" },
  { v: "status_name", l: "Status" },
  { v: "priority", l: "Priority" },
  { v: "task_type", l: "Type" },
  { v: "assignee_email", l: "Assignee email" },
  { v: "due_date", l: "Due date" },
  { v: "start_date", l: "Start date" },
  { v: "labels", l: "Labels" },
  { v: "estimate_hours", l: "Estimate (hours)" },
  { v: "external_id", l: "External ID" },
];

function MappingTable({ mapping, headers, onChange, isCSV }) {
  if (!isCSV) {
    // For XML/JSON sources the mapping is fixed — just show it read-only
    const entries = Object.entries(mapping);
    return (
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-4 py-2 font-semibold text-muted-foreground">
                Source field
              </th>
              <th className="text-left px-4 py-2 font-semibold text-muted-foreground">
                JCN field
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map(([src, jcn]) => (
              <tr key={src}>
                <td className="px-4 py-2 font-mono">{src}</td>
                <td className="px-4 py-2 text-muted-foreground capitalize">
                  {jcn}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // CSV: show dropdowns per column
  // mapping is {col: {jcn_field, confidence}} (from backend) or {col: jcn_field} (user edited)
  const normalised = Object.fromEntries(
    Object.entries(mapping).map(([col, val]) => [
      col,
      typeof val === "object" ? val.jcn_field : val,
    ]),
  );

  const update = (col, jcn_field) =>
    onChange({ ...normalised, [col]: jcn_field });

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-left px-4 py-2 font-semibold text-muted-foreground">
              Source column
            </th>
            <th className="text-left px-4 py-2 font-semibold text-muted-foreground">
              Map to JCN field
            </th>
            <th className="text-left px-4 py-2 font-semibold text-muted-foreground">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {(headers || Object.keys(mapping)).map((col) => {
            const raw = mapping[col];
            const conf = typeof raw === "object" ? raw.confidence : null;
            return (
              <tr key={col}>
                <td className="px-4 py-2 font-mono">{col}</td>
                <td className="px-4 py-2">
                  <select
                    value={normalised[col] || "skip"}
                    onChange={(e) => update(col, e.target.value)}
                    className="text-xs bg-background border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    {JCN_FIELDS.map((f) => (
                      <option key={f.v} value={f.v}>
                        {f.l}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  {conf != null && (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        conf >= 0.9
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : conf >= 0.7
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {Math.round(conf * 100)}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Preview rows ──────────────────────────────────────────────────────────────
function PreviewTable({ rows }) {
  if (!rows?.length)
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        No preview available.
      </p>
    );
  const cols = [
    "title",
    "status_name",
    "priority",
    "task_type",
    "assignee_email",
    "due_date",
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-semibold text-muted-foreground capitalize whitespace-nowrap"
              >
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/20">
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 truncate max-w-[180px]">
                  {Array.isArray(row[c]) ? row[c].join(", ") : row[c] || "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, status }) {
  const colors = {
    importing: "bg-primary",
    complete: "bg-emerald-500",
    failed: "bg-destructive",
  };
  return (
    <div className="space-y-1.5">
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            colors[status] || "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground text-right tabular-nums">
        {pct}%
      </p>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  "Select source",
  "Upload file",
  "Map fields",
  "Preview",
  "Import",
];

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center flex-1">
          <div
            className={cn(
              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 border-2 transition-colors",
              i < current
                ? "border-primary bg-primary text-primary-foreground"
                : i === current
                  ? "border-primary bg-background text-primary"
                  : "border-border bg-muted text-muted-foreground",
            )}
          >
            {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={cn(
                "flex-1 h-0.5 mx-1 transition-colors",
                i < current ? "bg-primary" : "bg-border",
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Job history row ───────────────────────────────────────────────────────────
function JobHistoryRow({ job, workspaceId, onResume }) {
  const rollback = useRollbackImport(workspaceId);
  const deleteJob = useDeleteImportJob(workspaceId);
  const toast = useToast();

  const statusColor =
    {
      complete: "text-emerald-600",
      failed: "text-destructive",
      importing: "text-primary",
      parsing: "text-amber-600",
    }[job.status] || "text-muted-foreground";

  const canDelete = job.status !== "importing";

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
      <div className="flex items-center gap-3">
        <SourceIcon sourceId={job.source} size={20} />
        <div>
          <p className="text-sm font-medium">{job.file_name || job.source}</p>
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}{" "}
            ·
            {job.total_count > 0
              ? ` ${job.imported_count}/${job.total_count} tasks`
              : ""}
            {job.skipped_count > 0 ? ` · ${job.skipped_count} skipped` : ""}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn("text-xs font-medium capitalize", statusColor)}>
          {job.status}
        </span>
        {job.can_rollback && (
          <button
            onClick={() =>
              rollback.mutate(job.id, {
                onSuccess: () => toast.success("Import rolled back"),
              })
            }
            disabled={rollback.isPending}
            className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" /> Undo
          </button>
        )}
        {job.status === "mapped" && onResume && (
          <button
            onClick={() => onResume(job.id)}
            className="flex items-center gap-1 text-xs text-primary hover:underline font-medium"
          >
            <ChevronRight className="w-3.5 h-3.5" /> Resume
          </button>
        )}
        {canDelete && (
          <button
            onClick={() =>
              deleteJob.mutate(job.id, {
                onSuccess: () => toast.success("Entry removed"),
                onError: () => toast.error("Could not delete entry"),
              })
            }
            disabled={deleteJob.isPending}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            title="Remove from history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ImportPage() {
  const { workspaceId } = useParams();
  const toast = useToast();

  const { data: sources = [] } = useImportSources(workspaceId);
  const { data: jobs = [], refetch: refetchJobs } =
    useImportJobs(workspaceId);

  const upload = useUploadImport(workspaceId);
  const updateMapping = useUpdateImportMapping(workspaceId);
  const runImport = useRunImport(workspaceId);

  const [step, setStep] = useState(0); // 0–4
  const [source, setSource] = useState(null);
  const [jobData, setJobData] = useState(null); // upload response
  const [mapping, setMapping] = useState({});
  const [headers, setHeaders] = useState([]);
  const [progress, setProgress] = useState({
    pct: 0,
    status: "idle",
    imported: 0,
    skipped: 0,
    total: 0,
  });

  // Listen for import.progress events via WebSocket
  useWorkspaceSocket(workspaceId, (event) => {
    if (event.type === "import.progress") {
      const p = event.payload;
      setProgress({
        pct: p.progress_pct,
        status: p.status,
        imported: p.imported,
        skipped: p.skipped,
        total: p.total,
      });
      if (p.status === "complete" || p.status === "failed") {
        refetchJobs();
      }
    }
  });

  const handleFile = useCallback(
    (file) => {
      if (!source) return;
      upload.mutate(
        { source, file },
        {
          onSuccess: (data) => {
            setJobData(data);
            const m = data.field_mapping || {};
            setMapping(m);
            setHeaders(data.headers || []);
            setStep(2);
          },
          onError: (e) =>
            toast.error(
              "Parse failed: " + (e.response?.data?.error || e.message),
            ),
        },
      );
    },
    [source],
  );

  const handleResume = useCallback(
    async (jobId) => {
      try {
        const { data } = await api.get(
          `/api/workspaces/${workspaceId}/import/jobs/${jobId}/`,
        );
        setSource(data.source);
        setJobData(data);
        setMapping(data.field_mapping || {});
        // Headers are the keys of field_mapping for CSV; empty for XML (fixed mapping)
        setHeaders(Object.keys(data.field_mapping || {}));
        setStep(3); // jump straight to preview
      } catch {
        toast.error("Could not load job — please try re-uploading the file.");
      }
    },
    [workspaceId],
  );

  const handleSaveMapping = () => {
    // Normalise mapping before saving: {col: {jcn_field,...}} → {col: jcn_field}
    const flat = Object.fromEntries(
      Object.entries(mapping).map(([k, v]) => [
        k,
        typeof v === "object" ? v.jcn_field : v,
      ]),
    );
    updateMapping.mutate(
      { jobId: jobData.id, field_mapping: flat },
      { onSuccess: () => setStep(3) },
    );
  };

  const handleRunImport = () => {
    setStep(4);
    setProgress({
      pct: 0,
      status: "importing",
      imported: 0,
      skipped: 0,
      total: jobData.total_count,
    });
    runImport.mutate(jobData.id, {
      onError: (e) =>
        toast.error("Import failed: " + (e.response?.data?.error || e.message)),
    });
  };

  const reset = () => {
    setStep(0);
    setSource(null);
    setJobData(null);
    setMapping({});
    setHeaders([]);
    setProgress({ pct: 0, status: "idle", imported: 0, skipped: 0, total: 0 });
  };

  const isCSV = source !== "jira";

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl p-8 space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" /> Import & Migration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Switch to JCN in minutes. Import tasks from Jira, ClickUp, Asana,
            Notion, GitHub, Monday, or any CSV file.
          </p>
        </div>

        {/* Wizard card */}
        <div className="bg-card border border-border rounded-md shadow-card p-6">
          <StepBar current={step} />

          {/* Step 0: Select source */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold mb-4">
                Where are you migrating from?
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(125px,1fr))] gap-3">
                {sources.map((s) => (
                  <SourceCard
                    key={s.id}
                    source={s}
                    selected={source}
                    onSelect={setSource}
                  />
                ))}
              </div>
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setStep(1)}
                  disabled={!source}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  Next <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={() => setStep(0)}
                  className="p-1.5 rounded hover:bg-accent"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="text-base font-semibold">
                  Upload your export file
                </h2>
              </div>

              <div className="bg-muted/30 rounded-md px-4 py-3 text-xs text-muted-foreground mb-4">
                {SOURCE_EXPORT_HINT[source]}
              </div>

              <DropZone
                source={source}
                onFile={handleFile}
                uploading={upload.isPending}
              />

              {upload.isError && (
                <p className="text-xs text-destructive mt-2">
                  {upload.error?.response?.data?.error ||
                    "Parse failed. Check your file format."}
                </p>
              )}
            </div>
          )}

          {/* Step 2: Map fields */}
          {step === 2 && jobData && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-semibold">Field Mapping</h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {jobData.total_count} rows detected
                </span>
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                {isCSV
                  ? "Review and adjust how each column maps to a JCN task field. High-confidence matches are auto-selected."
                  : "This is the fixed mapping for your source format. Click Next to preview."}
              </p>

              <MappingTable
                mapping={mapping}
                headers={headers}
                onChange={setMapping}
                isCSV={isCSV}
              />

              <div className="flex justify-between mt-5">
                <button
                  onClick={() => setStep(1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={updateMapping.isPending}
                  className="flex items-center gap-1.5 px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {updateMapping.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : null}
                  Preview <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && jobData && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="p-1.5 rounded hover:bg-accent"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <h2 className="text-base font-semibold">
                    Preview (first 10 rows)
                  </h2>
                </div>
                <span className="text-xs text-muted-foreground">
                  {jobData.total_count} tasks will be imported
                </span>
              </div>

              <PreviewTable rows={jobData.preview_rows} />

              <div className="flex justify-between mt-5">
                <button
                  onClick={() => setStep(2)}
                  className="flex items-center gap-1 px-4 py-2 text-sm border border-border rounded-md hover:bg-accent"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
                <button
                  onClick={handleRunImport}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Import {jobData.total_count} tasks
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Progress */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold">
                {progress.status === "complete"
                  ? "✅ Import complete!"
                  : progress.status === "failed"
                    ? "❌ Import failed"
                    : "Importing…"}
              </h2>

              <ProgressBar pct={progress.pct} status={progress.status} />

              {progress.total > 0 && (
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: "Total", value: progress.total },
                    {
                      label: "Imported",
                      value: progress.imported,
                      color: "text-emerald-600",
                    },
                    {
                      label: "Skipped",
                      value: progress.skipped,
                      color: "text-amber-600",
                    },
                  ].map((s) => (
                    <div key={s.label} className="bg-muted/40 rounded-md py-3">
                      <p
                        className={cn(
                          "text-2xl font-bold tabular-nums",
                          s.color,
                        )}
                      >
                        {s.value}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {(progress.status === "complete" ||
                progress.status === "failed") && (
                <button
                  onClick={reset}
                  className="w-full py-2.5 border border-border rounded-md text-sm hover:bg-accent transition-colors flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-4 h-4" /> Start another import
                </button>
              )}
            </div>
          )}
        </div>

        {/* Past imports */}
        {jobs.length > 0 && (
          <div className="bg-card border border-border rounded-md shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Import History
              </p>
            </div>
            {jobs.map((j) => (
              <JobHistoryRow key={j.id} job={j} workspaceId={workspaceId} onResume={handleResume} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
