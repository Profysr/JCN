/**
 * AppOnboarding — full-page, guided first-run experience for a product app
 * (Projects, People & HR). Shown when the owner opens an app for the first time
 * from the App Launcher.
 *
 * Steps are the same items as the in-app `GettingStartedChecklist` and their
 * completion is computed server-side from real data (workspaces/checklist.py),
 * so they tick off automatically as the user does the work. Clicking a step
 * navigates into the app to perform it; "Skip"/"Finish" dismisses the module for
 * this user (module_dismiss) so we stop auto-routing here — the launcher still
 * shows a resumable "Set up" badge until every step is genuinely done.
 */
import { useParams, useNavigate } from "react-router-dom";
import { Check, ChevronRight, ArrowRight } from "lucide-react";
import {
  useOnboarding,
  useUpdateOnboarding,
} from "@/shared/hooks/useOnboarding";
import { APP_DEFS, workspaceUrl } from "@/shared/lib/navLinks";
import { Button } from "@/shared/components/ui/button";
import { Loader } from "@/shared/components/ui/Loader";
import { cn } from "@/shared/lib/utils";

const _defByKey = Object.fromEntries(APP_DEFS.map((a) => [a.key, a]));

export default function AppOnboarding({ appKey, items, subtitle, children }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { data: onboarding, isLoading } = useOnboarding(workspaceId);
  const updateOnboarding = useUpdateOnboarding(workspaceId);

  const def = _defByKey[appKey];
  const Icon = def?.icon;
  const goToApp = () =>
    navigate(workspaceUrl(workspaceId, def.landing), { replace: true });

  if (isLoading) return <Loader className="min-h-screen" size="lg" />;

  const completion = onboarding?.checklists?.[appKey]?.items || {};
  const doneCount = items.filter((it) => completion[it.key]).length;
  const allDone = doneCount === items.length;
  const progress = Math.round((doneCount / items.length) * 100);

  // Skip / finish: stop auto-routing into onboarding, then enter the app.
  const finish = () => {
    updateOnboarding.mutate({ module_dismiss: appKey });
    goToApp();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b">
        <div className="flex items-center gap-1">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
            J
          </div>
          <span className="font-semibold text-sm">CN</span>
        </div>
        <button
          onClick={finish}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {allDone ? "Done" : "Skip for now"}
        </button>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 py-12 overflow-auto">
        <div className="w-full max-w-2xl animate-fade-in">
          {/* Hero */}
          <div className="flex flex-col items-center text-center mb-8">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center mb-4",
                def?.colors.bg,
              )}
            >
              {Icon && <Icon className={cn("w-7 h-7", def?.colors.text)} />}
            </div>
            <h1 className="text-2xl font-bold">Set up {def?.label}</h1>
            <p className="text-muted-foreground text-sm mt-1 max-w-md">
              {subtitle ||
                "A few quick steps to get going — we'll tick them off as you go."}
            </p>
          </div>

          {/* Optional intro (e.g. team type for Projects) */}
          {children && <div className="mb-6">{children}</div>}

          {/* Progress */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
              {doneCount}/{items.length} done
            </span>
          </div>

          {/* Steps */}
          <div className="rounded-xl border bg-card divide-y shadow-sm overflow-hidden">
            {items.map((item) => {
              const done = !!completion[item.key];
              const interactive = !done && !item.future;
              return (
                <div
                  key={item.key}
                  role={interactive ? "button" : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  onClick={
                    interactive
                      ? () => item.action(navigate, workspaceId)
                      : undefined
                  }
                  className={cn(
                    "flex items-center gap-3 px-5 py-4 transition-colors",
                    done
                      ? "opacity-60"
                      : interactive
                        ? "hover:bg-accent/30 cursor-pointer group"
                        : "",
                  )}
                >
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
                        done && "line-through",
                      )}
                    >
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  {item.future ? (
                    <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5 flex-shrink-0">
                      Soon
                    </span>
                  ) : !done ? (
                    <span className="text-xs text-primary flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {item.cta} <ChevronRight className="w-3 h-3" />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex justify-center mt-8">
            <Button size="lg" onClick={finish}>
              {allDone ? (
                <>
                  Go to {def?.label} <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              ) : (
                <>
                  Continue to {def?.label}{" "}
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
