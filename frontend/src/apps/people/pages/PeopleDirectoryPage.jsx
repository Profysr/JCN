import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Search,
  ChevronDown,
  ChevronRight,
  Users2,
  List,
  Users,
  Network,
} from "lucide-react";
import { Input } from "@/shared/components/ui/input";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Avatar } from "@/shared/components/ui/avatar";
import Modal from "@/shared/components/ui/Modal";
import { Chip } from "@/shared/components/ui/SectionCard";
import {
  Tabs,
  TabsUnderlineList,
  TabsUnderlineTrigger,
} from "@/shared/components/ui/Tabs";
import { cn } from "@/shared/lib/utils";
import { useOrgChart } from "@/apps/people/hooks/useOrg";
import EmployeeCard from "@/apps/people/components/EmployeeCard";
import OrgChartPage from "@/apps/people/pages/OrgChartPage";

const SORT_OPTIONS = [
  { value: "name_asc", label: "First name (A – Z)" },
  { value: "name_desc", label: "First name (Z – A)" },
  { value: "title_asc", label: "Job title (A – Z)" },
];

function sortNodes(nodes, sortBy) {
  const sorted = [...nodes];
  sorted.sort((a, b) => {
    if (sortBy === "title_asc") {
      return (a.job_title ?? "").localeCompare(b.job_title ?? "");
    }
    const cmp = (a.name || a.email || "").localeCompare(b.name || b.email || "");
    return sortBy === "name_desc" ? -cmp : cmp;
  });
  return sorted;
}

// ── Team section (Teams View) ────────────────────────────────────────────────
function TeamSection({ team, members, onQuickView }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 mb-3 group"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">{team.name}</h3>
        <span className="text-xs text-muted-foreground">({members.length})</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((node) => (
            <EmployeeCard key={`${team.id}-${node.id}`} node={node} onQuickView={onQuickView} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quick view modal ─────────────────────────────────────────────────────────
function QuickViewModal({ node, workspaceId, onClose }) {
  return (
    <Modal
      isOpen={!!node}
      onClose={onClose}
      title="Quick view"
      showFooter={false}
    >
      {node && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar user={node} name={node.name || node.email} size="xl" />
            <div className="min-w-0">
              <p className="font-semibold truncate">{node.name || node.email}</p>
              <p className="text-sm text-muted-foreground truncate">{node.email}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {node.job_title ?? "No job title set"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {node.departments?.map((d) => (
              <Chip key={d.id} label={d.name} className="bg-muted text-muted-foreground" />
            ))}
            {node.teams?.map((t) => (
              <Chip key={t.id} label={t.name} className="bg-primary/10 text-primary" />
            ))}
          </div>
          <Link
            to={`/w/${workspaceId}/people/${node.id}`}
            className="block text-sm text-primary hover:underline font-medium"
          >
            View full profile →
          </Link>
        </div>
      )}
    </Modal>
  );
}

// ── Employees tab ─────────────────────────────────────────────────────────────
function EmployeesTab({ workspaceId, nodes, isLoading }) {
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [view, setView] = useState("teams"); // "teams" | "list"
  const [quickViewNode, setQuickViewNode] = useState(null);

  const allDepts = useMemo(() => {
    const depts = new Map();
    nodes.forEach((n) => n.departments?.forEach((d) => depts.set(d.id, d.name)));
    return Array.from(depts.entries()).map(([id, name]) => ({ id, name }));
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const result = nodes.filter((n) => {
      if (
        q &&
        !n.name?.toLowerCase().includes(q) &&
        !n.email?.toLowerCase().includes(q) &&
        !n.job_title?.toLowerCase().includes(q)
      )
        return false;
      if (deptFilter && !n.departments?.some((d) => d.id === deptFilter)) return false;
      return true;
    });
    return sortNodes(result, sortBy);
  }, [nodes, search, deptFilter, sortBy]);

  const teamGroups = useMemo(() => {
    const groups = new Map();
    const unassigned = [];
    filtered.forEach((node) => {
      if (!node.teams?.length) {
        unassigned.push(node);
        return;
      }
      node.teams.forEach((t) => {
        if (!groups.has(t.id)) groups.set(t.id, { team: t, members: [] });
        groups.get(t.id).members.push(node);
      });
    });
    const sections = Array.from(groups.values()).sort((a, b) =>
      a.team.name.localeCompare(b.team.name),
    );
    if (unassigned.length) {
      sections.push({ team: { id: "__unassigned__", name: "Unassigned" }, members: unassigned });
    }
    return sections;
  }, [filtered]);

  return (
    <div>
      {/* Toolbar */}
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
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 ml-auto">
          <button
            onClick={() => setView("teams")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
              view === "teams"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users2 className="w-3.5 h-3.5" /> Teams View
          </button>
          <button
            onClick={() => setView("list")}
            className={cn(
              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
              view === "list"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <List className="w-3.5 h-3.5" /> List View
          </button>
        </div>
      </div>

      {isLoading && <Loader className="h-48" />}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          illustration="members"
          title="No people found"
          description={search || deptFilter ? "Try adjusting your search or filters." : "Invite members to see them here."}
        />
      )}

      {!isLoading && filtered.length > 0 && view === "teams" && (
        <div>
          {teamGroups.map((g) => (
            <TeamSection
              key={g.team.id}
              team={g.team}
              members={g.members}
              onQuickView={setQuickViewNode}
            />
          ))}
        </div>
      )}

      {!isLoading && filtered.length > 0 && view === "list" && (
        <div className="rounded-md border border-border overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-2.5 bg-muted/50 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>Name</div>
            <div>Job Title</div>
            <div>Departments</div>
            <div>Teams</div>
          </div>
          <div className="divide-y divide-border/40">
            {filtered.map((node) => (
              <div key={node.id} className="relative grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center hover:bg-accent/30 transition-colors group/row">
                <button
                  type="button"
                  onClick={() => setQuickViewNode(node)}
                  className="absolute inset-0"
                  aria-label={`Quick view of ${node.name || node.email}`}
                />
                <div className="relative flex items-center gap-3 min-w-0">
                  <Avatar user={node} name={node.name || node.email} size="sm" className="flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate group-hover/row:text-primary transition-colors">{node.name || node.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{node.email}</p>
                  </div>
                </div>
                <div className="relative text-sm text-muted-foreground truncate">
                  {node.job_title ?? <span className="text-muted-foreground/40 italic">—</span>}
                </div>
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
              </div>
            ))}
          </div>
        </div>
      )}

      <QuickViewModal
        node={quickViewNode}
        workspaceId={workspaceId}
        onClose={() => setQuickViewNode(null)}
      />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EmployeeHubPage() {
  const { workspaceId } = useParams();
  const { data, isLoading } = useOrgChart(workspaceId);
  const nodes = data?.nodes ?? [];
  const [tab, setTab] = useState("employees");

  return (
    <div className="p-8 h-full flex flex-col">
      <div className="mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Employee hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {nodes.length} member{nodes.length !== 1 ? "s" : ""} in this workspace
        </p>
      </div>

      <Tabs value={tab} onChange={setTab} className="flex-1 min-h-0 flex flex-col">
        <TabsUnderlineList className="flex-shrink-0 mb-6">
          <TabsUnderlineTrigger value="employees" icon={Users}>
            Employees
          </TabsUnderlineTrigger>
          <TabsUnderlineTrigger value="chart" icon={Network}>
            Organisational Chart
          </TabsUnderlineTrigger>
        </TabsUnderlineList>

        {tab === "employees" && (
          <EmployeesTab workspaceId={workspaceId} nodes={nodes} isLoading={isLoading} />
        )}
        {tab === "chart" && (
          <div className="flex-1 min-h-0 -mx-8 -mb-8 border-t border-border">
            <OrgChartPage />
          </div>
        )}
      </Tabs>
    </div>
  );
}
