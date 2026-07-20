import React, { useMemo, useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useClientDataList, useClientDataStats } from "@/hooks/useClientDataHooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Users2, Activity, AlertCircle, Ticket as TicketIcon, CheckCircle2, Zap, Search, Filter,
  Download, ChevronRight, Phone, MessageCircle, Wifi, WifiOff, Wrench, Settings,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

const INV_STATUS_STYLES = {
  "Online": { dot: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200", icon: Wifi },
  "Offline": { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50 border-red-200", icon: WifiOff },
  "Error": { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: AlertCircle },
  "Maintenance": { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50 border-amber-200", icon: Wrench },
  "Not Configured": { dot: "bg-slate-300", text: "text-slate-500", bg: "bg-slate-50 border-slate-200", icon: Settings },
};

export const InverterStatusBadge = ({ status, size = "md" }) => {
  const cfg = INV_STATUS_STYLES[status] || INV_STATUS_STYLES["Not Configured"];
  const Ic = cfg.icon;
  return (
    <Badge variant="outline" className={`${cfg.bg} ${cfg.text} ${size === "sm" ? "text-[10px]" : "text-xs"} gap-1 font-semibold`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === "Online" ? "animate-pulse" : ""}`} />
      <Ic className="w-3 h-3" />
      {status}
    </Badge>
  );
};

const StatCard = ({ title, value, sub, icon: Ic, accent }) => (
  <Card className="border-slate-200 card-lift">
    <CardContent className="p-5">
      <div className="flex items-start justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</div>
        <div className={`w-9 h-9 rounded-xl ${accent} flex items-center justify-center`}>
          <Ic className="w-4 h-4" />
        </div>
      </div>
      <div className="text-3xl font-semibold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

const cleanPhone = (v) => (v || "").replace(/\D/g, "");

const QuickAction = ({ icon: Ic, label, onClick, color = "text-slate-500", testid }) => (
  <button onClick={onClick} title={label} data-testid={testid}
    className={`p-1.5 rounded-md hover:bg-slate-100 ${color} transition`}>
    <Ic className="w-3.5 h-3.5" />
  </button>
);

export default function ClientData() {
  const [filters, setFilters] = useState({
    search: "", consumer: "", mobile: "", city: "",
    capacity_min: "", capacity_max: "", status: "all", stage: "all",
  });
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const { data: clients = [], isLoading: clientsLoading } = useClientDataList(debouncedFilters);
  const { data: stats = { total_meters: 0, online: 0, offline: 0, error: 0 }, isLoading: statsLoading } = useClientDataStats();
  const loading = clientsLoading || statsLoading;

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const totalPages = Math.ceil(clients.length / itemsPerPage);
  const paginated = useMemo(() => {
    return clients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [clients, currentPage]);

  const exportCsv = async () => {
    try {
      const { data } = await api.get("/client-data/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a"); a.href = url; a.download = "gvp-solar-client-data.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const callClient = (mobile) => { if (mobile) window.location.href = `tel:${cleanPhone(mobile)}`; };
  const whatsApp = (mobile, name) => {
    const p = cleanPhone(mobile);
    if (!p) return;
    const text = encodeURIComponent(`Hello ${name || ""}, regarding your solar plant — please share your concern.`);
    window.open(`https://wa.me/91${p.length === 10 ? p : p.slice(-10)}?text=${text}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Client Data</h1>
          <p className="text-sm text-slate-500 mt-1">All clients across every stage · inverter monitoring · service tickets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)} data-testid="toggle-filters-btn">
            <Filter className="w-4 h-4 mr-1.5" /> {showFilters ? "Hide" : "More"} Filters
          </Button>
          <Button variant="outline" onClick={exportCsv} data-testid="export-csv-btn">
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Total Clients" value={stats?.total_clients ?? "—"} icon={Users2} accent="bg-blue-50 text-blue-600" />
        <StatCard title="Active Inverters" value={stats?.active_inverters ?? "—"} icon={Activity} accent="bg-emerald-50 text-emerald-600" />
        <StatCard title="Offline Inverters" value={stats?.offline_inverters ?? "—"} icon={WifiOff} accent="bg-red-50 text-red-600" />
        <StatCard title="Tickets Open" value={stats?.tickets_open ?? "—"} icon={TicketIcon} accent="bg-amber-50 text-amber-600" />
        <StatCard title="Tickets Closed" value={stats?.tickets_closed ?? "—"} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
        <StatCard title="Solar Capacity" value={`${stats?.total_capacity_kw ?? 0} kW`} icon={Zap} accent="bg-indigo-50 text-indigo-600" />
      </div>

      {/* Search bar */}
      <Card className="border-slate-200">
        <CardContent className="p-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search client name, mobile or consumer no…"
              className="pl-9 border-none focus-visible:ring-0 focus-visible:ring-offset-0"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              data-testid="client-search-input"
            />
          </div>
          <Select value={filters.stage} onValueChange={(v) => setFilters({ ...filters, stage: v })}>
            <SelectTrigger className="w-48" data-testid="stage-filter">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              <SelectItem value="Lead">Lead</SelectItem>
              <SelectItem value="Onboarding">Onboarding</SelectItem>
              <SelectItem value="Survey">Survey</SelectItem>
              <SelectItem value="Quotation">Quotation</SelectItem>
              <SelectItem value="Material Delivery">Material Delivery</SelectItem>
              <SelectItem value="Installation">Installation</SelectItem>
              <SelectItem value="Document Making">Document Making</SelectItem>
              <SelectItem value="Verification">Verification</SelectItem>
              <SelectItem value="Handover">Handover</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            <SelectTrigger className="w-48" data-testid="status-filter">
              <SelectValue placeholder="Inverter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Inverter Status</SelectItem>
              {Object.keys(INV_STATUS_STYLES).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {showFilters && (
        <Card className="border-slate-200">
          <CardContent className="p-4 grid md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <Input placeholder="Consumer number" value={filters.consumer} onChange={(e) => setFilters({ ...filters, consumer: e.target.value })} data-testid="filter-consumer" />
            <Input placeholder="Mobile" value={filters.mobile} onChange={(e) => setFilters({ ...filters, mobile: e.target.value })} data-testid="filter-mobile" />
            <Input placeholder="City" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} data-testid="filter-city" />
            <div className="flex gap-2">
              <Input type="number" placeholder="Min kW" value={filters.capacity_min} onChange={(e) => setFilters({ ...filters, capacity_min: e.target.value })} data-testid="filter-cap-min" />
              <Input type="number" placeholder="Max kW" value={filters.capacity_max} onChange={(e) => setFilters({ ...filters, capacity_max: e.target.value })} data-testid="filter-cap-max" />
            </div>
            <Input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} data-testid="filter-from-date" />
            <Input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} data-testid="filter-to-date" />
            <Button variant="ghost" className="text-slate-500" onClick={() => setFilters({ search: "", consumer: "", mobile: "", city: "", capacity_min: "", capacity_max: "", status: "all", stage: "all", from_date: "", to_date: "" })}>
              Clear all
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="client-data-table">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Consumer No.</th>
                <th className="px-4 py-3 text-left font-semibold">Mobile</th>
                <th className="px-4 py-3 text-left font-semibold">City</th>
                <th className="px-4 py-3 text-right font-semibold">Capacity</th>
                <th className="px-4 py-3 text-left font-semibold">Inverter</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Installation</th>
                <th className="px-4 py-3 text-center font-semibold w-32">Quick</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((x) => (
                  <tr key={x} className="border-t border-slate-100 animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-28 bg-slate-200 rounded mb-1" /><div className="h-3 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4 text-right"><div className="h-4 w-12 bg-slate-200 rounded ml-auto" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-7 w-7 bg-slate-200 rounded mx-auto" /></td>
                    <td className="px-4 py-4"></td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-16 text-center">
                  <div className="text-slate-400 mb-2"><CheckCircle2 className="w-10 h-10 mx-auto" /></div>
                  <div className="text-sm font-semibold text-slate-700">No clients found</div>
                  <div className="text-xs text-slate-500 mt-1">Use search or filters to locate clients by name, status, or stage.</div>
                </td></tr>
              ) : paginated.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50/60 transition" data-testid={`client-row-${c.id}`}>
                  <td className="px-4 py-3">
                    <Link to={`/client-data/${c.id}`} className="font-semibold text-slate-900 hover:text-blue-600">{c.full_name}</Link>
                    {c.open_tickets > 0 && (
                      <Badge variant="outline" className="ml-2 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                        <TicketIcon className="w-2.5 h-2.5 mr-0.5" /> {c.open_tickets} open
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 text-xs">{c.consumer_number || "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700 text-xs">{c.mobile || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 text-xs">{c.city || "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{(c.system_kw || 0).toFixed(2)} kW</td>
                  <td className="px-4 py-3 text-left text-xs text-slate-700">{c.current_stage || "—"}</td>
                  <td className="px-4 py-3 text-left text-xs text-slate-700">{c.assigned_team?.length ? c.assigned_team.join(", ") : "—"}</td>
                  <td className="px-4 py-3 text-left text-xs text-slate-700">{c.status || "—"}</td>
                  <td className="px-4 py-3"><InverterStatusBadge status={c.inverter_status} size="sm" /></td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    <div>{c.last_updated ? dayjs(c.last_updated).format("DD MMM YYYY") : "—"}</div>
                    <div className="text-[10px] text-slate-400">Updated {c.last_updated ? dayjs(c.last_updated).fromNow() : "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <QuickAction icon={Phone} label="Call" color="text-blue-600" onClick={() => callClient(c.mobile)} testid={`call-${c.id}`} />
                      <QuickAction icon={MessageCircle} label="WhatsApp" color="text-emerald-600" onClick={() => whatsApp(c.mobile, c.full_name)} testid={`wa-${c.id}`} />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Link to={`/client-data/${c.id}`} data-testid={`open-client-${c.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8"><ChevronRight className="w-4 h-4" /></Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, clients.length)} of {clients.length} clients
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
