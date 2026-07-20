import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

const STALE_TIME = 10 * 60 * 1000; // 10 min — team rarely changes

export function useEmployeeList() {
  return useQuery({
    queryKey: queryKeys.team.list(),
    queryFn: async () => {
      const { data } = await api.get("/employees");
      return data || [];
    },
    staleTime: STALE_TIME,
  });
}

export function useInvalidateTeam() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.team.list() });
}
