import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClientList, useClientStats } from "@/hooks/useClients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Clock, CheckCircle2, Zap, BadgePercent, Plus, Search } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import dayjs from "dayjs";

const STATUSES = ["All", "Lead", "Survey Pending", "Quotation Sent", "Approved", "Installation Pending", "Installation Complete", "Handover Complete"];

export default function Dashboard() {
  const nav = useNavigate();
  const { data: clients = [], isLoading: clientsLoading } = useClientList();
  const { data: stats = { total: 0, pending: 0, completed: 0, total_kw: 0, subsidy: 0 }, isLoading: statsLoading } = useClientStats();
  const loading = clientsLoading || statsLoading;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [subsidy, setSubsidy] = useState("All");
  const [phase, setPhase] = useState("All");

  const filtered = React.useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(c.full_name?.toLowerCase().includes(s) || c.mobile?.includes(s) || c.consumer_number?.includes(s))) return false;
      }
      if (status !== "All" && c.status !== status) return false;
      if (subsidy === "Yes" && !c.subsidy_eligible) return false;
      if (subsidy === "No" && c.subsidy_eligible) return false;
      if (phase !== "All" && c.phase_type !== phase) return false;
      return true;
    }).slice(0, 10);
  }, [clients, search, status, subsidy, phase]);

  const cards = React.useMemo(() => [
    { label: "Total Clients", value: stats.total, icon: Users, color: "blue", testid: "stat-card-total-clients" },
    { label: "Pending Sites", value: stats.pending, icon: Clock, color: "amber", testid: "stat-card-pending" },
    { label: "Completed Sites", value: stats.completed, icon: CheckCircle2, color: "emerald", testid: "stat-card-completed" },
    { label: "Total Installed KW", value: `${(stats.total_kw || 0).toFixed(1)} kW`, icon: Zap, color: "indigo", testid: "stat-card-kw" },
    { label: "Subsidy Clients", value: stats.subsidy, icon: BadgePercent, color: "teal", testid: "stat-card-subsidy" },
  ], [stats]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">Snapshot of your solar business in 10 seconds.</p>
          </div>
          <Button disabled className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-1.5" /> New Client
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((x) => (
            <Card key={x} className="p-5 border-slate-200 animate-pulse">
              <div className="w-10 h-10 rounded-lg bg-slate-100 mb-3" />
              <div className="h-6 w-16 bg-slate-200 rounded mb-2" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </Card>
          ))}
        </div>

        <Card className="border-slate-200 animate-pulse">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center gap-3">
            <div>
              <div className="h-5 w-32 bg-slate-200 rounded mb-1" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
          </div>
          <div className="p-5 space-y-4">
            {[1, 2, 3, 4, 5].map((x) => (
              <div key={x} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-none">
                <div className="space-y-1.5">
                  <div className="h-4 w-40 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
                <div className="h-4 w-24 bg-slate-200 rounded" />
                <div className="h-4 w-16 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Snapshot of your solar business in 10 seconds.</p>
        </div>
        <Button onClick={() => nav("/clients/new")} className="bg-blue-600 hover:bg-blue-700" data-testid="new-client-btn-dashboard">
          <Plus className="w-4 h-4 mr-1.5" /> New Client
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-5 card-lift border-slate-200" data-testid={c.testid}>
              <div className={`w-10 h-10 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center mb-3`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-semibold tracking-tight text-slate-900">{c.value}</div>
              <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wider">{c.label}</div>
            </Card>
          );
        })}
      </div>

      <Card className="border-slate-200">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div>
            <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Recent Clients</div>
            <div className="text-xs text-slate-500">Latest 10 entries</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile, consumer #" className="pl-9 w-64" data-testid="dashboard-search" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={subsidy} onValueChange={setSubsidy}>
              <SelectTrigger className="w-32" data-testid="filter-subsidy"><SelectValue placeholder="Subsidy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Subsidy</SelectItem>
                <SelectItem value="Yes">Yes</SelectItem>
                <SelectItem value="No">No</SelectItem>
              </SelectContent>
            </Select>
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger className="w-36" data-testid="filter-phase"><SelectValue placeholder="Phase" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Phase</SelectItem>
                <SelectItem value="Single Phase">Single Phase</SelectItem>
                <SelectItem value="Three Phase">Three Phase</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="recent-clients-table">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Client</th>
                <th className="text-left px-5 py-3 font-semibold">Mobile</th>
                <th className="text-left px-5 py-3 font-semibold">Consumer #</th>
                <th className="text-left px-5 py-3 font-semibold">KW</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Progress</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500">No clients yet. <Link className="text-blue-600 underline" to="/clients/new">Add your first client →</Link></td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => nav(`/clients/${c.id}`)} data-testid={`client-row-${c.id}`}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{c.full_name}</div>
                    <div className="text-xs text-slate-500">{c.sol_id}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{c.mobile}</td>
                  <td className="px-5 py-3 text-slate-700">{c.consumer_number || "—"}</td>
                  <td className="px-5 py-3 text-slate-700">{c.system_kw || 0} kW</td>
                  <td className="px-5 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.progress || 0}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 tabular-nums">{c.progress || 0}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
