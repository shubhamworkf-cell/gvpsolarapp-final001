import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import dayjs from "dayjs";

export default function Notifications() {
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: async () => {
      const { data } = await api.get("/notifications");
      return data || [];
    },
    staleTime: 2 * 60 * 1000, // 2 min — notifications should be reasonably fresh
    gcTime: Infinity,
  });

  const [page, setPage] = useState(1);
  const pageSize = 15;
  const totalPages = Math.ceil(items.length / pageSize);
  const paginatedItems = useMemo(() => {
    return items.slice((page - 1) * pageSize, page * pageSize);
  }, [items, page]);

  useEffect(() => { setPage(1); }, [items.length]);

  const markAll = async () => {
    await api.post("/notifications/mark-all-read");
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list() });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Notifications</h1>
          <p className="text-sm text-slate-500 mt-1">All your alerts in one place.</p>
        </div>
        <Button variant="outline" onClick={markAll}>Mark all as read</Button>
      </div>
      <Card className="border-slate-200">
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="p-10 text-center text-slate-500"><Bell className="w-8 h-8 mx-auto mb-2 text-slate-300" />No notifications.</div>
          ) : (
            <>
              {paginatedItems.map((n) => (
                <div key={n.id} className={`p-4 border-b border-slate-100 flex items-start gap-3 ${!n.is_read ? "bg-blue-50/30" : ""}`}>
                  {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-600 mt-2.5" />}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900">{n.title}</div>
                    {n.body && <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>}
                    <div className="text-xs text-slate-400 mt-1">{dayjs(n.created_at).format("MMM D, YYYY · h:mm A")}</div>
                  </div>
                </div>
              ))}
              {totalPages > 1 && (
                <div className="p-4 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="text-slate-500">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, items.length)} of {items.length} notifications
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
