import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";

const PAGE_SIZE = 30;

function useActivityLogs(page) {
  return useQuery({
    queryKey: [...queryKeys.activityLogs.list(), page],
    queryFn: async () => {
      const { data } = await api.get("/activity-logs", { params: { page, page_size: PAGE_SIZE } });
      return data;
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export default function ActivityLog() {
  const [page, setPage] = useState(1);
  const { data, isLoading: loading, error } = useActivityLogs(page);
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Activity Log</h1>
        <p className="text-sm text-slate-500 mt-1">Every action by every team member, tracked.</p>
      </div>
      <Card className="border-slate-200">
        {loading && items.length === 0 && <div className="px-5 py-8 text-center text-slate-500">Loading activity log…</div>}
        {error && <div className="px-5 py-8 text-center text-sm text-rose-700">Unable to load activity log. {formatApiError(error)}</div>}
        {!error && (loading || items.length > 0) && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">When</th>
                  <th className="text-left px-5 py-3 font-semibold">User</th>
                  <th className="text-left px-5 py-3 font-semibold">Action</th>
                  <th className="text-left px-5 py-3 font-semibold">Target</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500"><ScrollText className="w-7 h-7 mx-auto mb-2 text-slate-300" />No activity yet.</td></tr>}
                {items.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{dayjs(l.created_at).format("MMM D, h:mm A")}</td>
                    <td className="px-5 py-3 text-slate-900 font-medium">{l.user_name}</td>
                    <td className="px-5 py-3 text-slate-700">{l.action}</td>
                    <td className="px-5 py-3 text-slate-600">{l.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="px-5 py-10 text-center text-slate-500"><ScrollText className="w-7 h-7 mx-auto mb-2 text-slate-300" />No activity yet.</div>
        )}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-slate-500">
              Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} logs
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
