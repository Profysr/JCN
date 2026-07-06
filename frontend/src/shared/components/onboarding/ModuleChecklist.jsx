/**
 * ModuleChecklist — shared base component for per-module getting-started
 * checklists.
 *
 * Items are read-only status rows: completion is computed server-side and
 * ticks as the user does the work. Each incomplete item can carry its own
 * `action`/`cta` deep link (e.g. "Create board" -> boards page) alongside a
 * "Start guided tour" button that (re)runs the app's interactive walkthrough.
 * Minimize + dismiss are persisted per user (module_minimize / module_dismiss)
 * so they survive reloads.
 *
 * Usage (in each app module):
 *   const ITEMS = [{ key, label, desc, action?, cta?, future? }, ...]
 *   <ModuleChecklist moduleKey="projects" items={ITEMS} />
 */

import {
  Check,
  X,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import {
  useOnboarding,
  useUpdateOnboarding,
} from "@/shared/hooks/useOnboarding";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { TOUR_REGISTRY } from "@/shared/onboarding/tour/tourSteps";
import { useTour } from "@/shared/onboarding/tour/TourProvider";
import { Tooltip } from "@/shared/components/ui/tooltip";

export default function ModuleChecklist({ moduleKey, items }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { data: onboarding } = useOnboarding(workspaceId);
  const updateOnboarding = useUpdateOnboarding(workspaceId);
  const { startTour } = useTour() || {};

  if (!onboarding || !onboarding.user_is_admin) return null;

  const moduleData = onboarding.checklists?.[moduleKey];
  if (!moduleData || moduleData.dismissed) return null;

  const collapsed = !!moduleData.minimized;
  const checklist = moduleData.items || {};
  const completedCount = items.filter((item) => checklist[item.key]).length;
  const allDone = completedCount === items.length;
  const progress = Math.round((completedCount / items.length) * 100);
  const hasTour = !!TOUR_REGISTRY[moduleKey];

  const toggleMinimize = () =>
    updateOnboarding.mutate({
      [collapsed ? "module_unminimize" : "module_minimize"]: moduleKey,
    });

  return (
    <div className="rounded-md border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <button
          onClick={toggleMinimize}
          className="flex items-center gap-2.5 flex-1 text-left"
        >
          <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Getting started</p>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{items.length} complete
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

          {/* Tour trigger — kept in the always-visible header so it's reachable while minimized, not just when the checklist is expanded. */}
          {hasTour && (
            <Tooltip content="Start guided tour">
              <button
                onClick={() => startTour?.(moduleKey)}
                className="text-muted-foreground hover:text-primary p-1 rounded transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}

          {/* Collapse / expand */}
          <button
            onClick={toggleMinimize}
            title={collapsed ? "Expand" : "Minimize — tackle later"}
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Dismiss permanently */}
          <button
            onClick={() =>
              updateOnboarding.mutate({ module_dismiss: moduleKey })
            }
            title="Dismiss permanently"
            className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="animate-slide-down">
          <div className="divide-y">
            {items.map((item) => {
              const done = !!checklist[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  {/* Checkbox */}
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      done
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {done && <Check className="w-3 h-3 text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        done && "line-through text-muted-foreground",
                      )}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>

                  {item.future && !done ? (
                    <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                      Soon
                    </span>
                  ) : (
                    item.action &&
                    !done && (
                      <button
                        onClick={() => item.action(navigate, workspaceId)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline flex-shrink-0"
                      >
                        {item.cta}
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>

          {allDone ? (
            <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-t text-center">
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                🎉 All done! You&apos;re all set up.
              </p>
            </div>
          ) : (
            <div className="px-5 py-3 border-t flex justify-center">
              <button
                onClick={() => startTour?.(moduleKey)}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 text-primary text-xs font-medium px-3 py-1.5 hover:bg-primary/15 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Start guided tour
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
