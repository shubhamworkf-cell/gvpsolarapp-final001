import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = Infinity; // Data lives for the entire session — invalidated only on mutation

export function useTaskList(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.list(filters),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.assigned_to) params.append("assigned_to", filters.assigned_to);
      if (filters.client_id) params.append("client_id", filters.client_id);
      const { data } = await api.get(`/tasks?${params.toString()}`);
      return data || [];
    },
    staleTime: options.staleTime ?? STALE_TIME,
    gcTime: Infinity,
  });
}

export function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all() });
}
