import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = Infinity; // Lives for the entire session — invalidated only on mutation

// --- Company -----------------------------------------------------------------

export function useCompany() {
  return useQuery({
    queryKey: queryKeys.company.detail(),
    queryFn: async () => {
      const { data } = await api.get("/company");
      return data;
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
}


// --- Queries -----------------------------------------------------------------

export function useClientList() {
  return useQuery({
    queryKey: queryKeys.clients.list(),
    queryFn: async () => {
      const { data } = await api.get("/clients");
      return data || [];
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useClientStats() {
  return useQuery({
    queryKey: queryKeys.clients.stats(),
    queryFn: async () => {
      const { data } = await api.get("/clients/stats");
      return data;
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useClientDetail(clientId) {
  return useQuery({
    queryKey: queryKeys.clients.detail(clientId),
    queryFn: async () => {
      const { data } = await api.get(`/clients/${clientId}`);
      return data;
    },
    enabled: !!clientId,
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

// --- Mutations ----------------------------------------------------------------

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.post("/clients", payload).then((r) => r.data),
    onSuccess: (newClient) => {
      // Direct cache update: prepend the new client to the local cached list
      queryClient.setQueryData(queryKeys.clients.list(), (old) => {
        if (!Array.isArray(old)) return [newClient];
        return [newClient, ...old];
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
    },
    onError: (err) => toast.error(formatApiError(err)),
  });
}

export function useUpdateClient(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.put(`/clients/${clientId}`, payload).then((r) => r.data),
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.clients.detail(clientId) });
      const prev = queryClient.getQueryData(queryKeys.clients.detail(clientId));
      queryClient.setQueryData(queryKeys.clients.detail(clientId), (old) =>
        old ? { ...old, ...payload } : old
      );
      return { prev };
    },
    onError: (err, _payload, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.clients.detail(clientId), ctx.prev);
      toast.error(formatApiError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.detail(clientId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() });
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId) => api.delete(`/clients/${clientId}`),
    onMutate: async (clientId) => {
      // 1. Cancel outgoing refetches so they don't overwrite optimistic update
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["clients"] }),
        queryClient.cancelQueries({ queryKey: ["client-data"] }),
        queryClient.cancelQueries({ queryKey: ["dashboard"] }),
        queryClient.cancelQueries({ queryKey: ["projects"] }),
        queryClient.cancelQueries({ queryKey: ["tasks"] }),
      ]);

      const prevData = [
        ...queryClient.getQueriesData({ queryKey: ["clients"] }),
        ...queryClient.getQueriesData({ queryKey: ["client-data"] }),
        ...queryClient.getQueriesData({ queryKey: ["dashboard"] }),
        ...queryClient.getQueriesData({ queryKey: ["projects"] }),
        ...queryClient.getQueriesData({ queryKey: ["tasks"] }),
      ];

      // 2. Helper to filter out deleted client from array or wrapper object
      const filterOutClient = (old) => {
        if (!old) return old;
        if (Array.isArray(old)) {
          return old.filter((item) => (item.id || item.client_id) !== clientId);
        }
        if (typeof old === "object") {
          if (Array.isArray(old.clients)) {
            return { ...old, clients: old.clients.filter((c) => c.id !== clientId) };
          }
          if (Array.isArray(old.items)) {
            return { ...old, items: old.items.filter((c) => (c.id || c.client_id) !== clientId) };
          }
          if (old.id === clientId) return null;
        }
        return old;
      };

      // 3. Update UI caches INSTANTLY (0ms delay)
      queryClient.setQueriesData({ queryKey: ["clients"] }, filterOutClient);
      queryClient.setQueriesData({ queryKey: ["client-data"] }, filterOutClient);
      queryClient.setQueriesData({ queryKey: ["dashboard"] }, filterOutClient);
      queryClient.setQueriesData({ queryKey: ["projects"] }, filterOutClient);
      queryClient.setQueriesData({ queryKey: ["tasks"] }, filterOutClient);

      return { prevData };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prevData) {
        ctx.prevData.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      toast.error(formatApiError(err));
    },
    onSettled: () => {
      // 4. Invalidate all related query keys across all pages
      queryClient.invalidateQueries({ queryKey: ["clients"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["client-data"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["dashboard"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["projects"], refetchType: "all" });
      queryClient.invalidateQueries({ queryKey: ["tasks"], refetchType: "all" });
    },
    onSuccess: () => toast.success("Client deleted"),
  });
}

export function useUpdateClientStages(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (stages) => api.patch(`/clients/${clientId}/stages`, { stages }).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.clients.detail(clientId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() });
    },
    onError: (err) => toast.error(formatApiError(err)),
  });
}

export function useUpdateClientStatus(clientId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status) => api.patch(`/clients/${clientId}/status`, { status }).then((r) => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.clients.detail(clientId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.stats() });
    },
    onError: (err) => toast.error(formatApiError(err)),
  });
}
