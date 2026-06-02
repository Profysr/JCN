import { QueryClient } from "@tanstack/react-query";

// Singleton — importable everywhere so authStore can call .clear() on login/register
// without needing React context.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});
