/**
 * WelcomeModal — first-open greeting for an app that has a guided tour.
 *
 * Shows once per admin per app (tracked by the server `welcomed` flag): a
 * greeting, the getting-started checklist as read-only status, and a "Start
 * guided tour" button. Either action marks the app as welcomed so it won't
 * reappear. The tour itself is also re-runnable later from the checklist widget.
 */
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import Modal from "@/shared/components/ui/Modal";
import { cn } from "@/shared/lib/utils";
import {
  useOnboarding,
  useUpdateOnboarding,
} from "@/shared/hooks/useOnboarding";
import { TOUR_REGISTRY, APP_PARAM } from "./tourSteps";
import { useTour } from "./TourProvider";

export default function WelcomeModal() {
  const { workspaceId } = useParams();
  const [searchParams] = useSearchParams();
  const { data: onboarding } = useOnboarding(workspaceId);
  const updateOnboarding = useUpdateOnboarding(workspaceId);
  const { startTour, isRunning } = useTour() || {};
  const [open, setOpen] = useState(false);

  const appKey = searchParams.get(APP_PARAM);
  const tour = appKey ? TOUR_REGISTRY[appKey] : null;
  const module = appKey ? onboarding?.checklists?.[appKey] : null;
  const items = module?.items || {};
  const complete = tour && tour.steps.every((s) => items[s.key]);
  const shouldShow =
    !!tour &&
    !!onboarding?.user_is_admin &&
    !!module &&
    !complete &&
    !module.welcomed &&
    !module.dismissed &&
    !isRunning;

  // Open once when eligibility first becomes true.
  useEffect(() => {
    if (shouldShow) setOpen(true);
  }, [shouldShow]);

  if (!tour || !open) return null;

  const markWelcomed = () => {
    updateOnboarding.mutate({ module_welcome: appKey });
    setOpen(false);
  };

  const handleStartTour = () => {
    markWelcomed();
    startTour?.(appKey);
  };

  return (
    <Modal
      isOpen={open}
      onClose={markWelcomed}
      showHeader={false}
      showFooter={false}
      maxWidth="440px"
      padding="p-6"
    >
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          {tour.welcome.title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          {tour.welcome.body}
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-border divide-y">
        {tour.steps.map((step) => {
          const done = !!items[step.key];
          return (
            <div key={step.key} className="flex items-center gap-3 px-4 py-2.5">
              <div
                className={cn(
                  "w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                  done
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/30",
                )}
              >
                {done && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span
                className={cn(
                  "text-sm",
                  done
                    ? "text-muted-foreground line-through"
                    : "text-foreground",
                )}
              >
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={handleStartTour} className="w-full gap-1.5">
          <Sparkles className="w-4 h-4" />
          Start guided tour
        </Button>
        <Button variant="ghost" onClick={markWelcomed} className="w-full">
          Maybe later
        </Button>
      </div>
    </Modal>
  );
}
