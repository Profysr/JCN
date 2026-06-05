import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Webhook, Plus, Trash2, X, Send, ChevronDown, ChevronUp,
  Check, XCircle, Loader2, RefreshCw, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useWebhooks, useCreateWebhook, useUpdateWebhook,
  useDeleteWebhook, useTestWebhook, useWebhookDeliveries,
} from "@/hooks/useWebhooks";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/toast";

const ALL_EVENTS = [
  { id: "task.created",    label: "task.created"    },
  { id: "task.updated",    label: "task.updated"    },
  { id: "task.deleted",    label: "task.deleted"    },
  { id: "task.assigned",   label: "task.assigned"   },
  { id: "task.commented",  label: "task.commented"  },
  { id: "task.completed",  label: "task.completed"  },
  { id: "sprint.started",  label: "sprint.started"  },
  { id: "sprint.completed", label: "sprint.completed" },
  { id: "member.added",    label: "member.added"    },
  { id: "member.removed",  label: "member.removed"  },
];

// ── Delivery log ──────────────────────────────────────────────────────────────

function DeliveryLog({ workspaceSlug, hookId }) {
  const { data: deliveries = [], isLoading, refetch } = useWebhookDeliveries(workspaceSlug, hookId);
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Recent Deliveries
        </p>
        <button onClick={() => refetch()} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {isLoading ? (
        <div className="py-4 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : deliveries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No deliveries yet. Click "Send test" to trigger one.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {deliveries.map((d) => (
            <div key={d.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors text-left"
              >
                {d.success
                  ? <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                }
                <span className="text-xs font-mono text-muted-foreground flex-shrink-0">{d.event}</span>
                <span className={cn("text-xs font-semibold ml-auto flex-shrink-0",
                  d.success ? "text-emerald-600" : "text-destructive")}>
                  {d.response_code ?? "—"}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {d.duration_ms != null ? `${d.duration_ms}ms` : ""}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                </span>
                {expanded === d.id ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
              </button>
              {expanded === d.id && (
                <div className="px-3 pb-3 space-y-2 border-t border-border bg-muted/10">
                  {d.response_body && (
                    <div>
                      <p className="text-[10px] text-muted-foreground mt-2 mb-0.5">Response</p>
                      <pre className="text-[10px] font-mono bg-muted rounded p-2 overflow-auto max-h-24">{d.response_body}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Webhook row ───────────────────────────────────────────────────────────────

function WebhookRow({ hook, workspaceSlug }) {
  const [open,        setOpen]        = useState(false);
  const [showSecret,  setShowSecret]  = useState(false);
  const [showLog,     setShowLog]     = useState(false);
  const update  = useUpdateWebhook(workspaceSlug);
  const remove  = useDeleteWebhook(workspaceSlug);
  const test    = useTestWebhook(workspaceSlug);
  const toast   = useToast();

  const [form, setForm] = useState({
    name:      hook.name,
    url:       hook.url,
    events:    hook.events,
    is_active: hook.is_active,
  });

  const allEvents = form.events.length === 0 || form.events.length === ALL_EVENTS.length;

  const toggleEvent = (id) => {
    const next = form.events.includes(id)
      ? form.events.filter((e) => e !== id)
      : [...form.events, id];
    setForm((f) => ({ ...f, events: next.length === ALL_EVENTS.length ? [] : next }));
  };

  const save = () => {
    update.mutate(
      { hookId: hook.id, ...form },
      { onSuccess: () => { toast.success("Webhook updated"); setOpen(false); } },
    );
  };

  const sendTest = () => {
    test.mutate(hook.id, {
      onSuccess: () => toast.success("Test event sent — check delivery log"),
      onError:   () => toast.error("Test delivery failed"),
    });
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
      {/* Header row */}
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn("w-2 h-2 rounded-full flex-shrink-0",
            hook.is_active ? "bg-emerald-500" : "bg-muted-foreground")} />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{hook.name}</p>
            <p className="text-xs text-muted-foreground truncate">{hook.url}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={sendTest}
            disabled={test.isPending}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50"
          >
            {test.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
            Test
          </button>
          <button
            onClick={() => setShowLog((s) => !s)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition-colors"
          >
            Log
          </button>
          <button
            onClick={() => setOpen((o) => !o)}
            className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            onClick={() => remove.mutate(hook.id, { onSuccess: () => toast.success("Webhook deleted") })}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delivery log */}
      {showLog && (
        <div className="border-t border-border px-5 py-4 bg-muted/10">
          <DeliveryLog workspaceSlug={workspaceSlug} hookId={hook.id} />
        </div>
      )}

      {/* Edit form */}
      {open && (
        <div className="border-t border-border px-5 py-4 space-y-4 bg-muted/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL</label>
              <input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Signing secret */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Signing secret</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted rounded-xl px-3 py-2">
                {showSecret ? hook.secret_prefix.replace("…", "••••••••••••••••") : hook.secret_prefix}
              </code>
              <button onClick={() => setShowSecret((s) => !s)} className="p-1.5 rounded hover:bg-accent">
                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Verify: <code className="font-mono">X-JCN-Signature: sha256=hmac(secret, timestamp + "." + body)</code>
            </p>
          </div>

          {/* Events */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-muted-foreground">Events</label>
              <button onClick={() => setForm((f) => ({ ...f, events: [] }))} className="text-[10px] text-primary hover:underline">
                {allEvents ? "All" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {ALL_EVENTS.map((ev) => {
                const active = form.events.length === 0 || form.events.includes(ev.id);
                return (
                  <label key={ev.id} className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer text-xs transition-colors",
                    active ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted",
                  )}>
                    <input type="checkbox" checked={active} onChange={() => toggleEvent(ev.id)} className="accent-primary" />
                    <code>{ev.label}</code>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="accent-primary" />
              Active
            </label>
            <div className="flex gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent">Cancel</button>
              <button onClick={save} disabled={update.isPending} className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 disabled:opacity-50">
                {update.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create modal ──────────────────────────────────────────────────────────────

function CreateWebhookModal({ workspaceSlug, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", url: "", events: [] });
  const create = useCreateWebhook(workspaceSlug);

  const submit = () => {
    if (!form.name || !form.url) return;
    create.mutate(form, { onSuccess: (data) => onCreated(data) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold">Add Webhook</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Name</label>
            <input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Deploy trigger" className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Payload URL</label>
            <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://your-server.com/webhook" className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Events <span className="opacity-60">(empty = all)</span></label>
            <div className="grid grid-cols-2 gap-1">
              {ALL_EVENTS.map((ev) => {
                const active = form.events.includes(ev.id);
                return (
                  <label key={ev.id} className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer text-xs transition-colors",
                    active ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground hover:bg-muted")}>
                    <input type="checkbox" checked={active}
                      onChange={() => setForm((f) => ({
                        ...f,
                        events: active ? f.events.filter((e) => e !== ev.id) : [...f.events, ev.id],
                      }))} className="accent-primary" />
                    <code>{ev.label}</code>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-accent">Cancel</button>
          <button onClick={submit} disabled={!form.name || !form.url || create.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Webhook className="w-3.5 h-3.5" />}
            Create webhook
          </button>
        </div>
      </div>
    </div>
  );
}

function SecretReveal({ secret, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        <h2 className="font-semibold mb-1 flex items-center gap-2"><Webhook className="w-4 h-4" /> Webhook created</h2>
        <p className="text-sm text-muted-foreground mb-4">Copy your signing secret now — it won't be shown again.</p>
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 mb-4">
          <code className="text-xs font-mono flex-1 break-all">{secret}</code>
          <button onClick={copy} className="p-1.5 rounded hover:bg-accent">
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <button onClick={onClose} className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
          I've saved the secret
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const { workspaceSlug }               = useParams();
  const { data: hooks = [], isLoading } = useWebhooks(workspaceSlug);
  const [showCreate, setShowCreate]     = useState(false);
  const [newSecret,  setNewSecret]      = useState(null);

  const handleCreated = (data) => {
    setShowCreate(false);
    if (data.secret) setNewSecret(data.secret);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Webhook className="w-5 h-5 text-primary" /> Webhooks
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Receive HTTP POST payloads whenever events happen in your workspace.
            </p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90">
            <Plus className="w-4 h-4" /> Add webhook
          </button>
        </div>

        {/* HMAC verification info */}
        <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Verifying payloads</p>
          <p>Each request includes <code className="font-mono">X-JCN-Signature: sha256=&lt;digest&gt;</code> and <code className="font-mono">X-JCN-Timestamp</code>.</p>
          <p>Compute <code className="font-mono">HMAC-SHA256(secret, timestamp + "." + body)</code> and compare.</p>
        </div>

        {isLoading ? (
          <div className="h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : hooks.length === 0 ? (
          <div className="py-16 flex flex-col items-center gap-2 text-center border border-dashed border-border rounded-2xl">
            <Webhook className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">No webhooks yet</p>
            <p className="text-xs text-muted-foreground">Add a webhook to receive real-time events</p>
          </div>
        ) : (
          <div className="space-y-4">
            {hooks.map((h) => <WebhookRow key={h.id} hook={h} workspaceSlug={workspaceSlug} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateWebhookModal workspaceSlug={workspaceSlug} onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
      {newSecret   && <SecretReveal secret={newSecret} onClose={() => setNewSecret(null)} />}
    </div>
  );
}
