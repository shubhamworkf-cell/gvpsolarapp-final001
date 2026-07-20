import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = Infinity; // Data lives for the entire session — invalidated only on mutation

export function useProjectList() {
  return useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const { data } = await api.get("/projects");
      return data || [];
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useProjectDetail(projectId) {
  return useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const { data } = await api.get(`/projects/${projectId}`);
      return data;
    },
    enabled: !!projectId,
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}

export function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.projects.all() });
}

export function useProjectStats() {
  return useQuery({
    queryKey: ["projects", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/projects/stats");
      return data;
    },
    staleTime: STALE_TIME,
    gcTime: Infinity,
  });
}
