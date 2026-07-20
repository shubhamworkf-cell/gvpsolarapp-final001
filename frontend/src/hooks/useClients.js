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
      await queryClient.cancelQueries({ queryKey: queryKeys.clients.all() });
      const prevData = queryClient.getQueriesData({ queryKey: queryKeys.clients.all() });
      queryClient.setQueriesData({ queryKey: queryKeys.clients.all() }, (old) => {
        if (!Array.isArray(old)) return old;
        return old.filter((c) => c.id !== clientId);
      });
      return { prevData };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prevData) {
        ctx.prevData.forEach(([key, data]) => queryClient.setQueryData(key, data));
      }
      toast.error(formatApiError(err));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.clients.stats() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
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
