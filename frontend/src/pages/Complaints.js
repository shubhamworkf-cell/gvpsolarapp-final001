import React, { useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useComplaintList, useComplaintStats, useInvalidateComplaints } from "@/hooks/useComplaints";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  Megaphone, Plus, AlertCircle, Clock, CheckCircle2, Flame, User as UserIcon,
  Search, ListChecks, ChevronRight,
} from "lucide-react";
import RaiseComplaintDialog, { COMPLAINT_CATEGORIES, COMPLAINT_PRIORITIES, SEND_TO_TARGETS } from "@/components/RaiseComplaintDialog";
import { usePermission } from "@/lib/permissions";

const STATUS_STYLES = {
  Open: "bg-slate-100 text-slate-700 border-slate-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Waiting: "bg-amber-50 text-amber-700 border-amber-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-slate-100 text-slate-500 border-slate-200",
};
const PRIORITY_BAR = {
  Low: "bg-slate-400", Medium: "bg-blue-500", High: "bg-orange-500", Urgent: "bg-red-500",
};
const ESC_BADGE = {
  yellow: { cls: "bg-amber-100 text-amber-800 border-amber-300", label: "Aging" },
  red: { cls: "bg-red-100 text-red-800 border-red-300", label: "Overdue" },
};
const STATUS_FILTERS = ["all", "Open", "Assigned", "In Progress", "Waiting", "Resolved", "Closed"];

export default function Complaints() {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || user?.role === "Supervisor";
  const canCreate = usePermission("complaints", "create");

  const [openDialog, setOpenDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");

  // Admin filters (only used in 'all' view)
  const [scope, setScope] = useState(isAdmin ? "all" : "mine");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");

  const filters = useMemo(() => {
    const f = {};
    if (scope === "mine") f.mine = true;
    if (filterStatus !== "all") f.status = filterStatus;
    if (filterPriority !== "all") f.priority = filterPriority;
    if (filterCategory !== "all") f.category = filterCategory;
    if (filterStartDate) f.start_date = filterStartDate;
    if (filterEndDate) f.end_date = filterEndDate;
    if (querySearch) f.search = querySearch;
    return f;
  }, [scope, filterStatus, filterPriority, filterCategory, filterStartDate, filterEndDate, querySearch]);

  const { data: rows = [], isLoading: rowsLoading } = useComplaintList(filters);
  const { data: stats = { total: 0, open: 0, in_progress: 0, resolved: 0, high_priority: 0, mine: 0 }, isLoading: statsLoading } = useComplaintStats();
  const loading = rowsLoading || statsLoading;

  const invalidateComplaints = useInvalidateComplaints();

  const statCards = useMemo(() => ([
    { label: "Total", v: stats?.total ?? 0, icon: ListChecks, color: "blue" },
    { label: "Open", v: stats?.open ?? 0, icon: AlertCircle, color: "slate" },
    { label: "In Progress", v: stats?.in_progress ?? 0, icon: Clock, color: "indigo" },
    { label: "Resolved", v: stats?.resolved ?? 0, icon: CheckCircle2, color: "emerald" },
    { label: "High Priority", v: stats?.high_priority ?? 0, icon: Flame, color: "red" },
    { label: "My Complaints", v: stats?.mine ?? 0, icon: UserIcon, color: "violet" },
  ]), [stats]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
              <Megaphone className="w-5 h-5" />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Complaint Center</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 ml-12">Raise issues, track resolution, assign to the right team.</p>
        </div>
        {canCreate && (
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={() => setOpenDialog(true)} data-testid="new-complaint-btn">
            <Plus className="w-4 h-4 mr-1.5" /> New Complaint
          </Button>
        )}
      </div>

      {/* Escalation banner */}
      {stats?.escalation && (stats.escalation.red > 0 || stats.escalation.yellow > 0) && (
        <Card className="border-amber-200 bg-amber-50/60" data-testid="escalation-banner">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <Flame className="w-4 h-4 text-amber-700" />
            <div className="text-sm text-amber-900 flex-1 min-w-0">
              <span className="font-semibold">Escalation</span> ·
              {stats.escalation.red > 0 && <Badge variant="outline" className="ml-2 bg-red-100 text-red-800 border-red-300 text-[10px]">{stats.escalation.red} overdue (&gt;48h)</Badge>}
              {stats.escalation.yellow > 0 && <Badge variant="outline" className="ml-2 bg-amber-100 text-amber-800 border-amber-300 text-[10px]">{stats.escalation.yellow} aging (&gt;24h)</Badge>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="complaint-stats-grid">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4 border-slate-200 card-lift">
              <div className={`w-9 h-9 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center mb-2.5`}><Icon className="w-4 h-4" /></div>
              <div className="text-2xl font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "Outfit" }}>{c.v}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-0.5 font-medium">{c.label}</div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card className="border-slate-200">
        <div className="p-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            {isAdmin && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" data-testid="cmp-scope-toggle">
                <button onClick={() => setScope("all")} className={`px-2.5 py-1 text-xs font-medium rounded-md ${scope === "all" ? "bg-rose-600 text-white" : "text-slate-600"}`} data-testid="cmp-scope-all">All</button>
                <button onClick={() => setScope("mine")} className={`px-2.5 py-1 text-xs font-medium rounded-md ${scope === "mine" ? "bg-rose-600 text-white" : "text-slate-600"}`} data-testid="cmp-scope-mine">Mine</button>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setQuerySearch(search)} placeholder="Search title, ID, client…" className="h-8 pl-8 w-64" data-testid="cmp-search" />
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-36 text-xs" data-testid="cmp-filter-status"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_FILTERS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All statuses" : s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="cmp-filter-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All priorities</SelectItem>
                {COMPLAINT_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="h-8 w-44 text-xs" data-testid="cmp-filter-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All categories</SelectItem>
                {COMPLAINT_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} className="h-8 w-36 text-xs" data-testid="cmp-filter-start" />
            <Input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} className="h-8 w-36 text-xs" data-testid="cmp-filter-end" />
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-slate-100" data-testid="complaints-list">
          {loading && <div className="p-8 text-center text-sm text-slate-500">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="p-10 text-center">
              <Megaphone className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-500">No complaints match the current filters.</div>
              {canCreate && (
                <Button className="mt-3 bg-rose-600 hover:bg-rose-700" size="sm" onClick={() => setOpenDialog(true)}><Plus className="w-3.5 h-3.5 mr-1.5" /> Raise the first one</Button>
              )}
            </div>
          )}
          {rows.map((c) => <ComplaintRow key={c.id} c={c} />)}
        </div>
      </Card>

      <RaiseComplaintDialog open={openDialog} onOpenChange={setOpenDialog} onCreated={invalidateComplaints} />
    </div>
  );
}

function ComplaintRow({ c }) {
  const esc = c.escalation && c.escalation !== "none" ? ESC_BADGE[c.escalation] : null;
  return (
    <Link to={`/complaints/${c.id}`} className="block p-4 hover:bg-slate-50 transition" data-testid={`complaint-row-${c.id}`}>
      <div className="flex items-center gap-4">
        <div className={`w-1.5 h-12 rounded-full ${PRIORITY_BAR[c.priority] || "bg-slate-300"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-500">#{c.complaint_no}</span>
            <div className="font-medium text-slate-900 truncate">{c.title}</div>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px]">{c.category}</Badge>
            {esc && <Badge variant="outline" className={`${esc.cls} text-[10px]`}>{esc.label}</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate">
            Raised by <span className="font-medium text-slate-700">{c.raised_by_name}</span>
            {c.client_name && <> · for <span className="font-medium text-slate-700">{c.client_name}</span></>}
            {c.assigned_to_name && <> · assigned to <span className="font-medium text-slate-700">{c.assigned_to_name}</span></>}
            {!c.assigned_to_name && c.send_to_target && <> · routed to <span className="italic text-slate-500">{c.send_to_target}</span></>}
            <> · {dayjs(c.created_at).fromNow()}</>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Badge variant="outline" className={`${STATUS_STYLES[c.status] || ""} text-[10px]`}>{c.status}</Badge>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{c.priority}</span>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300" />
      </div>
    </Link>
  );
}
