import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import { useToast } from "@/shared/components/ui/toast";
import {
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspace,
  useWorkspaces,
} from "@/shared/hooks/useWorkspace";
import { usePermission } from "@/contexts/PermissionsContext";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  AlertTriangle,
  Plug,
  ChevronRight,
  Key,
  Webhook,
  Upload,
} from "lucide-react";
import { Link } from "react-router-dom";

export default function SettingsPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { isOwner } = usePermission();
  const { toast } = useToast();

  const { data: workspace, isLoading } = useWorkspace(workspaceId);
  const { data: workspaces = [] } = useWorkspaces();
  const updateWorkspace = useUpdateWorkspace(workspaceId);
  const deleteWorkspace = useDeleteWorkspace(workspaceId);

  const [form, setForm] = useState({ name: "", description: "" });
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (workspace)
      setForm({
        name: workspace.name || "",
        description: workspace.description || "",
      });
  }, [workspace]);

  const handleSave = (e) => {
    e.preventDefault();
    setSaveSuccess(false);
    updateWorkspace.mutate(form, {
      onSuccess: () => setSaveSuccess(true),
    });
  };

  const handleDelete = () => {
    deleteWorkspace.mutate(undefined, {
      onSuccess: () => {
        const next = workspaces.find((w) => w.id !== workspaceId);
        navigate(next ? `/w/${next.id}` : "/onboarding", { replace: true });
      },
      onError: () => {
        setShowDeleteConfirm(false);
        toast({ title: "Failed to delete workspace", description: "Something went wrong. Please try again.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  const OtherPages = [
    {
      to: "integrations",
      icon: Plug,
      label: "Integrations",
      desc: "Teams, Google Chat webhooks",
    },
    {
      to: "api",
      icon: Key,
      label: "API Keys",
      desc: "Programmatic access",
    },
    {
      to: "webhooks",
      icon: Webhook,
      label: "Webhooks",
      desc: "Outbound event webhooks",
    },
    {
      to: "import",
      icon: Upload,
      label: "Import",
      desc: "Migrate from Jira, Trello…",
    },
  ];

  return (
    <div className="max-w-7xl p-8 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Workspace Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your workspace configuration
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {/* General settings */}
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-base font-medium mb-5">General</h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-name">Workspace name</Label>
              <Input
                id="ws-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-desc">
                Description{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <textarea
                id="ws-desc"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={3}
                placeholder="What is this workspace for?"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={updateWorkspace.isPending}>
                {updateWorkspace.isPending ? "Saving…" : "Save changes"}
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600">Saved!</span>
              )}
              {updateWorkspace.isError && (
                <span className="text-sm text-destructive">
                  Failed to save.
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Developer & integration quick-links */}
        <section className="rounded-md border bg-card p-4">
          <h2 className="text-base font-medium mb-1">
            Developer & Integrations
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Connect third-party tools, build on the JCN API, and migrate your
            data.
          </p>
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {OtherPages.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={`/w/${workspace?.id}/settings/${item.to}`}
                  className="flex items-center gap-3 px-4 py-3 bg-muted hover:bg-accent rounded-md text-sm transition-colors group"
                >
                  <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      {/* Danger zone — owner only */}
      {isOwner && (
        <section className="rounded-md border border-destructive/40 bg-card p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <h2 className="text-base font-medium text-destructive">
              Danger Zone
            </h2>
          </div>
          <p className="text-sm text-muted-foreground mb-5">
            Deleting the workspace is permanent. All projects, tasks, and
            members will be removed immediately.
          </p>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirm">
                Type{" "}
                <span className="font-semibold text-foreground">
                  {workspace?.name}
                </span>{" "}
                to confirm
              </Label>
              <Input
                id="delete-confirm"
                placeholder={workspace?.name}
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
              />
            </div>
            <Button
              variant="destructive"
              disabled={
                deleteConfirm !== workspace?.name || deleteWorkspace.isPending
              }
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete this workspace
            </Button>
          </div>
        </section>
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Delete workspace?"
          message={`This will permanently delete "${workspace?.name}" and all its projects, tasks, and members. This cannot be undone.`}
          confirmLabel={deleteWorkspace.isPending ? "Deleting…" : "Delete workspace"}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
