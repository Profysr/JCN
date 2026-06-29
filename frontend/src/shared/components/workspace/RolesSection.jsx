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
import { Loader } from "@/shared/components/ui/Loader";

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
const DRAFT_ID = "__new__";

function RoleEditor({ role, workspaceId, isDraft, onCreated }) {
  const updateRole = useUpdateRole(workspaceId);
  const createRole = useCreateRole(workspaceId);
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
    const payload = { name, description: desc, permissions: perms, app_access: appAccess };
    if (isDraft) {
      createRole.mutate(payload, {
        onSuccess: (r) => onCreated?.(r),
        onError: (err) => setSaveMsg(err?.response?.data?.detail ?? "Save failed."),
      });
    } else {
      updateRole.mutate({ roleId: role.id, ...payload }, {
        onSuccess: () => setSaveMsg("Saved!"),
        onError: (err) => setSaveMsg(err?.response?.data?.detail ?? "Save failed."),
      });
    }
  };

  const isPending = isDraft ? createRole.isPending : updateRole.isPending;
  const isSystem = role.is_system;
  const regApps = registry?.apps ?? {};
  const regPerms = registry?.permissions ?? {};
  const workspacePermDefs = regPerms.workspace ?? {};
  const productApps = Object.keys(regApps);

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Draft role — unsaved prompt */}
      {isDraft && (
        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-primary/5 border-b border-primary/20">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
          <p className="text-xs text-primary font-medium">
            Draft role — fill in the details and save to create it.
          </p>
        </div>
      )}

      {/* System role notice */}
      {isSystem && (
        <div className="flex items-center gap-2.5 px-5 py-2.5 bg-amber-50 dark:bg-amber-950/25 border-b border-amber-200/70 dark:border-amber-800/40">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            System role — built-in and cannot be modified.
          </p>
        </div>
      )}

      {/* Identity fields */}
      <div className="px-5 py-4 border-b bg-muted/20 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="role-name" className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              {isSystem && <Lock className="w-3 h-3" />}
              Role name
            </Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={isSystem}
              className={cn(
                "bg-background",
                isSystem && "cursor-default text-muted-foreground select-none focus:ring-0 focus-visible:ring-0",
              )}
            />
          </div>
          <div>
            <Label htmlFor="role-desc" className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              {isSystem && <Lock className="w-3 h-3" />}
              Description
            </Label>
            <textarea
              id="role-desc"
              rows={1}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              readOnly={isSystem}
              className={cn(
                "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring resize-none",
                isSystem && "cursor-default text-muted-foreground select-none focus:ring-0",
              )}
            />
          </div>
        </div>
      </div>

      {/* Permissions area */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-5 pt-4 pb-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Permissions
          </span>
          <div className="flex-1 h-px bg-border/50" />
        </div>

        <div className="px-5 pb-5 space-y-3">
          {Object.keys(workspacePermDefs).length > 0 && (
            <WorkspaceSection
              permDefs={workspacePermDefs}
              perms={perms}
              onPermToggle={handlePermToggle}
              disabled={isSystem}
            />
          )}

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
      </div>

      {!isSystem && (
        <div className="px-5 py-3 border-t bg-muted/10 flex items-center gap-3">
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {isPending ? "Saving…" : isDraft ? "Create role" : "Save role"}
          </Button>
          {saveMsg && (
            <span className={cn("text-xs", saveMsg === "Saved!" ? "text-emerald-600" : "text-destructive")}>
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
  const [draftRole, setDraftRole] = useState(null);
  const [deleteError, setDeleteError] = useState("");

  // Merge real roles with the local draft (if one exists)
  const displayRoles = draftRole ? [...roles, draftRole] : roles;
  const selectedRole = displayRoles.find((r) => r.id === selectedId) ?? displayRoles[0] ?? null;

  const handleCreate = () => {
    const regPerms = registry?.permissions ?? {};
    const defaultPerms = Object.fromEntries(
      Object.entries(regPerms).map(([appKey, perms]) => [
        appKey,
        Object.fromEntries(Object.keys(perms).map((k) => [k, false])),
      ]),
    );
    const defaultAccess = Object.fromEntries(
      Object.keys(registry?.apps ?? {}).map((k) => [k, true]),
    );
    setDraftRole({
      id: DRAFT_ID,
      name: "",
      description: "",
      permissions: defaultPerms,
      app_access: defaultAccess,
      is_system: false,
      member_count: 0,
    });
    setSelectedId(DRAFT_ID);
  };

  const handleDraftCreated = (newRole) => {
    setDraftRole(null);
    setSelectedId(newRole.id);
  };

  const handleDraftDiscard = () => {
    setDraftRole(null);
    setSelectedId(null);
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

  const hasDraft = !!draftRole;

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
            <ShortcutTooltip
              label={hasDraft ? "Save or discard the draft role first" : "Create a new role"}
              side="bottom"
              delayDuration={200}
            >
              <Button
                size="sm"
                variant="outline"
                onClick={handleCreate}
                disabled={hasDraft}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                New role
              </Button>
            </ShortcutTooltip>
          )}
        </div>
      </div>

      {isLoading ? (
        <Loader className="p-6" />
      ) : (
        <div className="flex flex-col min-h-[420px]" style={{ maxHeight: 620 }}>
          {/* Tab bar + inline actions */}
          <div className="flex items-stretch border-b">
            <div className="flex items-center gap-0.5 px-3 flex-1 overflow-x-auto">
              {displayRoles.map((role) => {
                const isActive = selectedRole?.id === role.id;
                const isDraftTab = role.id === DRAFT_ID;
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      setSelectedId(role.id);
                      setDeleteError("");
                      // Switching away from draft discards it
                      if (!isDraftTab && hasDraft) setDraftRole(null);
                    }}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px",
                      isActive
                        ? isDraftTab
                          ? "border-amber-400 text-amber-600 font-medium"
                          : "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border/60",
                    )}
                  >
                    {isDraftTab
                      ? <span className="w-2 h-2 rounded-full border-2 border-current opacity-70 flex-shrink-0" />
                      : role.is_system
                        ? <Lock className="w-3 h-3 flex-shrink-0 opacity-60" />
                        : <ShieldCheck className="w-3 h-3 flex-shrink-0 opacity-60" />
                    }
                    {isDraftTab ? (role.name || "New role") : role.name}
                    {isDraftTab && (
                      <span className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded px-1 py-0.5 leading-none">
                        draft
                      </span>
                    )}
                    {!isDraftTab && role.member_count > 0 && (
                      <span className={cn(
                        "text-[10px] rounded-full px-1.5 py-0.5 leading-none font-medium",
                        isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {role.member_count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Actions — scoped to the selected role */}
            {selectedRole && (
              <div className="flex items-center gap-0.5 px-3 border-l flex-shrink-0">
                {selectedRole.id === DRAFT_ID ? (
                  <ShortcutTooltip label="Discard draft" side="bottom" delayDuration={400}>
                    <button
                      onClick={handleDraftDiscard}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </ShortcutTooltip>
                ) : (
                  <>
                    <ShortcutTooltip label="Duplicate role" side="bottom" delayDuration={400}>
                      <button
                        onClick={() => handleDuplicate(selectedRole)}
                        disabled={createRole.isPending}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-40"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </ShortcutTooltip>
                    {isAdmin && !selectedRole.is_system && (
                      <ShortcutTooltip
                        label={selectedRole.member_count > 0 ? "Remove all members first" : "Delete role"}
                        side="bottom"
                        delayDuration={400}
                      >
                        <button
                          onClick={() => handleDelete(selectedRole)}
                          disabled={selectedRole.member_count > 0 || deleteRole.isPending}
                          className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </ShortcutTooltip>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {deleteError && (
            <p className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b">{deleteError}</p>
          )}

          {/* Editor */}
          {selectedRole ? (
            <RoleEditor
              key={selectedRole.id}
              role={selectedRole}
              workspaceId={workspaceId}
              isDraft={selectedRole.id === DRAFT_ID}
              onCreated={handleDraftCreated}
            />
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
