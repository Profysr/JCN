import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { useOrgChart } from "@/apps/org-structure/hooks/useOrg";
import { ONBOARDING_STATUS, PROFILE_STATUS_CONFIG } from "@/apps/org-structure/constants";

function StatusBadge({ status }) {
  const cfg = PROFILE_STATUS_CONFIG[status] ?? { label: "Unknown", className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold", cfg.className)}>
      {cfg.label}
    </span>
  );
}

export default function PeopleDirectoryPage() {
  const { workspaceId } = useParams();
  const { data, isLoading } = useOrgChart(workspaceId);
  const nodes = data?.nodes ?? [];

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Build unique dept/team lists for filters
  const { allDepts, allTeams } = useMemo(() => {
    const depts = new Map();
    const teams = new Map();
    nodes.forEach((n) => {
      n.departments?.forEach((d) => depts.set(d.id, d.name));
      n.teams?.forEach((t) => teams.set(t.id, t.name));
    });
    return {
      allDepts: Array.from(depts.entries()).map(([id, name]) => ({ id, name })),
      allTeams: Array.from(teams.entries()).map(([id, name]) => ({ id, name })),
    };
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return nodes.filter((n) => {
      if (q && !n.name?.toLowerCase().includes(q) && !n.email?.toLowerCase().includes(q) && !n.job_title?.toLowerCase().includes(q)) return false;
      if (deptFilter && !n.departments?.some((d) => d.id === deptFilter)) return false;
      if (teamFilter && !n.teams?.some((t) => t.id === teamFilter)) return false;
      if (statusFilter && n.onboarding_status !== statusFilter) return false;
      return true;
    });
  }, [nodes, search, deptFilter, teamFilter, statusFilter]);

  const activeFilterCount = [deptFilter, teamFilter, statusFilter].filter(Boolean).length;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {nodes.length} member{nodes.length !== 1 ? "s" : ""} in this workspace
        </p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or title…"
            className="pl-9"
          />
        </div>

        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
        >
          <option value="">All Departments</option>
          {allDepts.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
        >
          <option value="">All Teams</option>
          {allTeams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
        >
          <option value="">All Statuses</option>
          <option value={ONBOARDING_STATUS.APPROVED}>Active</option>
          <option value={ONBOARDING_STATUS.SUBMITTED}>Pending</option>
          <option value={ONBOARDING_STATUS.DRAFT}>Incomplete</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            onClick={() => { setDeptFilter(""); setTeamFilter(""); setStatusFilter(""); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {isLoading && <Loader className="h-48" />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          illustration="members"
          title="No people found"
          description={search || activeFilterCount ? "Try adjusting your search or filters." : "Invite members to see them here."}
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-md border border-border overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Name</div>
            <div>Job Title</div>
            <div>Departments</div>
            <div>Teams</div>
            <div>Status</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {filtered.map((node) => (
              <div key={node.id} className="relative grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors group/row">
                {/* Cover link — fills the entire row */}
                <Link
                  to={`/w/${workspaceId}/people/${node.id}`}
                  className="absolute inset-0"
                  aria-label={`View profile of ${node.name || node.email}`}
                />

                {/* Name */}
                <div className="relative flex items-center gap-3 min-w-0">
                  <Avatar user={node} name={node.name || node.email} size="sm" className="flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover/row:text-primary transition-colors">{node.name || node.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{node.email}</p>
                  </div>
                </div>

                {/* Job title */}
                <div className="relative text-sm text-muted-foreground truncate">
                  {node.job_title ?? <span className="text-muted-foreground/40 italic">—</span>}
                </div>

                {/* Departments */}
                <div className="relative flex flex-wrap gap-1">
                  {node.departments?.length > 0
                    ? node.departments.map((d) => (
                        <span key={d.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                          {d.name}
                        </span>
                      ))
                    : <span className="text-muted-foreground/40 italic text-xs">—</span>
                  }
                </div>

                {/* Teams */}
                <div className="relative flex flex-wrap gap-1">
                  {node.teams?.length > 0
                    ? node.teams.map((t) => (
                        <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                          {t.name}
                        </span>
                      ))
                    : <span className="text-muted-foreground/40 italic text-xs">—</span>
                  }
                </div>

                {/* Status */}
                <div className="relative">
                  <StatusBadge status={node.onboarding_status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
