import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useHighValueLedger(search = "") {
  const query = useQuery({
    queryKey: ["high-value-ledger", search],
    queryFn: async () => {
      const { data } = await api.get("/inventory/high-value-ledger", { params: { search } });
      return data || { all_goods: [], available: [], dispatched: [], returned: [] };
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    data: query.data || { all_goods: [], available: [], dispatched: [], returned: [] },
  };
}

export function useAssetList(filters = {}) {
  const query = useQuery({
    queryKey: ["high-value-assets", filters],
    queryFn: async () => {
      const { data } = await api.get("/assets", { params: filters });
      return Array.isArray(data) ? data : [];
    },
    staleTime: 0,
  });

  return {
    ...query,
    data: Array.isArray(query.data) ? query.data : [],
  };
}

export function useInvalidateAssets() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["high-value-ledger"] });
    queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };
}
