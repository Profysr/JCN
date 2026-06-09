import { useState } from "react";
import { Loader } from "@/components/ui/Loader";
import { useParams } from "react-router-dom";
import { SiGooglechat } from "react-icons/si";
import { BsMicrosoftTeams } from "react-icons/bs";
import {
  CheckCircle2,
  XCircle,
  Plug,
  ExternalLink,
  Trash2,
  Plus,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useIntegrationStatus,
  useSaveTeams,
  useDisconnectTeams,
  useTestTeams,
  useSaveGoogleChat,
  useDisconnectGoogleChat,
  useTestGoogleChat,
  useChannelMappings,
  useCreateChannelMapping,
  useUpdateChannelMapping,
  useDeleteChannelMapping,
} from "@/hooks/useIntegrations";
import { useProjects } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/toast";

// ── Constants ─────────────────────────────────────────────────────────────────
const ALL_EVENTS = [
  { id: "task_created", label: "Task created" },
  { id: "task_assigned", label: "Task assigned" },
  { id: "task_commented", label: "New comment" },
  { id: "task_completed", label: "Task completed" },
  { id: "sprint_started", label: "Sprint started" },
  { id: "sprint_completed", label: "Sprint completed" },
  { id: "approval_requested", label: "Approval requested" },
];

const INPUT_CLS =
  "w-full text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring";

// ── Primitives ────────────────────────────────────────────────────────────────
function StatusBadge({ connected }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" /> Not connected
    </span>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1 flex-wrap">
        {label}
        {hint && <span className="opacity-60">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

function SectionHeader({ title, onAdd }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );
}

// ── IntegrationCard shell ─────────────────────────────────────────────────────
function IntegrationCard({ logo, name, description, badge, children }) {
  return (
    <div className="bg-card border border-border rounded-md shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
            {logo}
          </div>
          <div>
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
              {description}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0">{badge}</div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

// ── EventsPicker ──────────────────────────────────────────────────────────────
function EventsPicker({ value = [], onChange }) {
  const allSelected = value.length === 0 || value.length === ALL_EVENTS.length;

  const toggle = (id) => {
    const next = value.includes(id)
      ? value.filter((e) => e !== id)
      : [...value, id];
    onChange(next.length === ALL_EVENTS.length ? [] : next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Events
        </p>
        <button
          onClick={() => onChange([])}
          className="text-[10px] text-primary hover:underline"
        >
          {allSelected ? "All selected" : "Select all"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {ALL_EVENTS.map((ev) => {
          const active = value.length === 0 || value.includes(ev.id);
          return (
            <label
              key={ev.id}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer text-xs transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(ev.id)}
                className="accent-primary"
              />
              {ev.label}
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ── MappingRow ────────────────────────────────────────────────────────────────
function MappingRow({ mapping, workspaceSlug, onDelete }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    webhook_url: mapping.webhook_url || "",
    notification_format: mapping.notification_format || "detailed",
    enabled_events: mapping.enabled_events || [],
    is_active: mapping.is_active,
  });
  const update = useUpdateChannelMapping(workspaceSlug);
  const toast = useToast();

  const patch = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const save = () =>
    update.mutate(
      { mappingId: mapping.id, ...form },
      {
        onSuccess: () => {
          toast.success("Mapping saved");
          setOpen(false);
        },
      },
    );

  return (
    <div className="border border-border rounded-md overflow-hidden">
      {/* Summary row */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2 h-2 rounded-full flex-shrink-0",
              form.is_active ? "bg-emerald-500" : "bg-muted-foreground",
            )}
          />
          <span className="text-sm font-medium">
            {mapping.project_name || "Workspace"}
          </span>
          {mapping.webhook_url && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              → {mapping.webhook_url}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(mapping.id);
            }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {open ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Edit panel */}
      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/20">
          <FieldRow
            label="Webhook URL override"
            hint="(leave blank to use workspace default)"
          >
            <input
              value={form.webhook_url}
              onChange={(e) => patch("webhook_url", e.target.value)}
              placeholder="https://…"
              className={INPUT_CLS}
            />
          </FieldRow>

          {/*
           * compact  — one-line summary e.g. "Task 'Fix login bug' completed by John"
           *            use this for busy channels where you want minimal noise.
           * detailed — rich card with title, assignee, project, due date, and a link.
           *            use this for a dedicated notifications channel.
           */}
          <FieldRow label="Notification format">
            <div className="flex gap-2">
              {["compact", "detailed"].map((f) => (
                <button
                  key={f}
                  onClick={() => patch("notification_format", f)}
                  className={cn(
                    "flex-1 py-1.5 text-xs rounded-lg border transition-colors capitalize",
                    form.notification_format === f
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </FieldRow>

          <EventsPicker
            value={form.enabled_events}
            onChange={(v) => patch("enabled_events", v)}
          />

          <label className="flex items-center gap-2 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => patch("is_active", e.target.checked)}
              className="accent-primary"
            />
            Active
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={update.isPending}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AddMappingInline ──────────────────────────────────────────────────────────
function AddMappingInline({ projects, onAdd, onClose, isPending }) {
  const [projectId, setProjectId] = useState("");
  return (
    <div className="border border-dashed border-primary/40 rounded-md px-4 py-3 bg-primary/5 space-y-3">
      <p className="text-xs font-semibold">Add mapping</p>
      <FieldRow label="Project scope">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Workspace-wide (all projects)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FieldRow>
      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onAdd(projectId)}
          disabled={isPending}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ── MappingsSection ───────────────────────────────────────────────────────────
function MappingsSection({
  platform,
  workspaceSlug,
  projects,
  label = "Channel Mappings",
}) {
  const [adding, setAdding] = useState(false);
  const { data: mappings = [] } = useChannelMappings(workspaceSlug, {
    platform,
  });
  const deleteMapping = useDeleteChannelMapping(workspaceSlug);
  const create = useCreateChannelMapping(workspaceSlug);
  const toast = useToast();

  const handleAdd = (projectId) =>
    create.mutate(
      {
        platform,
        project: projectId || null,
        enabled_events: [],
        notification_format: "detailed",
        is_active: true,
      },
      {
        onSuccess: () => {
          toast.success("Mapping added");
          setAdding(false);
        },
      },
    );

  return (
    <div>
      <SectionHeader title={label} onAdd={() => setAdding(true)} />
      <div className="space-y-2">
        {mappings.map((m) => (
          <MappingRow
            key={m.id}
            mapping={m}
            workspaceSlug={workspaceSlug}
            onDelete={(id) => deleteMapping.mutate(id)}
          />
        ))}
        {adding && (
          <AddMappingInline
            projects={projects}
            isPending={create.isPending}
            onAdd={handleAdd}
            onClose={() => setAdding(false)}
          />
        )}
        {mappings.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No mappings yet. Add one to start receiving notifications.
          </p>
        )}
      </div>
    </div>
  );
}

// ── WebhookCard — shared shell for Teams + Google Chat ────────────────────────
function WebhookCard({
  workspaceSlug,
  config,
  platform,
  icon,
  name,
  description,
  save,
  disconnect,
  test,
  urlPlaceholder,
  urlHowToHref,
  secondary, // { key, label, placeholder }
  sectionLabel,
}) {
  const toast = useToast();
  const { data: projects = [] } = useProjects(workspaceSlug);
  const [webhookUrl, setWebhookUrl] = useState(config?.webhook_url || "");
  const [secondaryVal, setSecondaryVal] = useState(
    config?.[secondary.key] || "",
  );

  const handleSave = () =>
    save.mutate(
      { webhook_url: webhookUrl, [secondary.key]: secondaryVal },
      { onSuccess: () => toast.success(`${name} webhook saved`) },
    );

  const handleTest = () =>
    test.mutate(undefined, {
      onSuccess: () => toast.success(`Test message sent to ${name} ✅`),
      onError: (e) =>
        toast.error("Test failed: " + (e.response?.data?.error || e.message)),
    });

  const handleDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast.success(`${name} disconnected`);
        setWebhookUrl("");
      },
    });

  return (
    <IntegrationCard
      logo={icon}
      name={name}
      description={description}
      badge={<StatusBadge connected={!!config} />}
    >
      <div className="space-y-4">
        <FieldRow
          label={
            <>
              Webhook URL{" "}
              <a
                href={urlHowToHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
              >
                How to create <ExternalLink className="w-3 h-3" />
              </a>
            </>
          }
        >
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={urlPlaceholder}
            className={INPUT_CLS}
          />
        </FieldRow>

        <FieldRow label={secondary.label}>
          <input
            value={secondaryVal}
            onChange={(e) => setSecondaryVal(e.target.value)}
            placeholder={secondary.placeholder}
            className={INPUT_CLS}
          />
        </FieldRow>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!webhookUrl || save.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plug className="w-3.5 h-3.5" />
            )}
            {config ? "Update" : "Connect"}
          </button>
          {config && (
            <>
              <button
                onClick={handleTest}
                disabled={test.isPending}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-md text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                {test.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                Test
              </button>
              <button
                onClick={handleDisconnect}
                className="text-xs text-destructive hover:underline ml-auto"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {config && (
          <MappingsSection
            platform={platform}
            workspaceSlug={workspaceSlug}
            projects={projects}
            label={sectionLabel}
          />
        )}
      </div>
    </IntegrationCard>
  );
}

// ── TeamsCard + GoogleChatCard — thin config wrappers ─────────────────────────
function TeamsCard({ workspaceSlug, teams }) {
  return (
    <WebhookCard
      workspaceSlug={workspaceSlug}
      config={teams}
      platform="teams"
      icon={<BsMicrosoftTeams className="w-7 h-7 text-[#6264A7]" />}
      name="Microsoft Teams"
      description="Send task notifications to a Teams channel via incoming webhook. No app installation required."
      save={useSaveTeams(workspaceSlug)}
      disconnect={useDisconnectTeams(workspaceSlug)}
      test={useTestTeams(workspaceSlug)}
      urlPlaceholder="https://yourorg.webhook.office.com/webhookb2/…"
      urlHowToHref="https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
      secondary={{
        key: "space_name",
        label: "Display name in Teams",
        placeholder: "JCN",
      }}
      sectionLabel="Channel Mappings"
    />
  );
}

function GoogleChatCard({ workspaceSlug, googleChat }) {
  return (
    <WebhookCard
      workspaceSlug={workspaceSlug}
      config={googleChat}
      platform="google_chat"
      icon={<SiGooglechat className="w-7 h-7 text-[#00897B]" />}
      name="Google Chat"
      description="Send task notifications to a Google Chat Space via incoming webhook. Works with Google Workspace."
      save={useSaveGoogleChat(workspaceSlug)}
      disconnect={useDisconnectGoogleChat(workspaceSlug)}
      test={useTestGoogleChat(workspaceSlug)}
      urlPlaceholder="https://chat.googleapis.com/v1/spaces/…/messages?key=…"
      urlHowToHref="https://developers.google.com/chat/how-tos/webhooks"
      secondary={{
        key: "space_name",
        label: "Space name (optional label)",
        placeholder: "#engineering-alerts",
      }}
      sectionLabel="Space Mappings"
    />
  );
}

// ── IntegrationsPage ──────────────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { workspaceSlug } = useParams();
  const { data, isLoading } = useIntegrationStatus(workspaceSlug);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" /> Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect JCN to your team's communication tools. Get task
            notifications and manage work without leaving your chat app.
          </p>
        </div>

        {isLoading ? (
          <Loader className="h-40" />
        ) : (
          <div className="space-y-4">
            <TeamsCard workspaceSlug={workspaceSlug} teams={data?.teams} />
            <GoogleChatCard
              workspaceSlug={workspaceSlug}
              googleChat={data?.google_chat}
            />
          </div>
        )}
      </div>
    </div>
  );
}
