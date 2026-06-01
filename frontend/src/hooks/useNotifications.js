import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export const notificationsKey = ["notifications"];

export const useNotifications = () =>
  useQuery({
    queryKey: notificationsKey,
    queryFn: () => api.get("/api/notifications/").then((r) => r.data),
  });

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id } = {}) =>
      api.post("/api/notifications/mark-read/", id ? { id } : {}).then((r) => r.data),
    onMutate: ({ id } = {}) => {
      qc.setQueryData(notificationsKey, (old) =>
        old?.map((n) => (id ? (n.id === id ? { ...n, read: true } : n) : { ...n, read: true }))
      );
    },
  });
};
