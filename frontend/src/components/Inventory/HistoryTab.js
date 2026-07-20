import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useInventoryHistory, useInvalidateInventoryHistory } from "@/hooks/useInventory";
import { useEmployeeList } from "@/hooks/useTeam";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, History, FileImage, FileText, ArrowDownToLine, ArrowUpFromLine,
  Trash2, Pencil, ChevronLeft, ChevronRight, Filter, X,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import { ConfirmDialog } from "./_shared";
import EditTransactionDialog from "./EditTransactionDialog";

export default function HistoryTab({ globalSearch, products, onChanged }) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [filters, setFilters] = useState({
    type: "all", product: "", vendor: "", client: "",
    challan: "", bill_number: "", user_id: "", status: "all",
    from_date: "", to_date: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [confirmDel, setConfirmDel] = useState(null);
  const [expandedSerials, setExpandedSerials] = useState(new Set());

  const toggleSerials = (id) => {
    setExpandedSerials(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [editing, setEditing] = useState(null);

  // Debounced filters to avoid continuous requests
  const [debouncedParams, setDebouncedParams] = useState({ page, page_size: pageSize });

  const activeParams = useMemo(() => {
    const p = { page, page_size: pageSize };
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") p[k] = v; });
    if (globalSearch) p.search = globalSearch;
    return p;
  }, [filters, globalSearch, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedParams(activeParams);
    }, 250);
    return () => clearTimeout(t);
  }, [activeParams]);

  const { data = { rows: [], total: 0, page: 1, pages: 1, page_size: 50 }, isLoading: historyLoading } = useInventoryHistory(debouncedParams);
  const { data: employees = [], isLoading: employeesLoading } = useEmployeeList();

  const loading = historyLoading || employeesLoading;
  const invalidateHistory = useInvalidateInventoryHistory();

  useEffect(() => {
    setSelected(new Set());
  }, [debouncedParams]);

  useEffect(() => { setPage(1); }, [filters, globalSearch]);

  const exportCsv = async () => {
    try {
      const params = activeParams;
      const { data: blob } = await api.get("/inventory/history.csv", { params, responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "gvp-solar-inventory-history.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const exportSelectedCsv = () => {
    if (selected.size === 0) return;
    const sel = data.rows.filter((r) => selected.has(`${r.type}:${r.id}`));
    const headers = ["Date", "Type", "Product", "Size", "Quantity", "Unit", "Reference / Challan", "Bill / Outward No", "Vendor / Client", "Project", "Status", "Remarks", "Created By"];
    const lines = [headers.join(",")];
    sel.forEach((r) => {
      const ref = r.reference_number || r.outward_challan_no || "";
      const bill = r.bill_number || "";
      const party = r.type === "Inward" ? r.source_name : r.client_name;
      const row = [
        (r.date || r.created_at || "").slice(0, 10), r.type, r.product, r.size || "",
        r.quantity || 0, r.unit || "Nos", ref, bill, party || "",
        r.project_name || "", r.status || "", (r.remarks || "").replace(/"/g, '""'),
        r.created_by_name || "",
      ];
      lines.push(row.map((v) => `"${v}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `gvp-solar-history-selected-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${sel.length} rows exported`);
  };

  const bulkDelete = async () => {
    if (deleting) return;
    const inward_ids = [];
    const outward_ids = [];
    selected.forEach((key) => {
      const [type, id] = key.split(":");
      if (type === "Inward") inward_ids.push(id);
      else if (type === "Outward") outward_ids.push(id);
    });

    if (inward_ids.length === 0 && outward_ids.length === 0) {
      toast.error("No entries selected for deletion");
      return;
    }

    setDeleting(true);
    try {
      const { data: res } = await api.post("/inventory/bulk-delete", { inward_ids, outward_ids });
      toast.success(`Deleted ${res.total} entries`);
      setConfirmBulk(false);
      setSelected(new Set());
      invalidateHistory();
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
      onChanged?.();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const toggle = (key) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  };
  const toggleAllPage = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      const allKeys = data.rows.map((r) => `${r.type}:${r.id}`);
      const allSel = allKeys.every((k) => n.has(k));
      if (allSel) allKeys.forEach((k) => n.delete(k));
      else allKeys.forEach((k) => n.add(k));
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const selectAllRecords = async () => {
    try {
      const params = activeParams;
      const { data: r } = await api.get("/inventory/history", { params: { ...params, page: 1, page_size: 10000 } });
      const keys = r.rows.map((row) => `${row.type}:${row.id}`);
      setSelected(new Set(keys));
      toast.success(`Selected ${keys.length} matching rows`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const allPageSelected = data.rows.length > 0 && data.rows.every((r) => selected.has(`${r.type}:${r.id}`));

  const clearFilters = () => setFilters({
    type: "all", product: "", vendor: "", client: "",
    challan: "", bill_number: "", user_id: "", status: "all",
    from_date: "", to_date: "",
  });

  const hasFilters = Object.values(filters).some((v) => v && v !== "all");

  return (
    <div className="space-y-4">
      {/* Filter card */}
      <Card className="border-slate-200">
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger className="w-44" data-testid="hist-type-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="inward">Inward only</SelectItem>
                <SelectItem value="outward">Outward only</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Product" value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} className="w-40" data-testid="hist-product" list="hist-product-list" />
            <datalist id="hist-product-list">{(products || []).map((p) => <option key={p.id} value={p.name} />)}</datalist>
            <Input placeholder="Vendor" value={filters.vendor} onChange={(e) => setFilters({ ...filters, vendor: e.target.value })} className="w-32" data-testid="hist-vendor" />
            <Input placeholder="Client" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })} className="w-32" data-testid="hist-client" />
            <Input type="date" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} className="w-36" data-testid="hist-from" />
            <Input type="date" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} className="w-36" data-testid="hist-to" />
            <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)} data-testid="hist-more-filters">
              <Filter className="w-3.5 h-3.5 mr-1" /> {showFilters ? "Less" : "More"}
            </Button>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="text-slate-500" onClick={clearFilters} data-testid="hist-clear-filters">
                <X className="w-3.5 h-3.5 mr-1" /> Clear
              </Button>
            )}
          </div>
          {showFilters && (
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 pt-3 border-t border-slate-100">
              <Input placeholder="Challan No." value={filters.challan} onChange={(e) => setFilters({ ...filters, challan: e.target.value })} data-testid="hist-challan" />
              <Input placeholder="Bill No." value={filters.bill_number} onChange={(e) => setFilters({ ...filters, bill_number: e.target.value })} data-testid="hist-bill" />
              <Select value={filters.user_id || "__all__"} onValueChange={(v) => setFilters({ ...filters, user_id: v === "__all__" ? "" : v })}>
                <SelectTrigger data-testid="hist-user"><SelectValue placeholder="Any User" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__all__">Any User</SelectItem>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger data-testid="hist-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Dispatched">Dispatched</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <Badge className="bg-blue-600 text-white">{selected.size} selected</Badge>
            <Button variant="outline" size="sm" onClick={selectAllRecords} data-testid="select-all-records">Select all matching ({data.total})</Button>
            <Button variant="outline" size="sm" onClick={clearSelection} data-testid="clear-selection">Clear</Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={exportSelectedCsv} data-testid="export-selected"><Download className="w-3.5 h-3.5 mr-1" /> Export Selected CSV</Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => setConfirmBulk(true)} data-testid="bulk-delete-btn" disabled={deleting}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> {deleting ? "Deleting…" : `Delete Selected (${selected.size})`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Transaction History</div>
              <div className="text-xs text-slate-500">{data.total} transactions {loading && "· loading…"}</div>
            </div>
            <Button variant="outline" onClick={exportCsv} data-testid="export-history-btn"><Download className="w-4 h-4 mr-1.5" /> Export All CSV</Button>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm" data-testid="history-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2.5 w-9">
                    <input type="checkbox" checked={allPageSelected} onChange={toggleAllPage} className="w-4 h-4 accent-blue-600" data-testid="select-all-page" />
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Party</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Reference</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold">By</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-20">Edit</th>
                </tr>
              </thead>
              <tbody>
                {!loading && data.rows.length === 0 ? (
                  <tr><td colSpan={10} className="px-4 py-16 text-center">
                    <History className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <div className="text-sm font-semibold text-slate-700">No transactions match these filters</div>
                  </td></tr>
                ) : data.rows.flatMap((r) => {
                  const key = `${r.type}:${r.id}`;
                  const isSel = selected.has(key);
                  const hasSerials = r.serial_numbers && r.serial_numbers.length > 0;
                  const isExpanded = expandedSerials.has(r.id);
                  
                  const mainRow = (
                    <tr key={key} className={`border-t border-slate-100 ${isSel ? "bg-blue-50/40" : ""}`} data-testid={`history-row-${r.id}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={isSel} onChange={() => toggle(key)} className="w-4 h-4 accent-blue-600" data-testid={`row-check-${r.id}`} />
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums">{dayjs(r.date || r.created_at).format("DD MMM YYYY")}</td>
                      <td className="px-4 py-2.5">
                        {r.type === "Inward" ? (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"><ArrowDownToLine className="w-2.5 h-2.5 mr-1" /> Inward</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"><ArrowUpFromLine className="w-2.5 h-2.5 mr-1" /> Outward</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-slate-900 text-xs">{r.product}</div>
                        {r.size && <div className="text-[10px] text-slate-400 mt-0.5">{r.size}</div>}
                        {hasSerials && (
                          <button
                            onClick={() => toggleSerials(r.id)}
                            className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-semibold"
                            data-testid={`toggle-serials-${r.id}`}
                          >
                            {isExpanded ? "Hide Serials" : `Show Serials (${r.serial_numbers.length})`}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{r.quantity} <span className="text-[10px] text-slate-500 font-normal">{r.unit || "Nos"}</span></td>
                      <td className="px-4 py-2.5 text-xs">{r.type === "Inward" ? r.source_name : r.client_name || "—"}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <div className="font-mono text-slate-700">{r.reference_number || r.outward_challan_no || "—"}</div>
                        {r.bill_number && <div className="font-mono text-[10px] text-slate-400">Bill {r.bill_number}</div>}
                        {r.attachment_file_id && (
                          <a href={fileUrl(r.attachment_file_id)} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1">
                            {(r.attachment_filename || "").match(/\.(png|jpe?g|webp)$/i) ? <FileImage className="w-3 h-3" /> : <FileText className="w-3 h-3" />} attachment
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-[10px]">
                        {r.status ? <Badge variant="outline" className="text-[10px]">{r.status}</Badge> : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[10px] text-slate-500">{r.created_by_name || "—"}</td>
                      <td className="px-2 py-2 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(r)} data-testid={`hist-edit-${r.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      </td>
                    </tr>
                  );
                  
                  if (hasSerials && isExpanded) {
                    const serialRow = (
                      <tr key={`${key}-serials`} className="bg-slate-50/40 border-t border-slate-100">
                        <td colSpan={1} className="py-1"></td>
                        <td colSpan={9} className="px-4 py-2.5">
                          <div className="space-y-1">
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Serial Numbers:</div>
                            <div className="flex flex-wrap gap-1">
                              {r.serial_numbers.map((sn, idx) => (
                                <Badge key={idx} variant="outline" className="font-mono text-[10px] bg-white text-slate-800 border-slate-200">
                                  {sn}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                    return [mainRow, serialRow];
                  }
                  
                  return [mainRow];
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data.total > pageSize && (
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="text-slate-500">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
              </div>
              <div className="flex items-center gap-2">
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-8 w-24" data-testid="page-size"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} data-testid="prev-page"><ChevronLeft className="w-4 h-4" /></Button>
                <span className="font-medium tabular-nums text-slate-700">{page} / {data.pages}</span>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages} data-testid="next-page"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmBulk}
        onOpenChange={setConfirmBulk}
        title="Delete Selected Entries"
        description={`You are about to permanently delete ${selected.size} entries. This action cannot be undone.`}
        confirmLabel={deleting ? "Deleting..." : "Delete Permanently"}
        onConfirm={bulkDelete}
        disabled={deleting}
      />

      <EditTransactionDialog
        transaction={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); invalidateHistory(); onChanged?.(); }}
        products={products}
      />
    </div>
  );
}
