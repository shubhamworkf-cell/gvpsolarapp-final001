import React from "react";
import { useQuery } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { ScrollText } from "lucide-react";
import dayjs from "dayjs";

function useActivityLogs() {
  return useQuery({
    queryKey: queryKeys.activityLogs.list(),
    queryFn: async () => {
      const { data } = await api.get("/activity-logs", { params: { page: 1, page_size: 100 } });
      return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
    gcTime: Infinity,
  });
}

export default function ActivityLog() {
  const { data: items = [], isLoading: loading, error } = useActivityLogs();

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Activity Log</h1>
        <p className="text-sm text-slate-500 mt-1">Every action by every team member, tracked.</p>
      </div>
      <Card className="border-slate-200">
        {loading && <div className="px-5 py-8 text-center text-slate-500">Loading activity log…</div>}
        {error && <div className="px-5 py-8 text-center text-sm text-rose-700">Unable to load activity log. {formatApiError(error)}</div>}
        {!loading && !error && <div className="overflow-x-auto">
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
        </div>}
      </Card>
    </div>
  );
}
