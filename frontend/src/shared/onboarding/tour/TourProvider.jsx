/**
 * TourProvider — drives a click-through product tour with driver.js. Mounted
 * once inside AppLayout so it survives route changes.
 *
 * Behaviour:
 *  - Opt-in: nothing auto-starts. `startTour(appKey)` (from the welcome modal or
 *    the checklist "Start guided tour" button) begins at step 1 and always
 *    walks every step (full walkthrough, even completed ones).
 *  - Self-paced: each step spotlights a real control; the user clicks "Next" to
 *    move on. No action is required to moveNext — it's a walkthrough, not a task.
 *  - Cross-page: steps can live on different routes; the provider navigates and
 *    waits for the anchor to mount before highlighting.
 */
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
function waitForElement(selector, timeout = 6000) {
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

export function TourProvider({ children }) {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const driverRef = useRef(null);
  const stepRef = useRef(0);
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
        allowClose: true,
        smoothScroll: true,
        animate: true,
      });
    }
    return driverRef.current;
  }, []);

  const endTour = useCallback(() => {
    driverRef.current?.destroy();
    driverRef.current = null;
    setActiveApp(null);
  }, []);

  const moveNext = useCallback(() => {
    const tour = TOUR_REGISTRY[activeApp];
    if (!tour) return;
    const next = stepRef.current + 1;
    if (next >= tour.steps.length) {
      endTour();
      return;
    }
    stepRef.current = next;
    setStepIndex(next);
  }, [activeApp, endTour]);

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

    (async () => {
      const ctx = resolveCtx();
      // if step has dependency and it's not present in the context, skip to the next step
      if (step.requiresBoard && !ctx.boardId) {
        moveNext();
        return;
      }

      // Already true (e.g. sidebar already expanded) — nothing to demo here.
      if (step.skipIfPresent && document.querySelector(step.skipIfPresent)) {
        moveNext();
        return;
      }

      const route = step.route(workspaceId, ctx);
      if (window.location.pathname !== route) navigate(route);

      const el = await waitForElement(step.anchor);
      if (cancelled) return;
      if (!el) {
        moveNext();
        return;
      }

      const isLast = stepIndex === tour.steps.length - 1;
      ensureDriver().highlight({
        element: el,
        popover: {
          title: step.title,
          description: step.body,
          showButtons: ["next", "close"],
          showProgress: true,
          progressText: `Step ${stepIndex + 1} of ${tour.steps.length}`,
          nextBtnText: isLast ? "Finish" : "Next",
          onNextClick: () => moveNext(),
          onCloseClick: () => endTour(),
        },
      });

      if (step.watchFor) {
        watchId = setInterval(() => {
          if (document.querySelector(step.watchFor)) {
            clearInterval(watchId);
            moveNext();
          }
        }, 200);
      }
    })();

    return () => {
      cancelled = true;
      if (watchId) clearInterval(watchId);
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
