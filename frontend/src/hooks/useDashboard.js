import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const STALE_TIME = 3 * 60 * 1000;

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(),
    queryFn: async () => {
      const { data } = await api.get("/clients/stats");
      return data;
    },
    staleTime: STALE_TIME,
  });
}
