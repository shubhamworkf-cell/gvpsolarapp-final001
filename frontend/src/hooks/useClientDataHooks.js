import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const STALE_TIME = 3 * 60 * 1000;

export function useClientDataList(filters = {}) {
  return useQuery({
    queryKey: queryKeys.clientData.list(filters),
    queryFn: async () => {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params[k] = v; });
      const { data } = await api.get("/client-data/clients", { params });
      return data || [];
    },
    staleTime: STALE_TIME,
    placeholderData: (prev) => prev,
  });
}

export function useClientDataStats() {
  return useQuery({
    queryKey: ["client-data", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/client-data/stats");
      return data;
    },
    staleTime: STALE_TIME,
  });
}

export function useClientDataDetail(clientId, tab = "info", options = {}) {
  return useQuery({
    queryKey: queryKeys.clientData.tab(clientId, tab),
    queryFn: async () => {
      const { data } = await api.get(`/client-data/clients/${clientId}`, { params: { tab } });
      return data;
    },
    enabled: !!clientId && (options.enabled !== false),
    staleTime: STALE_TIME,
    ...options
  });
}

export function useLedger(clientId, enabled = true) {
  return useQuery({
    queryKey: ["ledger", clientId],
    queryFn: async () => {
      const { data } = await api.get(`/inventory/ledger/${clientId}`);
      return data;
    },
    enabled: !!clientId && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvalidateClientData() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.clientData.list() });
}
