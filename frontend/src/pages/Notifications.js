import React from "react";
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
          ) : items.map((n) => (
            <div key={n.id} className={`p-4 border-b border-slate-100 flex items-start gap-3 ${!n.is_read ? "bg-blue-50/30" : ""}`}>
              {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-600 mt-2.5" />}
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{n.title}</div>
                {n.body && <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>}
                <div className="text-xs text-slate-400 mt-1">{dayjs(n.created_at).format("MMM D, YYYY · h:mm A")}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
