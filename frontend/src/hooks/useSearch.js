import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export const useSearch = (query) => {
  const q = query.trim();
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get(`/api/search/?q=${encodeURIComponent(q)}`).then((r) => r.data),
    enabled: q.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
};
