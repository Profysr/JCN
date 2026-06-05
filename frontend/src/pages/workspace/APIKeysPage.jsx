import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Key, Plus, Trash2, Copy, Check, X, AlertTriangle, Loader2, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAPIKeys, useCreateAPIKey, useRevokeAPIKey } from "@/hooks/useAPIKeys";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/toast";
import { BACKEND_URL } from "@/lib/env";

const SCOPES = [
  { id: "read",  label: "Read",  desc: "Read tasks, projects, members"       },
  { id: "write", label: "Write", desc: "Create and update tasks and projects" },
  { id: "admin", label: "Admin", desc: "Manage workspace settings and members"},
];

function NewKeyModal({ workspaceSlug, onClose, onCreated }) {
  const [name,       setName]     = useState("");
  const [scopes,     setScopes]   = useState(["read"]);
  const [expiryDays, setExpiry]   = useState("");
  const create = useCreateAPIKey(workspaceSlug);

  const toggleScope = (s) =>
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const submit = () => {
    if (!name.trim()) return;
    const expires_at = expiryDays
      ? new Date(Date.now() + Number(expiryDays) * 86400000).toISOString()
      : undefined;
    create.mutate(
      { name: name.trim(), scopes, expires_at },
      { onSuccess: (data) => onCreated(data) },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base">Generate API Key</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Key name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI/CD pipeline, Zapier"
              className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-2 block">Scopes</label>
            <div className="space-y-2">
              {SCOPES.map((s) => (
                <label key={s.id} className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors",
                  scopes.includes(s.id) ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                )}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.id)}
                    onChange={() => toggleScope(s.id)}
                    className="accent-primary mt-0.5"
                  />
                  <div>
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Expiry (optional)</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full text-sm bg-background border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Never</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-xl hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim() || !scopes.length || create.isPending}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            {create.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
            Generate key
          </button>
        </div>
      </div>
    </div>
  );
}

function NewKeyReveal({ rawKey, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 z-10">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold">Copy your API key now</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          This key will not be shown again. Store it somewhere safe.
        </p>

        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 mb-4">
          <code className="text-xs font-mono flex-1 break-all">{rawKey}</code>
          <button
            onClick={copy}
            className="p-1.5 rounded-lg hover:bg-accent flex-shrink-0 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-4 text-xs text-amber-700 dark:text-amber-300">
          Use it as: <code className="font-mono">Authorization: Bearer {rawKey.slice(0, 20)}…</code>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
        >
          I've saved the key
        </button>
      </div>
    </div>
  );
}

export default function APIKeysPage() {
  const { workspaceSlug }          = useParams();
  const { data: keys = [], isLoading } = useAPIKeys(workspaceSlug);
  const revoke                     = useRevokeAPIKey(workspaceSlug);
  const toast                      = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newRawKey,  setNewRawKey]  = useState(null);

  const handleCreated = (data) => {
    setShowCreate(false);
    setNewRawKey(data.key);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" /> API Keys
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              API keys allow programmatic access to your workspace. Each key is shown only once at creation.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> New key
          </button>
        </div>

        {/* Auth format */}
        <div className="bg-muted/40 rounded-xl px-4 py-3 text-xs font-mono text-muted-foreground">
          Authorization: Bearer jcn_&lt;your-key&gt;
        </div>

        {/* Keys table */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-card">
          {isLoading ? (
            <div className="h-32 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : keys.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2 text-center">
              <Key className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm font-medium">No API keys yet</p>
              <p className="text-xs text-muted-foreground">Create a key to start using the JCN API</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Key prefix</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Scopes</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Last used</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">Expires</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.key_prefix}…</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(k.scopes || []).map((s) => (
                          <span key={s} className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-medium capitalize">
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {k.last_used_at
                        ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {k.expires_at
                        ? formatDistanceToNow(new Date(k.expires_at), { addSuffix: true })
                        : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          revoke.mutate(k.id, { onSuccess: () => toast.success("Key revoked") });
                        }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Docs link — Swagger UI lives on the Django server, not the Vite dev proxy */}
        <a
          href={`${BACKEND_URL}/api/docs/`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" /> View interactive API docs
        </a>
      </div>

      {showCreate && (
        <NewKeyModal workspaceSlug={workspaceSlug} onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {newRawKey && <NewKeyReveal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />}
    </div>
  );
}
