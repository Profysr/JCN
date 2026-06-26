import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * A `useMutation` that invalidates one or more query keys on success.
 *
 * Kept intentionally pure — callers are responsible for their own onError handling so this helper doesn't silently acquire UI dependencies.
 *
 * @param {Function} mutationFn - the async request
 * @param {...Array} queryKeys  - query keys to invalidate on success
 */
export function useInvalidatingMutation(mutationFn, ...queryKeys) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryKeys.forEach((queryKey) => qc.invalidateQueries({ queryKey })),
  });
}
