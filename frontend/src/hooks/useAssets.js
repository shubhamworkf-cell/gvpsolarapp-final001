import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const STALE_TIME = 5 * 60 * 1000;

export function useAssetList(filters = {}) {
  return useQuery({
    queryKey: ["high-value-assets", filters],
    queryFn: async () => {
      const { data } = await api.get("/assets", { params: filters });
      return data || [];
    },
    staleTime: STALE_TIME,
  });
}

export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
}
