import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export function useSalesDocuments(docType) {
  return useQuery({
    queryKey: ["sales-documents", "list", docType],
    queryFn: async () => {
      const { data } = await api.get("/documents/generated", {
        params: { doc_type: docType }
      });
      return data || [];
    },
    staleTime: 3 * 60 * 1000, // 3 minutes - avoid duplicate fetches on nav, keep in-memory cache fresh
    gcTime: Infinity,
  });
}

export function useDeleteSalesDocument(docType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId) => api.delete(`/documents/generated/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-documents", "list", docType] });
      toast.success("Document deleted successfully.");
    },
    onError: (err) => toast.error(formatApiError(err)),
  });
}
