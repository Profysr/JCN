import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useProjects } from "@/hooks/useProjects";
import api from "@/lib/api";
import { FolderKanban, Users, CheckSquare, Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROJECT_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#22c55e",
  "#3b82f6", "#8b5cf6", "#14b8a6", "#ef4444",
];

export default function DashboardPage() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: projects = [] } = useProjects(workspaceSlug);
  const { data: members = [] } = useQuery({
    queryKey: ["workspace-members", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/members/`).then((r) => r.data.results || r.data),
  });

  const totalTasks = projects.reduce((sum, p) => sum + (p.task_count || 0), 0);

  const stats = [
    {
      label: "Projects",
      value: projects.length,
      icon: FolderKanban,
      iconColor: "text-indigo-600",
      iconBg: "bg-indigo-50",
    },
    {
      label: "Total Tasks",
      value: totalTasks,
      icon: CheckSquare,
      iconColor: "text-violet-600",
      iconBg: "bg-violet-50",
    },
    {
      label: "Members",
      value: members.length,
      icon: Users,
      iconColor: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
  ];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {user?.display_name?.split(" ")[0]}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Here's what's happening in your workspace.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border bg-card p-5 flex items-center gap-4 shadow-card"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${stat.iconBg}`}>
                <Icon className={`w-6 h-6 ${stat.iconColor}`} />
              </div>
              <div>
                <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Projects */}
      {projects.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center shadow-card">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-7 h-7" />
          </div>
          <p className="font-semibold text-lg">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Create your first project to start tracking work.
          </p>
          <Button onClick={() => navigate(`/w/${workspaceSlug}/projects`)}>
            <Plus className="w-4 h-4 mr-1.5" /> Create Project
          </Button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Projects</h2>
            <button
              onClick={() => navigate(`/w/${workspaceSlug}/projects`)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.slice(0, 6).map((project) => {
              const color = PROJECT_COLORS[project.name.charCodeAt(0) % PROJECT_COLORS.length];
              const doneTasks = project.done_task_count || 0;
              const pct = project.task_count > 0
                ? Math.round((doneTasks / project.task_count) * 100)
                : 0;
              return (
                <button
                  key={project.id}
                  onClick={() => navigate(`/w/${workspaceSlug}/projects/${project.id}`)}
                  className="text-left rounded-xl border bg-card p-4 hover:shadow-card-hover hover:border-primary/30 transition-all duration-200 group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shadow-sm"
                      style={{ backgroundColor: color }}
                    >
                      {project.name[0].toUpperCase()}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="font-semibold text-sm truncate">{project.name}</p>
                  {project.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{project.task_count} tasks</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
