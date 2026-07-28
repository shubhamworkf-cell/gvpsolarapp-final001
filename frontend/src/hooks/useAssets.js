import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const STALE_TIME = 5 * 60 * 1000;

export function useAssetList(filters = {}) {
  const query = useQuery({
    queryKey: ["high-value-assets", filters],
    queryFn: async () => {
      const { data } = await api.get("/assets", { params: filters });
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE_TIME,
  });

  return {
    ...query,
    data: Array.isArray(query.data) ? query.data : [],
  };
}

export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
}
