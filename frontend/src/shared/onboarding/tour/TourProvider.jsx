import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour.css";
import { TOUR_REGISTRY } from "./tourSteps";

const TourContext = createContext(null);

export const useTour = () => useContext(TourContext);

// Poll for an element that may not be in the DOM yet (route just changed).
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const started = Date.now();
    const id = setInterval(() => {
      const el = document.querySelector(selector);
      if (el || Date.now() - started > timeout) {
        clearInterval(id);
        resolve(el || null);
      }
    }, 120);
  });
}

// Steps anchor the field's wrapping <div> (label + input), not the input
// itself, so dig out the actual control to read/flash it.
function findField(anchorEl) {
  return anchorEl.querySelector("input, textarea, select") || anchorEl;
}

function flashInvalid(el) {
  if (!el) return;
  el.classList.remove("jcn-tour-shake");
  // eslint-disable-next-line no-unused-expressions -- restart the animation
  el.offsetWidth;
  el.classList.add("jcn-tour-shake");
}

export function TourProvider({ children }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const driverRef = useRef(null);
  const stepRef = useRef(0);
  // Which way the effect below should recover if a step's anchor never
  // shows up: skip the rest of the group going forward, or step back one
  // more going backward. Set by whichever nav action last fired.
  const directionRef = useRef("forward");
  const [activeApp, setActiveApp] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);

  const ensureDriver = useCallback(() => {
    if (!driverRef.current) {
      driverRef.current = driver({
        popoverClass: "jcn-tour",
        overlayColor: "#0b0b0f",
        overlayOpacity: 0.6,
        stagePadding: 6,
        stageRadius: 8,
        // Blocks clicking the backdrop (sidebar links, anything outside the spotlighted control) or pressing Escape from dismissing the tour — the popover's own "Close" button is the only sanctioned way out.
        allowClose: false,
        // Arrow keys otherwise drive driver.js's own internal step index directly, bypassing our stepRef/stepIndex state and desyncing the tour.
        allowKeyboardControl: false,
        allowScroll: false,
        smoothScroll: true,
        animate: true,
        // driver.js renders "close" as a "×" pinned to the popover's top-right corner. Relocate it into the footer, beside Next, so it reads as a normal secondary action.
        onPopoverRender: (popover) => {
          popover.closeButton.textContent = "Skip tour";
          popover.footerButtons.insertBefore(
            popover.closeButton,
            popover.nextButton,
          );
        },
      });
    }
    return driverRef.current;
  }, []);

  const endTour = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
    setActiveApp(null);
  }, []);

  const advanceSteps = useCallback(
    (count) => {
      const tour = TOUR_REGISTRY[activeApp];
      if (!tour) return;
      const next = stepRef.current + count;
      if (next >= tour.steps.length) {
        endTour();
        return;
      }
      directionRef.current = "forward";
      stepRef.current = next;
      setStepIndex(next);
    },
    [activeApp, endTour],
  );

  const moveNext = useCallback(() => advanceSteps(1), [advanceSteps]);

  // Step back one — the anchor from a step already visited may be gone
  // (its modal closed, its form submitted), so retreatStep below keeps
  // walking backward past dead steps instead of getting stuck on one.
  const retreatStep = useCallback(() => {
    if (stepRef.current === 0) return;
    directionRef.current = "backward";
    const prev = stepRef.current - 1;
    stepRef.current = prev;
    setStepIndex(prev);
  }, []);

  const movePrevious = useCallback(() => retreatStep(), [retreatStep]);

  // Abandonment path: the current step (or its whole modal/flow) is no
  // longer reachable — e.g. the user cancelled the form, hit Enter and
  // submitted early, or the anchor never showed up. Jump past every
  // remaining step that shares this step's `group` in one go instead of
  // limping forward one dead step at a time, each eating its own timeout.
  const skipGroup = useCallback(() => {
    const tour = TOUR_REGISTRY[activeApp];
    if (!tour) return;
    const group = tour.steps[stepRef.current]?.group;
    if (!group) {
      advanceSteps(1);
      return;
    }
    let i = stepRef.current + 1;
    while (i < tour.steps.length && tour.steps[i].group === group) i++;
    advanceSteps(i - stepRef.current);
  }, [activeApp, advanceSteps]);

  const startTour = useCallback((appKey) => {
    if (!TOUR_REGISTRY[appKey]) return;
    stepRef.current = 0;
    setStepIndex(0);
    setActiveApp(appKey);
  }, []);

  // Resolve runtime context a step's route may need (e.g. the board to open). BoardsPage populates ["portfolio", workspaceId] (via usePortfolio), not ["boards", workspaceId] — that's a separate, unused query key.
  const resolveCtx = useCallback(() => {
    const portfolio = qc.getQueryData(["portfolio", workspaceId]);
    const boardId =
      Array.isArray(portfolio) && portfolio[0] ? portfolio[0].id : null;
    return { boardId };
  }, [qc, workspaceId]);

  // Show the current step: navigate, wait for the anchor, then highlight.
  useEffect(() => {
    if (!activeApp) return;
    const tour = TOUR_REGISTRY[activeApp];
    const step = tour.steps[stepIndex];
    if (!step) return;
    let cancelled = false;
    let watchId = null;
    let presenceId = null;

    (async () => {
      const ctx = resolveCtx();
      // if step has dependency and it's not present in the context, skip the whole group
      if (step.requiresBoard && !ctx.boardId) {
        skipGroup();
        return;
      }

      // Already true (e.g. sidebar already expanded) — nothing to demo here.
      if (step.skipIfPresent && document.querySelector(step.skipIfPresent)) {
        skipGroup();
        return;
      }

      const route = step.route(workspaceId, ctx);
      if (window.location.pathname !== route) navigate(route);

      const el = await waitForElement(step.anchor);
      if (cancelled) return;
      if (!el) {
        // Going backward, a dead anchor means that step's modal/flow has
        // since closed — keep stepping back instead of skipping forward.
        if (directionRef.current === "backward") retreatStep();
        else skipGroup();
        return;
      }

      const isLast = stepIndex === tour.steps.length - 1;
      const buttons = ["next", "close"];
      if (stepIndex > 0) buttons.unshift("previous");
      ensureDriver().highlight({
        element: el,
        // Purely descriptive steps (no watchFor, nothing this step wants the user to click) shouldn't let a stray click on the real control fire an unrelated action — e.g. navigating away or opening a form this step never accounts for.
        disableActiveInteraction: !!step.disableActiveInteraction,
        popover: {
          title: step.title,
          description: step.body,
          showButtons: buttons,
          showProgress: true,
          progressText: `Step ${stepIndex + 1} of ${tour.steps.length}`,
          nextBtnText: isLast ? "Finish" : "Next",
          onNextClick: () => {
            if (step.requiresValue) {
              const field = findField(el);
              if (!field.value?.trim()) {
                field.focus?.();
                flashInvalid(field);
                return;
              }
            }
            moveNext();
          },
          onPrevClick: () => movePrevious(),
          onCloseClick: () => endTour(),
        },
      });

      if (step.watchFor) {
        watchId = setInterval(() => {
          if (cancelled) return;
          if (document.querySelector(step.watchFor)) {
            clearInterval(watchId);
            if (presenceId) clearInterval(presenceId);
            moveNext();
          }
        }, 200);
      }

      // The highlighted control can vanish without a Next click — e.g. the user hits Enter inside a modal field (submits and closes it), clicks Cancel, or hits Escape. Once that happens there's nothing left to point at, so bail out of the whole group automatically instead of leaving the popover stuck on a removed element.
      presenceId = setInterval(() => {
        if (cancelled) return;
        if (!document.body.contains(el)) {
          clearInterval(presenceId);
          if (watchId) clearInterval(watchId);
          skipGroup();
        }
      }, 200);
    })();

    return () => {
      cancelled = true;
      if (watchId) clearInterval(watchId);
      if (presenceId) clearInterval(presenceId);
    };
  }, [activeApp, stepIndex]);

  // Clean up if the provider unmounts mid-tour.
  useEffect(() => () => driverRef.current?.destroy(), []);

  return (
    <TourContext.Provider value={{ startTour, endTour, isRunning: !!activeApp }}>
      {children}
    </TourContext.Provider>
  );
}
