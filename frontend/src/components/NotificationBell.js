import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { playNotificationSound } from "@/lib/notificationSound";
import dayjs from "dayjs";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const seenIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      const list = Array.isArray(data) ? data : [];
      setItems(list);

      let hasNewUnread = false;

      list.forEach((n) => {
        if (!n.is_read && !seenIdsRef.current.has(n.id)) {
          if (!isFirstLoadRef.current) {
            hasNewUnread = true;
            // Desktop/Browser Notification (works when tab is minimized)
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              try {
                new Notification(n.title || "High Priority Notification", {
                  body: n.body || "",
                  icon: "/logo192.png"
                });
              } catch (_) {}
            }
            // Single-pulse device vibration where supported
            if (typeof window !== "undefined" && "navigator" in window && typeof navigator.vibrate === "function") {
              try {
                navigator.vibrate([200, 100, 200]);
              } catch (_) {}
            }
          }
        }
        seenIdsRef.current.add(n.id);
      });

      if (hasNewUnread && !isFirstLoadRef.current) {
        playNotificationSound();
      }

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }
    } catch (_) {}
  };

  useEffect(() => {
    // Request Desktop Notification Permission on mount
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission();
      } catch (_) {}
    }

    load();
    const timer = setInterval(load, 3000); // 3s fast polling for near-instant delivery
    return () => clearInterval(timer);
  }, []);

  const unread = items.filter((i) => !i.is_read).length;

  const markAllRead = async () => {
    try {
      await api.post("/notifications/mark-all-read");
      setItems((prev) => prev.map((i) => ({ ...i, is_read: true })));
    } catch (_) {}
  };

  const handleItemClick = (n) => {
    setOpen(false);
    const title = (n.title || "").toLowerCase();
    const body = (n.body || "").toLowerCase();

    if (title.includes("task") || body.includes("task")) {
      navigate("/task-portal");
    } else if (title.includes("material") || body.includes("material")) {
      navigate("/material-requests");
    } else if (n.client_id) {
      navigate(`/client-data/${n.client_id}`);
    } else {
      navigate("/notifications");
    }
  };

  const groups = { Today: [], Yesterday: [], Older: [] };
  const today = dayjs().startOf("day");
  const yest = today.subtract(1, "day");
  items.forEach((n) => {
    const d = dayjs(n.created_at);
    if (d.isAfter(today)) groups.Today.push(n);
    else if (d.isAfter(yest)) groups.Yesterday.push(n);
    else groups.Older.push(n);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors" data-testid="notification-bell">
          <Bell className="w-5 h-5 text-slate-600" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center" data-testid="notification-badge">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" data-testid="notification-popover">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="font-semibold text-slate-900">High Priority Notifications</div>
          {unread > 0 && <Button variant="ghost" size="sm" onClick={markAllRead} data-testid="mark-all-read">Mark all read</Button>}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 && <div className="p-6 text-center text-sm text-slate-500">No notifications yet</div>}
          {["Today", "Yesterday", "Older"].map((label) => groups[label].length > 0 && (
            <div key={label}>
              <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50">{label}</div>
              {groups[label].map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={`px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${!n.is_read ? "bg-blue-50/30 font-medium" : ""}`}
                  data-testid="notification-item"
                >
                  <div className="flex items-start gap-3">
                    {!n.is_read && <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 leading-snug">{n.title}</div>
                      {n.body && <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{n.body}</div>}
                      <div className="text-[11px] text-slate-400 mt-1">{dayjs(n.created_at).format("MMM D, h:mm A")}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
