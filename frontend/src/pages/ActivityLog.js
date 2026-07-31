import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";

function useActivityLogs(page = 1, pageSize = 30) {
  return useQuery({
    queryKey: [...queryKeys.activityLogs.list(), page, pageSize],
    queryFn: async () => {
      const { data } = await api.get("/activity-logs", { params: { page, page_size: pageSize, all_time: page > 1 } });
      return {
        items: Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [],
        total: data?.total || 0,
      };
    },
    staleTime: 3 * 60 * 1000,
  });
}

export default function ActivityLog() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("all");
  const pageSize = 30;

  const { data = { items: [], total: 0 }, isLoading: loading, error } = useActivityLogs(page, pageSize);
  const rawItems = data.items;

  const matchesDateRange = (dateStr, range) => {
    if (!range || range === "all" || !dateStr) return true;
    const d = dayjs(dateStr);
    if (!d.isValid()) return true;
    const now = dayjs();
    if (range === "today") return d.isSame(now, "day");
    if (range === "7days") return d.isAfter(now.subtract(7, "day"));
    if (range === "30days") return d.isAfter(now.subtract(30, "day"));
    return true;
  };

  const filteredItems = React.useMemo(() => {
    return rawItems.filter((l) => {
      if (search) {
        const q = search.toLowerCase();
        const uMatch = (l.user_name || "").toLowerCase().includes(q);
        const aMatch = (l.action || "").toLowerCase().includes(q);
        const tMatch = (l.target || "").toLowerCase().includes(q);
        if (!uMatch && !aMatch && !tMatch) return false;
      }
      if (!matchesDateRange(l.created_at, dateRange)) return false;
      return true;
    });
  }, [rawItems, search, dateRange]);

  const items = filteredItems;
  const totalPages = Math.ceil((data.total || items.length) / pageSize);

  const isFiltered = Boolean(search || dateRange !== "all");
  const resetFilters = () => { setSearch(""); setDateRange("all"); };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Activity Log</h1>
          <p className="text-sm text-slate-500 mt-1">Every action by every team member, tracked.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          placeholder="Filter user, action, target..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
          data-testid="activity-filter-search"
        />
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Time</option>
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>
        {isFiltered && (
          <Button size="sm" variant="ghost" onClick={resetFilters} className="h-9 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50">
            Clear Filters
          </Button>
        )}
      </div>

      <Card className="border-slate-200">
        {loading && <div className="px-5 py-8 text-center text-slate-500">Loading activity log…</div>}
        {error && <div className="px-5 py-8 text-center text-sm text-rose-700">Unable to load activity log. {formatApiError(error)}</div>}
        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="activity-log-table">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">When</th>
                    <th className="text-left px-5 py-3 font-semibold">User</th>
                    <th className="text-left px-5 py-3 font-semibold">Action</th>
                    <th className="text-left px-5 py-3 font-semibold">Target</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-500"><ScrollText className="w-7 h-7 mx-auto mb-2 text-slate-300" />No activity found.</td></tr>}
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

            <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-4 text-xs text-slate-500">
              <div>Page {page} of {Math.max(1, totalPages)}</div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={items.length < pageSize}>
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
