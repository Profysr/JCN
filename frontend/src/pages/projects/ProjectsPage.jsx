import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import CreateProjectModal from "@/components/projects/CreateProjectModal";
import { FolderKanban, Plus, ArrowRight } from "lucide-react";
import { APP_COLORS as PROJECT_COLORS } from "@/lib/constants";

export default function ProjectsPage() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const { data: projects, isLoading } = useProjects(workspaceSlug);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {projects?.length ?? 0} project{projects?.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Project
        </Button>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm">Loading…</div>
      )}

      {!isLoading && projects?.length === 0 && (
        <div className="rounded-xl border bg-card p-16 text-center shadow-card">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
            <FolderKanban className="w-7 h-7" />
          </div>
          <p className="font-semibold text-lg">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-5">
            Create a project to start tracking work.
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Project
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects?.map((project) => {
          const color = PROJECT_COLORS[project.name.charCodeAt(0) % PROJECT_COLORS.length];
          const doneTasks = project.done_task_count || 0;
          const pct = project.task_count > 0
            ? Math.round((doneTasks / project.task_count) * 100)
            : 0;

          return (
            <button
              key={project.id}
              onClick={() => navigate(`/w/${workspaceSlug}/projects/${project.id}`)}
              className="text-left rounded-xl border bg-card p-5 hover:shadow-card-hover hover:border-primary/30 transition-all duration-200 group shadow-card"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shadow-sm"
                  style={{ backgroundColor: color }}
                >
                  {project.name[0].toUpperCase()}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
              </div>
              <p className="font-semibold truncate">{project.name}</p>
              {project.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {project.description}
                </p>
              )}
              <div className="mt-4">
                {project.task_count > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{project.task_count} tasks</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tasks yet</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <CreateProjectModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
