import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  useAPIKeys,
  useCreateAPIKey,
  useRevokeAPIKey,
} from "@/hooks/useAPIKeys";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/toast";
import { BACKEND_URL } from "@/lib/env";
import { Loader } from "@/components/ui/Loader";

const INPUT_CLS =
  "w-full text-sm bg-background border border-border rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring";

const EXPIRY_OPTIONS = [
  { value: "",    label: "Never" },
  { value: "7",   label: "7 days" },
  { value: "30",  label: "30 days" },
  { value: "90",  label: "90 days" },
  { value: "365", label: "1 year" },
];

const SCOPES = [
  { id: "read", label: "Read", desc: "Read tasks, projects, members" },
  { id: "write", label: "Write", desc: "Create and update tasks and projects" },
  {
    id: "admin",
    label: "Admin",
    desc: "Manage workspace settings and members",
  },
];

function FormField({ label, children }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function NewKeyModal({ workspaceId, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState(["read"]);
  const [expiryDays, setExpiry] = useState("");
  const create = useCreateAPIKey(workspaceId);

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
    <Modal
      isOpen
      onClose={onClose}
      title="Generate API Key"
      icon={Key}
      confirmLabel="Generate key"
      confirmVariant="primary"
      onConfirm={submit}
      isLoading={create.isPending}
      isConfirmDisabled={!name.trim() || !scopes.length}
      maxWidth="480px"
    >
      <div className="space-y-4">
        <FormField label="Key name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI/CD pipeline, Zapier"
            className={INPUT_CLS}
          />
        </FormField>

        <FormField label="Scopes">
          <div className="space-y-2">
            {SCOPES.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5 rounded-md border cursor-pointer transition-colors",
                  scopes.includes(s.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-accent",
                )}
              >
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
        </FormField>

        <FormField label="Expiry (optional)">
          <select
            value={expiryDays}
            onChange={(e) => setExpiry(e.target.value)}
            className={INPUT_CLS}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </FormField>
      </div>
    </Modal>
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
    <Modal
      isOpen
      onClose={onClose}
      title="Copy your API key now"
      description="This key will not be shown again. Store it somewhere safe."
      icon={AlertTriangle}
      iconColor="text-amber-500"
      showFooter={false}
      maxWidth="520px"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2.5">
          <code className="text-xs font-mono flex-1 break-all">{rawKey}</code>
          <button
            onClick={copy}
            className="p-1.5 rounded-lg hover:bg-accent flex-shrink-0 transition-colors"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-700 dark:text-amber-300">
          Use it as:{" "}
          <code className="font-mono">
            Authorization: Bearer {rawKey.slice(0, 20)}…
          </code>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
        >
          I've saved the key
        </button>
      </div>
    </Modal>
  );
}

// Table Helpers ________________________________________________
const CELL = "px-4 py-3";

const COLUMNS = [
  {
    header: "Name",
    render: (k) => <span className="font-medium">{k.name}</span>,
  },
  {
    header: "Key prefix",
    className: "font-mono text-xs text-muted-foreground",
    render: (k) => <>{k.key_prefix}…</>,
  },
  {
    header: "Scopes",
    render: (k) => (
      <div className="flex gap-1 flex-wrap">
        {(k.scopes || []).map((s) => (
          <span
            key={s}
            className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded-md font-medium capitalize"
          >
            {s}
          </span>
        ))}
      </div>
    ),
  },
  {
    header: "Last used",
    className: "text-xs text-muted-foreground",
    render: (k) =>
      k.last_used_at
        ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })
        : "Never",
  },
  {
    header: "Expires",
    className: "text-xs text-muted-foreground",
    render: (k) =>
      k.expires_at
        ? formatDistanceToNow(new Date(k.expires_at), { addSuffix: true })
        : "Never",
  },
];

function KeyRow({ apiKey, onRevoke }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <tr className="hover:bg-muted/20 transition-colors">
        {COLUMNS.map((col) => (
          <td key={col.header} className={cn(CELL, col.className)}>
            {col.render(apiKey)}
          </td>
        ))}
        <td className={CELL}>
          <button
            onClick={() => setConfirming(true)}
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="Revoke key"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>

      <Modal
        variant="delete"
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title="Revoke API key"
        confirmLabel="Revoke key"
        onConfirm={() => { onRevoke(apiKey.id); setConfirming(false); }}
      >
        <p className="text-sm text-muted-foreground">
          Revoke <span className="font-medium text-foreground">{apiKey.name}</span>?
          Any integrations using <code className="font-mono text-xs">{apiKey.key_prefix}…</code> will stop working immediately.
        </p>
      </Modal>
    </>
  );
}

function KeysTable({ keys, onRevoke }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/30 border-b border-border">
        <tr>
          {COLUMNS.map((col) => (
            <th key={col.header} className={cn(CELL, "text-left font-medium text-muted-foreground text-xs")}>
              {col.header}
            </th>
          ))}
          <th className={CELL} />
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {keys.map((k) => (
          <KeyRow key={k.id} apiKey={k} onRevoke={onRevoke} />
        ))}
      </tbody>
    </table>
  );
}

export default function APIKeysPage() {
  const { workspaceId } = useParams();
  const { data: keys = [], isLoading } = useAPIKeys(workspaceId);
  const revoke = useRevokeAPIKey(workspaceId);
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newRawKey, setNewRawKey] = useState(null);

  const handleCreated = (data) => {
    setShowCreate(false);
    setNewRawKey(data.key);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-7xl p-8 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" /> API Keys
            </h1>
            <p className="text-sm text-muted-foreground mt-1 w-3/4">
              API keys allow programmatic access to your workspace. Each key is
              shown only once at creation.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Generate new key
          </button>
        </div>

        {/* Auth format */}
        <div className="bg-muted/40 rounded-md px-4 py-3 text-xs font-mono text-muted-foreground">
          Authorization: Bearer jcn_&lt;your-key&gt;
        </div>

        {/* Keys table */}
        <div className="bg-card border border-border rounded-md overflow-hidden shadow-card">
          {isLoading ? (
            <Loader className="min-h-screen" />
          ) : keys.length === 0 ? (
            <EmptyState
              illustration="api-keys"
              title="No API keys yet"
              description="Create a key to start using the JCN API"
            />
          ) : (
            <KeysTable
              keys={keys}
              onRevoke={(id) =>
                revoke.mutate(id, {
                  onSuccess: () => toast.success("Key revoked"),
                })
              }
            />
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
        <NewKeyModal
          workspaceId={workspaceId}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
      {newRawKey && (
        <NewKeyReveal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </div>
  );
}
