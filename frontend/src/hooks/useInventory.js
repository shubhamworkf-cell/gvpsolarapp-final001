import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = 10 * 60 * 1000; // 10 min — inventory changes infrequently

export function useProductList(filters = {}) {
  return useQuery({
    queryKey: queryKeys.inventory.products(filters),
    queryFn: async () => {
      const { data } = await api.get("/inventory/products");
      return data || [];
    },
    staleTime: STALE_TIME,
  });
}

export function useInventoryStats() {
  return useQuery({
    queryKey: queryKeys.inventory.stats(),
    queryFn: async () => {
      const { data } = await api.get("/inventory/stats");
      return data;
    },
    staleTime: STALE_TIME,
  });
}

export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all() });
}

export function useInventoryHistory(params = {}) {
  return useQuery({
    queryKey: ["inventory", "history", params],
    queryFn: async () => {
      const { data } = await api.get("/inventory/history", { params });
      return data || { rows: [], total: 0, page: 1, pages: 1, page_size: 50 };
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useInvalidateInventoryHistory() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["inventory", "history"] });
}

export function useInwardList() {
  return useQuery({
    queryKey: ["inventory", "inward"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/inward");
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
}

export function useOutwardList() {
  return useQuery({
    queryKey: ["inventory", "outward"],
    queryFn: async () => {
      const { data } = await api.get("/inventory/outward");
      return data || [];
    },
    staleTime: 3 * 60 * 1000,
  });
}
