import { useState } from "react";
import { X, Search, Shield } from "lucide-react";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { APP_DEFS } from "@/shared/lib/navLinks";

const _appDefByKey = Object.fromEntries(APP_DEFS.map((a) => [a.key, a]));

export default function PermissionsReferenceModal({ workspaceId, onClose }) {
  const { data: registry, isLoading } = usePermissions(workspaceId);
  const [search, setSearch] = useState("");

  const apps = registry?.apps ?? {};
  const permissions = registry?.permissions ?? {};

  // Build groups from the two-level registry: [{appKey, appLabel, entries: [{key, label}]}]
  const groups = Object.entries(permissions).map(([appKey, perms]) => {
    const appDef = _appDefByKey[appKey];
    const appMeta = apps[appKey];
    return {
      appKey,
      label: appMeta?.name ?? appDef?.label ?? appKey,
      icon: appDef?.icon,
      colors: appDef?.colors,
      entries: Object.entries(perms).map(([key, def]) => ({ key, label: def.label ?? key })),
    };
  });

  // Add workspace group (it has no app registry entry, only permissions)
  // It's already included since permissions["workspace"] exists in the registry.

  const totalCount = groups.reduce((n, g) => n + g.entries.length, 0);

  const q = search.toLowerCase().trim();
  const filteredGroups = q
    ? groups
        .map((g) => ({
          ...g,
          entries: g.entries.filter(
            (e) => e.key.toLowerCase().includes(q) || e.label.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.entries.length > 0)
    : groups;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-2xl max-h-[82vh] flex flex-col rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <p className="font-semibold text-sm">Permission Reference</p>
              <p className="text-xs text-muted-foreground">
                All available permissions and what they control
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              autoFocus
              type="text"
              placeholder="Search permissions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border bg-background outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading permissions…</p>
          ) : totalCount === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No permissions found.</p>
          ) : filteredGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No permissions match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            filteredGroups.map((group) => {
              const Icon = group.icon;
              return (
                <div key={group.appKey}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 mb-2">
                    {Icon && group.colors && (
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${group.colors.bg}`}>
                        <Icon className={`w-3 h-3 ${group.colors.text}`} />
                      </div>
                    )}
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                  </div>

                  <div className="rounded-md border bg-background divide-y">
                    {group.entries.map(({ key, label }) => (
                      <div key={key} className="px-3 py-3 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-tight">{label}</p>
                        </div>
                        <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono flex-shrink-0 mt-0.5 whitespace-nowrap">
                          {key}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t bg-muted/30 rounded-b-xl flex-shrink-0">
          <p className="text-xs text-muted-foreground">
            {totalCount} permission{totalCount !== 1 ? "s" : ""} across{" "}
            {groups.length} group{groups.length !== 1 ? "s" : ""}
            {q && filteredGroups.length !== groups.length && (
              <span className="ml-1">
                · showing {filteredGroups.reduce((n, g) => n + g.entries.length, 0)} results
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
