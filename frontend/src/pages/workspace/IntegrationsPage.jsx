import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, XCircle, Plug, ExternalLink, Trash2,
  Plus, Send, ChevronDown, ChevronUp, Settings2, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useIntegrationStatus,
  useDisconnectSlack, useSlackChannels, slackOAuthUrl,
  useSaveTeams, useDisconnectTeams, useTestTeams,
  useSaveGoogleChat, useDisconnectGoogleChat, useTestGoogleChat,
  useChannelMappings, useCreateChannelMapping,
  useUpdateChannelMapping, useDeleteChannelMapping,
} from "@/hooks/useIntegrations";
import { useProjects } from "@/hooks/useProjects";
import { useToast } from "@/components/ui/toast";

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_EVENTS = [
  { id: "task_created",       label: "Task created"       },
  { id: "task_assigned",      label: "Task assigned"      },
  { id: "task_commented",     label: "New comment"        },
  { id: "task_completed",     label: "Task completed"     },
  { id: "sprint_started",     label: "Sprint started"     },
  { id: "sprint_completed",   label: "Sprint completed"   },
  { id: "approval_requested", label: "Approval requested" },
];

// ── Status badge ──────────────────────────────────────────────────────────────

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

// ── Notification events picker ────────────────────────────────────────────────

function EventsPicker({ value = [], onChange }) {
  const allSelected = value.length === 0 || value.length === ALL_EVENTS.length;

  const toggle = (id) => {
    if (value.includes(id)) {
      const next = value.filter((e) => e !== id);
      onChange(next.length === ALL_EVENTS.length ? [] : next);
    } else {
      const next = [...value, id];
      onChange(next.length === ALL_EVENTS.length ? [] : next);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Events</p>
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
                active ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted",
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

// ── Channel mapping row ───────────────────────────────────────────────────────

function MappingRow({ mapping, platform, projects, slackChannels, workspaceSlug, onDelete }) {
  const [open, setOpen]   = useState(false);
  const [form, setForm]   = useState({
    channel_id:          mapping.channel_id || "",
    channel_name:        mapping.channel_name || "",
    webhook_url:         mapping.webhook_url || "",
    notification_format: mapping.notification_format || "detailed",
    enabled_events:      mapping.enabled_events || [],
    is_active:           mapping.is_active,
  });
  const update = useUpdateChannelMapping(workspaceSlug);
  const toast  = useToast();

  const projectName = mapping.project_name || "Workspace-wide";

  const save = () => {
    update.mutate(
      { mappingId: mapping.id, ...form },
      { onSuccess: () => { toast.success("Mapping saved"); setOpen(false); } },
    );
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0", form.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
          <span className="text-sm font-medium">{projectName}</span>
          {(mapping.channel_name || mapping.webhook_url) && (
            <span className="text-xs text-muted-foreground">
              → {mapping.channel_name || "webhook"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(mapping.id); }}
            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4 bg-muted/20">
          {/* Slack: channel picker */}
          {platform === "slack" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Target channel</label>
              {slackChannels?.length > 0 ? (
                <select
                  value={form.channel_id}
                  onChange={(e) => {
                    const ch = slackChannels.find((c) => c.id === e.target.value);
                    setForm((f) => ({ ...f, channel_id: e.target.value, channel_name: ch?.name || "" }));
                  }}
                  className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">— pick a channel —</option>
                  {slackChannels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}{c.is_private ? " 🔒" : ""}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.channel_id}
                  onChange={(e) => setForm((f) => ({ ...f, channel_id: e.target.value }))}
                  placeholder="Channel ID (e.g. C01234ABC)"
                  className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          )}

          {/* Teams / Google Chat: webhook URL override */}
          {(platform === "teams" || platform === "google_chat") && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Webhook URL override <span className="opacity-60">(leave blank to use workspace default)</span>
              </label>
              <input
                value={form.webhook_url}
                onChange={(e) => setForm((f) => ({ ...f, webhook_url: e.target.value }))}
                placeholder="https://…"
                className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {/* Format */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notification format</label>
            <div className="flex gap-2">
              {["compact", "detailed"].map((f) => (
                <button
                  key={f}
                  onClick={() => setForm((s) => ({ ...s, notification_format: f }))}
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
          </div>

          {/* Events */}
          <EventsPicker value={form.enabled_events} onChange={(v) => setForm((f) => ({ ...f, enabled_events: v }))} />

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="accent-primary"
            />
            <span className="text-xs">Active</span>
          </label>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors">
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

// ── Add mapping form ──────────────────────────────────────────────────────────

function AddMappingForm({ platform, projects, workspaceSlug, onClose }) {
  const [projectId, setProjectId] = useState("");
  const create = useCreateChannelMapping(workspaceSlug);
  const toast  = useToast();

  const submit = () => {
    create.mutate(
      {
        platform,
        project:         projectId || null,
        enabled_events:  [],
        notification_format: "detailed",
        is_active:       true,
      },
      { onSuccess: () => { toast.success("Mapping added"); onClose(); } },
    );
  };

  return (
    <div className="border border-dashed border-primary/40 rounded-xl px-4 py-3 bg-primary/5 space-y-3">
      <p className="text-xs font-semibold">Add mapping</p>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Project scope</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full text-sm bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Workspace-wide (all projects)</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={create.isPending}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {create.isPending ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

// ── Integration card shell ────────────────────────────────────────────────────

function IntegrationCard({ logo, name, description, badge, children }) {
  return (
    <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl flex-shrink-0">
            {logo}
          </div>
          <div>
            <p className="font-semibold">{name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{description}</p>
          </div>
        </div>
        <div className="flex-shrink-0">{badge}</div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

// ── Slack card ────────────────────────────────────────────────────────────────

function SlackCard({ workspaceSlug, slack, oauthConfigured }) {
  const toast        = useToast();
  const disconnect   = useDisconnectSlack(workspaceSlug);
  const { data: mappings = [] } = useChannelMappings(workspaceSlug, { platform: "slack" });
  const { data: channels = [], refetch: loadChannels } = useSlackChannels(workspaceSlug, { enabled: !!slack });
  const deleteMapping = useDeleteChannelMapping(workspaceSlug);
  const { data: projects = [] } = useProjects(workspaceSlug);
  const [addingMapping, setAddingMapping] = useState(false);

  const [searchParams] = useSearchParams();
  const justConnected  = searchParams.get("connected") === "slack";

  const handleConnect = () => {
    window.location.href = slackOAuthUrl(workspaceSlug);
  };

  return (
    <IntegrationCard
      logo="💬"
      name="Slack"
      description="Post task notifications to channels. Use /jcn slash commands directly from Slack to create and update tasks."
      badge={<StatusBadge connected={!!slack} />}
    >
      {justConnected && !slack && (
        <div className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 rounded-lg">
          ✅ Slack connected successfully! Configure your channel mappings below.
        </div>
      )}

      {!slack ? (
        <div className="space-y-3">
          {!oauthConfigured && (
            <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 rounded-lg">
              ⚠️ Slack OAuth is not configured on this server. Ask your admin to add{" "}
              <code className="font-mono">SLACK_CLIENT_ID</code> and{" "}
              <code className="font-mono">SLACK_CLIENT_SECRET</code> to the backend environment.
            </div>
          )}
          <button
            onClick={handleConnect}
            disabled={!oauthConfigured}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#4A154B] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <span className="text-lg">💬</span> Add to Slack
          </button>
          <SlackSetupGuide />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected info */}
          <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-3">
            <div>
              <p className="text-sm font-medium">{slack.team_name}</p>
              {slack.incoming_webhook_channel && (
                <p className="text-xs text-muted-foreground">Default channel: #{slack.incoming_webhook_channel}</p>
              )}
            </div>
            <button
              onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success("Slack disconnected") })}
              disabled={disconnect.isPending}
              className="text-xs text-destructive hover:underline flex items-center gap-1"
            >
              {disconnect.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Disconnect
            </button>
          </div>

          {/* Slash commands reference */}
          <SlashCommandRef />

          {/* Channel mappings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel Mappings</p>
              <button
                onClick={() => { loadChannels(); setAddingMapping(true); }}
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Plus className="w-3 h-3" /> Add mapping
              </button>
            </div>
            <div className="space-y-2">
              {mappings.map((m) => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  platform="slack"
                  projects={projects}
                  slackChannels={channels}
                  workspaceSlug={workspaceSlug}
                  onDelete={(id) => deleteMapping.mutate(id)}
                />
              ))}
              {addingMapping && (
                <AddMappingForm
                  platform="slack"
                  projects={projects}
                  workspaceSlug={workspaceSlug}
                  onClose={() => setAddingMapping(false)}
                />
              )}
              {mappings.length === 0 && !addingMapping && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No mappings yet. Add one to start receiving notifications.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </IntegrationCard>
  );
}

// ── Teams card ────────────────────────────────────────────────────────────────

function TeamsCard({ workspaceSlug, teams }) {
  const toast       = useToast();
  const save        = useSaveTeams(workspaceSlug);
  const disconnect  = useDisconnectTeams(workspaceSlug);
  const test        = useTestTeams(workspaceSlug);
  const { data: mappings = [] } = useChannelMappings(workspaceSlug, { platform: "teams" });
  const deleteMapping = useDeleteChannelMapping(workspaceSlug);
  const { data: projects = [] } = useProjects(workspaceSlug);
  const [addingMapping, setAddingMapping] = useState(false);
  const [webhookUrl,  setWebhookUrl]  = useState(teams?.webhook_url || "");
  const [displayName, setDisplayName] = useState(teams?.display_name || "JCN");

  const handleSave = () => {
    save.mutate(
      { webhook_url: webhookUrl, display_name: displayName },
      { onSuccess: () => toast.success("Teams webhook saved") },
    );
  };

  const handleTest = () => {
    test.mutate(undefined, {
      onSuccess: () => toast.success("Test message sent to Teams ✅"),
      onError: (e) => toast.error("Test failed: " + (e.response?.data?.error || e.message)),
    });
  };

  return (
    <IntegrationCard
      logo="🟪"
      name="Microsoft Teams"
      description="Send task notifications to a Teams channel via incoming webhook. No app installation required."
      badge={<StatusBadge connected={!!teams} />}
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Webhook URL
            <a
              href="https://docs.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
            >
              How to create <ExternalLink className="w-3 h-3" />
            </a>
          </label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://yourorg.webhook.office.com/webhookb2/…"
            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Display name in Teams</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="JCN"
            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!webhookUrl || save.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
            {teams ? "Update" : "Connect"}
          </button>
          {teams && (
            <>
              <button
                onClick={handleTest}
                disabled={test.isPending}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                {test.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Test
              </button>
              <button
                onClick={() => disconnect.mutate(undefined, { onSuccess: () => { toast.success("Teams disconnected"); setWebhookUrl(""); } })}
                className="text-xs text-destructive hover:underline ml-auto"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {teams && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel Mappings</p>
              <button onClick={() => setAddingMapping(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {mappings.map((m) => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  platform="teams"
                  projects={projects}
                  workspaceSlug={workspaceSlug}
                  onDelete={(id) => deleteMapping.mutate(id)}
                />
              ))}
              {addingMapping && (
                <AddMappingForm platform="teams" projects={projects} workspaceSlug={workspaceSlug} onClose={() => setAddingMapping(false)} />
              )}
              {mappings.length === 0 && !addingMapping && (
                <p className="text-xs text-muted-foreground text-center py-3">No mappings yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}

// ── Google Chat card ──────────────────────────────────────────────────────────

function GoogleChatCard({ workspaceSlug, googleChat }) {
  const toast       = useToast();
  const save        = useSaveGoogleChat(workspaceSlug);
  const disconnect  = useDisconnectGoogleChat(workspaceSlug);
  const test        = useTestGoogleChat(workspaceSlug);
  const { data: mappings = [] } = useChannelMappings(workspaceSlug, { platform: "google_chat" });
  const deleteMapping = useDeleteChannelMapping(workspaceSlug);
  const { data: projects = [] } = useProjects(workspaceSlug);
  const [addingMapping, setAddingMapping] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(googleChat?.webhook_url || "");
  const [spaceName,  setSpaceName]  = useState(googleChat?.space_name || "");

  const handleSave = () => {
    save.mutate(
      { webhook_url: webhookUrl, space_name: spaceName },
      { onSuccess: () => toast.success("Google Chat webhook saved") },
    );
  };

  const handleTest = () => {
    test.mutate(undefined, {
      onSuccess: () => toast.success("Test message sent to Google Chat ✅"),
      onError: (e) => toast.error("Test failed: " + (e.response?.data?.error || e.message)),
    });
  };

  return (
    <IntegrationCard
      logo="🟢"
      name="Google Chat"
      description="Send task notifications to a Google Chat Space via incoming webhook. Works with Google Workspace."
      badge={<StatusBadge connected={!!googleChat} />}
    >
      <div className="space-y-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Webhook URL
            <a
              href="https://developers.google.com/chat/how-tos/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
            >
              How to create <ExternalLink className="w-3 h-3" />
            </a>
          </label>
          <input
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://chat.googleapis.com/v1/spaces/…/messages?key=…"
            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Space name (optional label)</label>
          <input
            value={spaceName}
            onChange={(e) => setSpaceName(e.target.value)}
            placeholder="e.g. #engineering-alerts"
            className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!webhookUrl || save.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plug className="w-3.5 h-3.5" />}
            {googleChat ? "Update" : "Connect"}
          </button>
          {googleChat && (
            <>
              <button
                onClick={handleTest}
                disabled={test.isPending}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-xl text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                {test.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Test
              </button>
              <button
                onClick={() => disconnect.mutate(undefined, { onSuccess: () => { toast.success("Google Chat disconnected"); setWebhookUrl(""); } })}
                className="text-xs text-destructive hover:underline ml-auto"
              >
                Disconnect
              </button>
            </>
          )}
        </div>

        {googleChat && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Space Mappings</p>
              <button onClick={() => setAddingMapping(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {mappings.map((m) => (
                <MappingRow
                  key={m.id}
                  mapping={m}
                  platform="google_chat"
                  projects={projects}
                  workspaceSlug={workspaceSlug}
                  onDelete={(id) => deleteMapping.mutate(id)}
                />
              ))}
              {addingMapping && (
                <AddMappingForm platform="google_chat" projects={projects} workspaceSlug={workspaceSlug} onClose={() => setAddingMapping(false)} />
              )}
              {mappings.length === 0 && !addingMapping && (
                <p className="text-xs text-muted-foreground text-center py-3">No mappings yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </IntegrationCard>
  );
}

// ── Helper UI ─────────────────────────────────────────────────────────────────

function SlashCommandRef() {
  return (
    <div className="bg-muted/40 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold mb-2">Slack slash commands</p>
      <div className="space-y-1 font-mono text-xs text-muted-foreground">
        {[
          ["/jcn create <title>", "Create a new task"],
          ["/jcn list",           "List recent open tasks"],
          ["/jcn status <keyword> <status>", "Update task status"],
          ["/jcn assign <keyword> <email>",  "Assign a task"],
          ["/jcn help",           "Show all commands"],
        ].map(([cmd, desc]) => (
          <div key={cmd} className="flex gap-3">
            <span className="text-foreground w-52 flex-shrink-0">{cmd}</span>
            <span>{desc}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2">
        Your Slack email must match your JCN account email for commands to work.
      </p>
    </div>
  );
}

function SlackSetupGuide() {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs text-muted-foreground">
      <button onClick={() => setOpen((o) => !o)} className="hover:text-foreground transition-colors flex items-center gap-1">
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        How to set up Slack OAuth
      </button>
      {open && (
        <ol className="mt-2 space-y-1 list-decimal list-inside pl-1 leading-relaxed">
          <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary underline">api.slack.com/apps</a> and create a new app.</li>
          <li>Under <b>OAuth & Permissions</b>, add the redirect URL: <code className="bg-muted px-1 rounded">YOUR_BACKEND_URL/api/integrations/slack/oauth/callback/</code></li>
          <li>Add bot token scopes: <code className="bg-muted px-1 rounded">chat:write, channels:read, commands, users:read.email, incoming-webhook</code></li>
          <li>Under <b>Slash Commands</b>, create <code className="bg-muted px-1 rounded">/jcn</code> pointing to <code className="bg-muted px-1 rounded">YOUR_BACKEND_URL/api/integrations/slack/events/</code></li>
          <li>Under <b>Interactivity</b>, set the request URL to <code className="bg-muted px-1 rounded">YOUR_BACKEND_URL/api/integrations/slack/interactive/</code></li>
          <li>Copy the Client ID, Client Secret, and Signing Secret into your backend <code className="bg-muted px-1 rounded">.env</code> file.</li>
          <li>Restart the backend and click <b>Add to Slack</b> above.</li>
        </ol>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  const { workspaceSlug }     = useParams();
  const { data, isLoading }   = useIntegrationStatus(workspaceSlug);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Plug className="w-5 h-5 text-primary" />
            Integrations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect JCN to your team's communication tools. Get task notifications and manage work without leaving your chat app.
          </p>
        </div>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <SlackCard
              workspaceSlug={workspaceSlug}
              slack={data?.slack}
              oauthConfigured={data?.slack_oauth_configured}
            />
            <TeamsCard
              workspaceSlug={workspaceSlug}
              teams={data?.teams}
            />
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
