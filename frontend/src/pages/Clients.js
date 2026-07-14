import React, { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClientList, useDeleteClient } from "@/hooks/useClients";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, Eye, Pencil, Trash2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import dayjs from "dayjs";
import { usePermission } from "@/lib/permissions";

const STATUSES = ["All", "Lead", "Survey Pending", "Quotation Sent", "Approved", "Installation Pending", "Installation Complete", "Handover Complete"];

export default function Clients() {
  const nav = useNavigate();
  const { data: clients = [], isLoading: loading } = useClientList();
  const deleteClientMutation = useDeleteClient();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [phase, setPhase] = useState("All");
  const [subsidy, setSubsidy] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const canCreate = usePermission("clients", "create");
  const canEdit = usePermission("clients", "edit");
  const canDelete = usePermission("clients", "delete");

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(c.full_name?.toLowerCase().includes(s) || c.mobile?.includes(s) || c.consumer_number?.includes(s) || c.sol_id?.toLowerCase().includes(s))) return false;
      }
      if (status !== "All" && c.status !== status) return false;
      if (phase !== "All" && c.phase_type !== phase) return false;
      if (subsidy === "Yes" && !c.subsidy_eligible) return false;
      if (subsidy === "No" && c.subsidy_eligible) return false;
      return true;
    });
  }, [clients, search, status, phase, subsidy]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, status, phase, subsidy]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = useMemo(() => {
    return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  const remove = (id) => {
    if (!window.confirm("Delete this client?")) return;
    deleteClientMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Clients</h1>
          <p className="text-sm text-slate-500 mt-1">All your solar customers in one CRM table.</p>
        </div>
        {canCreate && (
          <Button onClick={() => nav("/clients/new")} className="bg-blue-600 hover:bg-blue-700" data-testid="new-client-btn">
            <Plus className="w-4 h-4 mr-1.5" /> New Client
          </Button>
        )}
      </div>

      <Card className="border-slate-200">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, mobile, consumer #, or client ID" className="pl-9" data-testid="clients-search-input" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={phase} onValueChange={setPhase}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Phase</SelectItem>
              <SelectItem value="Single Phase">Single Phase</SelectItem>
              <SelectItem value="Three Phase">Three Phase</SelectItem>
            </SelectContent>
          </Select>
          <Select value={subsidy} onValueChange={setSubsidy}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Subsidy</SelectItem>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="clients-data-table">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Client</th>
                <th className="text-left px-4 py-3 font-semibold">Mobile</th>
                <th className="text-left px-4 py-3 font-semibold">Consumer #</th>
                <th className="text-left px-4 py-3 font-semibold">Address</th>
                <th className="text-left px-4 py-3 font-semibold">KW</th>
                <th className="text-left px-4 py-3 font-semibold">Phase</th>
                <th className="text-left px-4 py-3 font-semibold">Subsidy</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-left px-4 py-3 font-semibold">Progress</th>
                <th className="text-left px-4 py-3 font-semibold">Updated</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [1, 2, 3, 4, 5].map((x) => (
                  <tr key={x} className="border-t border-slate-100 animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-28 bg-slate-200 rounded mb-1" /><div className="h-3 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-32 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-8 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-8 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-5 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-4"><div className="h-3 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-100 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-7 w-7 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))
              ) : paginated.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-slate-500">No clients found.</td></tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50" data-testid={`client-row-${c.id}`}>
                    <td className="px-4 py-3">
                      <Link to={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-blue-600">{c.full_name}</Link>
                      <div className="text-xs text-slate-500">{c.sol_id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.mobile}</td>
                    <td className="px-4 py-3 text-slate-700">{c.consumer_number || "—"}</td>
                    <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate">{[c.address, c.city].filter(Boolean).join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{c.system_kw || 0}</td>
                    <td className="px-4 py-3 text-slate-700">{c.phase_type}</td>
                    <td className="px-4 py-3 text-slate-700">{c.subsidy_eligible ? "Yes" : "No"}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${c.progress || 0}%` }} /></div>
                        <span className="text-xs text-slate-500 tabular-nums">{c.progress || 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{c.updated_at ? dayjs(c.updated_at).format("MMM D, YYYY") : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`client-action-menu-${c.id}`}><MoreHorizontal className="w-4 h-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => nav(`/clients/${c.id}`)}><Eye className="w-4 h-4 mr-2" /> View</DropdownMenuItem>
                          {canEdit && <DropdownMenuItem onClick={() => nav(`/clients/${c.id}?edit=1`)}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>}
                          {canDelete && <DropdownMenuItem className="text-red-600" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs text-slate-500">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} clients
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
