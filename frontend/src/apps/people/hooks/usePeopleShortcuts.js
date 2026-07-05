import { useEffect } from "react";
import { useShortcutBindings } from "@/shared/hooks/useShortcutBindings";
import { isTypingTarget, matchesBinding } from "@/shared/lib/shortcutMatch";

/**
 * People app-only keyboard shortcuts — the "org" group in shortcutsRegistry.js.
 * Kept as small, page-scoped hooks (not a single global handler mounted for
 * the whole People app) because "n" / arrows / Enter would otherwise collide
 * with normal typing and form navigation on pages that don't want them.
 */

/**
 * "n" — open the create modal. Used by DepartmentsPage and TeamsPage, which
 * previously each hand-rolled the same window keydown listener.
 */
export function useCreateShortcut(onCreate, { disabled = false } = {}) {
  const bindings = useShortcutBindings();

  useEffect(() => {
    if (disabled) return;
    const handler = (e) => {
      if (isTypingTarget(e)) return;
      if (matchesBinding(e, bindings["org:create"])) {
        e.preventDefault();
        onCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, disabled, onCreate]);
}

/**
 * ← / → navigate pending profiles, Enter approves. Used by PendingProfileModal
 * only while it's open (this hook is only mounted then).
 */
export function useProfileReviewShortcuts({
  hasPrev,
  hasNext,
  isApproving,
  onPrev,
  onNext,
  onApprove,
}) {
  const bindings = useShortcutBindings();

  useEffect(() => {
    const handler = (e) => {
      if (matchesBinding(e, bindings["org:review-prev"]) && hasPrev) {
        onPrev();
        return;
      }
      if (matchesBinding(e, bindings["org:review-next"]) && hasNext) {
        onNext();
        return;
      }
      if (matchesBinding(e, bindings["org:review-approve"]) && !isApproving) {
        onApprove();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, hasPrev, hasNext, isApproving, onPrev, onNext, onApprove]);
}
