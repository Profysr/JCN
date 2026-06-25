import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Save,
  Lock,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
} from "@/shared/hooks/useRoles";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { APP_DEFS } from "@/shared/lib/navLinks";
import { ShortcutTooltip } from "@/shared/components/ui/ShortcutTooltip";

const _appDefByKey = Object.fromEntries(APP_DEFS.map((a) => [a.key, a]));

// ── Toggle Switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        checked ? "bg-primary" : "bg-muted",
        disabled && "opacity-40 cursor-not-allowed",
        !disabled && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

// ── Permission Toggle ─────────────────────────────────────────────────────────
function PermissionToggle({ label, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <p className="text-sm text-foreground leading-tight mr-3">{label}</p>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

// ── App Section (app_access gate + its permissions) ───────────────────────────
function AppSection({ appKey, appMeta, permDefs, appAccess, perms, onAccessToggle, onPermToggle, disabled }) {
  const [expanded, setExpanded] = useState(true);
  const appDef = _appDefByKey[appKey];
  const Icon = appDef?.icon;
  const colors = appDef?.colors;
  const hasAccess = !!appAccess[appKey];
  const permKeys = Object.keys(permDefs ?? {});

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      hasAccess ? "border-primary/20 bg-card" : "border-border/50 bg-muted/20",
    )}>
      {/* App header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {Icon && colors && (
          <div className={cn("w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0", colors.bg)}>
            <Icon className={cn("w-3.5 h-3.5", colors.text)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{appMeta?.name ?? appKey}</p>
          {appMeta?.description && (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug truncate">
              {appMeta.description}
            </p>
          )}
        </div>

        {/* App access toggle */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Access</span>
          <Toggle checked={hasAccess} onChange={(v) => onAccessToggle(appKey, v)} disabled={disabled} />
        </div>

        {/* Expand/collapse if there are permissions */}
        {permKeys.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((o) => !o)}
            className="ml-1 p-1 rounded hover:bg-accent transition-colors text-muted-foreground"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Permission toggles — only visible when expanded AND access is granted */}
      {permKeys.length > 0 && expanded && (
        <div className={cn(
          "px-4 pb-3 border-t border-border/40 pt-3 transition-all",
          !hasAccess && "opacity-40 pointer-events-none",
        )}>
          {!hasAccess && (
            <p className="text-xs text-muted-foreground italic mb-2">
              Enable app access above to configure individual permissions.
            </p>
          )}
          {permKeys.map((permKey) => (
            <PermissionToggle
              key={permKey}
              label={permDefs[permKey]?.label ?? permKey}
              checked={!!perms?.[appKey]?.[permKey]}
              onChange={(val) => onPermToggle(appKey, permKey, val)}
              disabled={disabled || !hasAccess}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Workspace Permissions Section (no app_access gate, always on) ────────────
function WorkspaceSection({ permDefs, perms, onPermToggle, disabled }) {
  const [expanded, setExpanded] = useState(true);
  const permKeys = Object.keys(permDefs ?? {});

  return (
    <div className="rounded-lg border border-border/50 bg-card">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors rounded-t-lg"
      >
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 bg-slate-500/15">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold">Workspace</p>
          <p className="text-xs text-muted-foreground">Core workspace actions</p>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 border-t border-border/40 pt-3">
          {permKeys.map((permKey) => (
            <PermissionToggle
              key={permKey}
              label={permDefs[permKey]?.label ?? permKey}
              checked={!!perms?.workspace?.[permKey]}
              onChange={(val) => onPermToggle("workspace", permKey, val)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Permission Preview ────────────────────────────────────────────────────────
function PermissionPreview({ perms, appAccess, registry }) {
  const [open, setOpen] = useState(false);
  const permissions = registry?.permissions ?? {};

  const enabled = Object.entries(perms).flatMap(([appKey, appPerms]) =>
    Object.entries(appPerms ?? {})
      .filter(([, v]) => v)
      .map(([k]) => permissions[appKey]?.[k]?.label ?? k),
  );

  const accessList = Object.entries(appAccess)
    .filter(([, v]) => v)
    .map(([k]) => _appDefByKey[k]?.label ?? k);

  return (
    <div className="rounded-md border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Summary ({accessList.length} apps · {enabled.length} permissions)</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">App Access</p>
            {accessList.length === 0
              ? <p className="text-xs text-muted-foreground italic">No app access.</p>
              : accessList.map((name) => (
                  <div key={name} className="flex items-center gap-2 text-xs text-foreground">
                    <span className="text-primary">✓</span>
                    <span>{name}</span>
                  </div>
                ))}
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Permissions</p>
            {enabled.length === 0
              ? <p className="text-xs text-muted-foreground italic">No permissions enabled.</p>
              : enabled.map((desc) => (
                  <div key={desc} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="mt-0.5 flex-shrink-0 text-emerald-500">✓</span>
                    <span>{desc}</span>
                  </div>
                ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Role Editor ───────────────────────────────────────────────────────────────
function RoleEditor({ role, workspaceId }) {
  const updateRole = useUpdateRole(workspaceId);
  const { data: registry } = usePermissions(workspaceId);

  const [name, setName] = useState(role.name);
  const [desc, setDesc] = useState(role.description ?? "");
  const [perms, setPerms] = useState({ ...role.permissions });
  const [appAccess, setAppAccess] = useState({ ...(role.app_access ?? {}) });
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    setName(role.name);
    setDesc(role.description ?? "");
    setPerms({ ...role.permissions });
    setAppAccess({ ...(role.app_access ?? {}) });
    setSaveMsg("");
  }, [role.id]);

  const handlePermToggle = (appKey, permKey, value) => {
    setPerms((prev) => ({
      ...prev,
      [appKey]: { ...(prev[appKey] ?? {}), [permKey]: value },
    }));
  };

  const handleAccessToggle = (appKey, value) => {
    setAppAccess((prev) => ({ ...prev, [appKey]: value }));
  };

  const handleSave = () => {
    setSaveMsg("");
    updateRole.mutate(
      { roleId: role.id, name, description: desc, permissions: perms, app_access: appAccess },
      {
        onSuccess: () => setSaveMsg("Saved!"),
        onError: (err) => {
          setSaveMsg(err?.response?.data?.detail ?? "Save failed.");
        },
      },
    );
  };

  const isSystem = role.is_system;
  const regApps = registry?.apps ?? {};
  const regPerms = registry?.permissions ?? {};

  // "workspace" group has no app_access gate — show it separately.
  const workspacePermDefs = regPerms.workspace ?? {};
  // All other apps
  const productApps = Object.keys(regApps);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="p-5 border-b space-y-3">
        <div>
          <Label htmlFor="role-name" className="text-xs">Role name</Label>
          <Input
            id="role-name"
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSystem}
          />
        </div>
        <div>
          <Label htmlFor="role-desc" className="text-xs">Description</Label>
          <textarea
            id="role-desc"
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            disabled={isSystem}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {/* Workspace permissions — always-on group */}
        {Object.keys(workspacePermDefs).length > 0 && (
          <WorkspaceSection
            permDefs={workspacePermDefs}
            perms={perms}
            onPermToggle={handlePermToggle}
            disabled={isSystem}
          />
        )}

        {/* Product apps — each gated by app_access */}
        {productApps.map((appKey) => (
          <AppSection
            key={appKey}
            appKey={appKey}
            appMeta={regApps[appKey]}
            permDefs={regPerms[appKey] ?? {}}
            appAccess={appAccess}
            perms={perms}
            onAccessToggle={handleAccessToggle}
            onPermToggle={handlePermToggle}
            disabled={isSystem}
          />
        ))}

        <PermissionPreview perms={perms} appAccess={appAccess} registry={registry} />
      </div>

      {!isSystem && (
        <div className="p-4 border-t flex items-center gap-3">
          <Button size="sm" onClick={handleSave} disabled={updateRole.isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {updateRole.isPending ? "Saving…" : "Save role"}
          </Button>
          {saveMsg && (
            <span className={cn(
              "text-sm",
              saveMsg === "Saved!" ? "text-green-600" : "text-destructive",
            )}>
              {saveMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Roles Section ─────────────────────────────────────────────────────────────
export default function RolesSection({ workspaceId, isAdmin, onOpenPermissionsRef }) {
  const { data: roles = [], isLoading } = useRoles(workspaceId);
  const { data: registry } = usePermissions(workspaceId);
  const createRole = useCreateRole(workspaceId);
  const deleteRole = useDeleteRole(workspaceId);

  const [selectedId, setSelectedId] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  const selectedRole = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  const handleCreate = () => {
    // Build a default permissions structure from the registry with all false
    const regPerms = registry?.permissions ?? {};
    const defaultPerms = Object.fromEntries(
      Object.entries(regPerms).map(([appKey, perms]) => [
        appKey,
        Object.fromEntries(Object.keys(perms).map((k) => [k, false])),
      ]),
    );
    const regApps = registry?.apps ?? {};
    const defaultAccess = Object.fromEntries(
      Object.keys(regApps).map((k) => [k, true]),
    );

    createRole.mutate(
      {
        name: "New Role",
        description: "",
        permissions: defaultPerms,
        app_access: defaultAccess,
      },
      { onSuccess: (r) => setSelectedId(r.id) },
    );
  };

  const handleDuplicate = (role) => {
    createRole.mutate(
      {
        name: `Copy of ${role.name}`,
        description: role.description,
        permissions: { ...role.permissions },
        app_access: { ...(role.app_access ?? {}) },
      },
      { onSuccess: (r) => setSelectedId(r.id) },
    );
  };

  const handleDelete = (role) => {
    setDeleteError("");
    deleteRole.mutate(role.id, {
      onSuccess: () => setSelectedId(null),
      onError: (err) =>
        setDeleteError(err?.response?.data?.detail ?? "Delete failed."),
    });
  };

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">Roles & Permissions</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage custom roles and their permission sets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShortcutTooltip label="View all permissions" shortcut="R" side="bottom">
            <Button
              size="sm"
              variant="ghost"
              onClick={onOpenPermissionsRef}
              className="text-xs text-muted-foreground gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              View all permissions
            </Button>
          </ShortcutTooltip>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={handleCreate} disabled={createRole.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New role
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex min-h-[420px]" style={{ maxHeight: 600 }}>
          {/* Left — role list */}
          <div className="w-56 border-r flex flex-col overflow-y-auto flex-shrink-0">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => { setSelectedId(role.id); setDeleteError(""); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors border-b border-border/40 last:border-0",
                  (selectedRole?.id === role.id)
                    ? "bg-primary/8 text-primary font-medium"
                    : "hover:bg-accent/60 text-foreground",
                )}
              >
                {role.is_system
                  ? <Lock className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  : <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                }
                <span className="flex-1 truncate">{role.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                  {role.member_count}
                </span>
              </button>
            ))}
          </div>

          {/* Right — role editor */}
          {selectedRole ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  {selectedRole.is_system && (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  {selectedRole.name}
                  {selectedRole.is_system && (
                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-1">system</span>
                  )}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(selectedRole)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Duplicate role"
                    disabled={createRole.isPending}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {isAdmin && !selectedRole.is_system && (
                    <button
                      onClick={() => handleDelete(selectedRole)}
                      disabled={selectedRole.member_count > 0 || deleteRole.isPending}
                      title={
                        selectedRole.member_count > 0
                          ? "Remove all assigned members first"
                          : "Delete role"
                      }
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {deleteError && (
                <p className="px-4 py-2 text-xs text-destructive bg-destructive/5">{deleteError}</p>
              )}
              <RoleEditor
                key={selectedRole.id}
                role={selectedRole}
                workspaceId={workspaceId}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Select a role to edit
            </div>
          )}
        </div>
      )}
    </div>
  );
}
