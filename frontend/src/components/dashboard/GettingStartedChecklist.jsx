import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, X, ChevronRight, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useOnboarding, useUpdateOnboarding } from "@/hooks/useOnboarding";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    key:    "create_project",
    label:  "Create your first project",
    desc:   "Set up a project and invite the team",
    action: (navigate, ws) => navigate(`/w/${ws}/projects`),
    cta:    "Create project",
  },
  {
    key:    "add_task",
    label:  "Add a task",
    desc:   "Break work into trackable pieces",
    action: (navigate, ws) => navigate(`/w/${ws}/projects`),
    cta:    "Go to projects",
  },
  {
    key:    "invite_teammate",
    label:  "Invite a teammate",
    desc:   "Collaboration is better together",
    action: (navigate, ws) => navigate(`/w/${ws}/members`),
    cta:    "Invite members",
  },
  {
    key:    "connect_github",
    label:  "Connect GitHub",
    desc:   "Link commits and PRs to tasks",
    action: (navigate, ws) => navigate(`/w/${ws}/settings/integrations`),
    cta:    "Connect",
    future: true,
  },
  {
    key:    "setup_automation",
    label:  "Set up an automation",
    desc:   "Automate repetitive work",
    action: (navigate, ws) => navigate(`/w/${ws}/projects`),
    cta:    "Explore automations",
    future: true,
  },
];

export default function GettingStartedChecklist() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const { data: onboarding } = useOnboarding(workspaceSlug);
  const updateOnboarding = useUpdateOnboarding(workspaceSlug);

  // Only workspace admins see the setup checklist.
  // Non-admins join an existing workspace — it's already configured.
  if (!onboarding || !onboarding.user_is_admin || onboarding.checklist_dismissed) return null;

  const checklist = onboarding.checklist || {};
  const completedCount = ITEMS.filter((item) => checklist[item.key]).length;
  const allDone = completedCount === ITEMS.length;
  const progress = Math.round((completedCount / ITEMS.length) * 100);

  return (
    <div className="rounded-xl border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2.5 flex-1 text-left"
        >
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Getting started</p>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{ITEMS.length} complete
            </p>
          </div>
        </button>
        <div className="flex items-center gap-1.5">
          {/* Progress bar */}
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden mr-1.5">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Collapse / expand */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand" : "Collapse — tackle later"}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            {collapsed
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronUp   className="w-3.5 h-3.5" />
            }
          </button>

          {/* Dismiss permanently */}
          <button
            onClick={() => updateOnboarding.mutate({ checklist_dismissed: true })}
            title="Dismiss permanently"
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items — hidden when collapsed */}
      {!collapsed && <div className="divide-y animate-slide-down">
        {ITEMS.map((item) => {
          const done = !!checklist[item.key];
          return (
            <div
              key={item.key}
              className={cn(
                "flex items-center gap-3 px-5 py-3.5 transition-colors",
                done ? "opacity-60" : "hover:bg-accent/30 cursor-pointer group"
              )}
              onClick={() => !done && !item.future && item.action(navigate, workspaceSlug)}
            >
              {/* Checkbox */}
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                done ? "border-primary bg-primary" : "border-muted-foreground/30"
              )}>
                {done && <Check className="w-3 h-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className={cn("text-sm font-medium", done && "line-through")}>{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>

              {!done && !item.future && (
                <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 flex-shrink-0">
                  {item.cta} <ChevronRight className="w-3 h-3" />
                </span>
              )}
              {item.future && !done && (
                <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                  Soon
                </span>
              )}
            </div>
          );
        })}

        {/* All done state */}
        {allDone && (
          <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-t text-center">
            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              🎉 All done! You're ready to ship.
            </p>
          </div>
        )}
      </div>}
    </div>
  );
}
