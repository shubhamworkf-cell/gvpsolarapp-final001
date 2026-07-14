import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = Infinity; // Lives for the entire session

export function useComplaintList(filters = {}, options = {}) {
  return useQuery({
    queryKey: queryKeys.complaints.list(filters),
    enabled: options.enabled ?? true,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append("status", filters.status);
      if (filters.category) params.append("category", filters.category);
      if (filters.mine) params.append("mine", "true");
      const { data } = await api.get(`/complaints?${params.toString()}`);
      return data || [];
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useComplaintDetail(complaintId) {
  return useQuery({
    queryKey: queryKeys.complaints.detail(complaintId),
    queryFn: async () => {
      const { data } = await api.get(`/complaints/${complaintId}`);
      return data;
    },
    enabled: !!complaintId,
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useInvalidateComplaints() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.complaints.all() });
}

export function useComplaintStats() {
  return useQuery({
    queryKey: ["complaints", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/complaints/stats");
      return data;
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}
