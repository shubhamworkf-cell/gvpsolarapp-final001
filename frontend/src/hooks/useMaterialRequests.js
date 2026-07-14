import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const STALE_TIME = Infinity; // Lives for the entire session

export function useMaterialRequestList(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.materialRequests.list(filters),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const params = {};
      if (filters.client_id) params.client_id = filters.client_id;
      if (filters.status) params.status = filters.status;
      const { data } = await api.get("/material-requests", { params });
      return data || [];
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useInvalidateMaterialRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.materialRequests.all() });
}
