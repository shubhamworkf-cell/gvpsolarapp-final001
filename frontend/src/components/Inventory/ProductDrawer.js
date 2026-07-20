import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Save, Pencil, Trash2, ArrowDownToLine, ArrowUpFromLine, Search, Activity, Calendar, Layers, FileImage, FileText,
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { Field, SelectField, UNIT_OPTIONS, CATEGORY_OPTIONS, ConfirmDialog } from "./_shared";
import EditTransactionDialog from "./EditTransactionDialog";

const STATUS_STYLES = {
  "Normal": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200",
  "Out Of Stock": "bg-red-50 text-red-700 border-red-200",
};

export default function ProductDrawer({ product, open, onClose, onChanged }) {
  const [tab, setTab] = useState("details");
  const [stats, setStats] = useState(null);
  const [txns, setTxns] = useState({ rows: [], total: 0 });
  const [filters, setFilters] = useState({ type: "all", search: "", challan: "", vendor: "", client: "", from_date: "", to_date: "" });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingTxn, setEditingTxn] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const loadStats = useCallback(async () => {
    if (!product) return;
    try {
      const { data } = await api.get(`/inventory/products/${product.id}/stats`);
      setStats(data);
    } catch (e) { toast.error(formatApiError(e)); }
  }, [product]);

  useEffect(() => {
    if (!product || !open) return;
    setTab("details");
    setForm({ name: product.name, size: product.size || "", category: product.category || "Solar Panel", unit: product.unit || "Nos", min_stock: product.min_stock || 0, rate: product.rate || 0, status: product.status || "Active", high_value_goods: product.high_value_goods || false });
    loadStats();
  }, [product, open, loadStats]);

  const loadTxns = useCallback(async () => {
    if (!product) return;
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v && v !== "all") params[k] = v; });
      const { data } = await api.get(`/inventory/products/${product.id}/transactions`, { params });
      setTxns(data);
    } catch (e) { toast.error(formatApiError(e)); }
  }, [product, filters]);

  useEffect(() => {
    if (tab === "transactions") {
      const t = setTimeout(loadTxns, 200);
      return () => clearTimeout(t);
    }
  }, [tab, loadTxns]);

  const saveProduct = async () => {
    setBusy(true);
    try {
      const payload = { ...form, min_stock: Number(form.min_stock) || 0, rate: Number(form.rate) || 0 };
      await api.patch(`/inventory/products/${product.id}`, payload);
      toast.success("Product updated");
      onChanged?.();
      loadStats();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const deleteTxn = async () => {
    if (!confirmDel) return;
    const url = confirmDel.type === "Inward" ? `/inventory/inward/${confirmDel.id}` : `/inventory/outward/${confirmDel.id}`;
    try {
      await api.delete(url);
      toast.success("Transaction deleted");
      setConfirmDel(null);
      loadStats(); loadTxns(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (!product || !form) return null;
  const balance = stats?.balance ?? product.balance ?? 0;
  const stockStatus = balance <= 0 ? "Out Of Stock" : balance <= (form.min_stock || 0) ? "Low Stock" : "Normal";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-6xl max-h-[94vh] p-0 overflow-hidden flex flex-col" data-testid="product-drawer">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-lg font-bold">
              {(product.name || "?").slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle style={{ fontFamily: "Outfit" }} className="truncate">{product.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 text-xs">
                <Badge variant="outline" className="bg-slate-50">{form.category || "Solar"}</Badge>
                <Badge variant="outline" className={STATUS_STYLES[stockStatus]}>{stockStatus}</Badge>
                <span className="text-slate-500">Balance · <span className="tabular-nums font-bold text-slate-900">{balance}</span> {form.unit}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 mt-3 -mb-3 border-b border-transparent">
            {[
              { k: "details", l: "Product Details" },
              { k: "stats", l: "Inventory Statistics" },
              { k: "transactions", l: `Related Transactions ${stats ? `(${stats.transaction_count})` : ""}` },
            ].map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t.k ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                data-testid={`pd-tab-${t.k}`}
              >
                {t.l}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Section 1: Product Details */}
          {tab === "details" && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Product Name" value={form.name} onChange={(v) => setForm({ ...form, name: v.toUpperCase() })} required testid="pd-name" />
                <Field label="Size / Specification" value={form.size} onChange={(v) => setForm({ ...form, size: v })} testid="pd-size" />
                <SelectField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} testid="pd-category" />
                <SelectField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNIT_OPTIONS} testid="pd-unit" />
                <Field label="Minimum Stock Level" type="number" value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} testid="pd-min" />
                <Field label="Rate / Unit Price" type="number" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} testid="pd-rate" />
                <SelectField label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["Active", "Inactive"]} testid="pd-status" />
                <div className="md:col-span-2 flex items-center gap-2 py-1">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.high_value_goods || false}
                      onChange={(e) => setForm({ ...form, high_value_goods: e.target.checked })}
                      className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                    />
                    High Value Goods (Requires serial tracking)
                  </label>
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveProduct} disabled={busy} data-testid="pd-save"><Save className="w-4 h-4 mr-1.5" /> {busy ? "Saving…" : "Save Product"}</Button>
              </div>
            </div>
          )}

          {/* Section 2: Inventory Statistics */}
          {tab === "stats" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatTile label="Current Stock" value={`${balance} ${form.unit}`} icon={Layers} accent="bg-blue-50 text-blue-600" />
              <StatTile label="Total Inward" value={stats?.total_in ?? 0} icon={ArrowDownToLine} accent="bg-emerald-50 text-emerald-600" />
              <StatTile label="Total Outward" value={stats?.total_out ?? 0} icon={ArrowUpFromLine} accent="bg-amber-50 text-amber-600" />
              <StatTile label="Inward Entries" value={stats?.inward_count ?? 0} icon={ArrowDownToLine} accent="bg-emerald-50 text-emerald-600" />
              <StatTile label="Outward Entries" value={stats?.outward_count ?? 0} icon={ArrowUpFromLine} accent="bg-amber-50 text-amber-600" />
              <StatTile label="Total Transactions" value={stats?.transaction_count ?? 0} icon={Activity} accent="bg-indigo-50 text-indigo-600" />
              <StatTile label="Last Inward" value={stats?.last_inward_date ? dayjs(stats.last_inward_date).format("DD MMM YYYY") : "—"} icon={Calendar} accent="bg-emerald-50 text-emerald-600" full />
              <StatTile label="Last Outward" value={stats?.last_outward_date ? dayjs(stats.last_outward_date).format("DD MMM YYYY") : "—"} icon={Calendar} accent="bg-amber-50 text-amber-600" full />
            </div>
          )}

          {/* Section 3: Related Transactions */}
          {tab === "transactions" && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input placeholder="Search…" className="pl-9 h-9 bg-white" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} data-testid="pd-tx-search" />
                </div>
                <SelectField label="" value={filters.type} onChange={(v) => setFilters({ ...filters, type: v })} options={[{ value: "all", label: "All" }, { value: "inward", label: "Inward" }, { value: "outward", label: "Outward" }]} />
                <Input placeholder="Challan…" className="h-9 w-32" value={filters.challan} onChange={(e) => setFilters({ ...filters, challan: e.target.value })} />
                <Input placeholder="Vendor…" className="h-9 w-32" value={filters.vendor} onChange={(e) => setFilters({ ...filters, vendor: e.target.value })} />
                <Input placeholder="Client…" className="h-9 w-32" value={filters.client} onChange={(e) => setFilters({ ...filters, client: e.target.value })} />
                <Input type="date" className="h-9 w-36" value={filters.from_date} onChange={(e) => setFilters({ ...filters, from_date: e.target.value })} />
                <Input type="date" className="h-9 w-36" value={filters.to_date} onChange={(e) => setFilters({ ...filters, to_date: e.target.value })} />
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-sm" data-testid="pd-tx-table">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Date</th>
                        <th className="px-4 py-2 text-left font-semibold">Type</th>
                        <th className="px-4 py-2 text-left font-semibold">Challan</th>
                        <th className="px-4 py-2 text-left font-semibold">Vendor / Client</th>
                        <th className="px-4 py-2 text-right font-semibold">Qty</th>
                        <th className="px-4 py-2 text-center font-semibold">Unit</th>
                        <th className="px-4 py-2 text-left font-semibold">By</th>
                        <th className="px-2 py-2 text-center font-semibold w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.rows.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No matching transactions</td></tr>
                      ) : txns.rows.map((r) => (
                        <tr key={`${r.type}:${r.id}`} className="border-t border-slate-100" data-testid={`pd-tx-row-${r.id}`}>
                          <td className="px-4 py-2 text-xs text-slate-700 tabular-nums">{dayjs(r.date || r.created_at).format("DD MMM YYYY")}</td>
                          <td className="px-4 py-2">
                            {r.type === "Inward"
                              ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"><ArrowDownToLine className="w-2.5 h-2.5 mr-1" /> Inward</Badge>
                              : <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]"><ArrowUpFromLine className="w-2.5 h-2.5 mr-1" /> Outward</Badge>}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <div className="font-mono text-slate-700">{r.reference_number || r.outward_challan_no || "—"}</div>
                            {r.bill_number && <div className="font-mono text-[10px] text-slate-400">Bill {r.bill_number}</div>}
                            {r.attachment_file_id && (
                              <a href={fileUrl(r.attachment_file_id)} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 inline-flex items-center gap-1 hover:underline">
                                {(r.attachment_filename || "").match(/\.(png|jpe?g|webp)$/i) ? <FileImage className="w-3 h-3" /> : <FileText className="w-3 h-3" />} attach
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs">{r.type === "Inward" ? r.source_name : r.client_name || "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-semibold">{r.quantity}</td>
                          <td className="px-4 py-2 text-xs text-center">{r.unit || "Nos"}</td>
                          <td className="px-4 py-2 text-[10px] text-slate-500">{r.created_by_name || "—"}</td>
                          <td className="px-2 py-2 text-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingTxn(r)} data-testid={`pd-tx-edit-${r.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDel(r)} data-testid={`pd-tx-del-${r.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-slate-50/50">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>

      <EditTransactionDialog
        transaction={editingTxn}
        onClose={() => setEditingTxn(null)}
        onSaved={() => { setEditingTxn(null); loadStats(); loadTxns(); onChanged?.(); }}
      />
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete transaction?"
        description={confirmDel ? `${confirmDel.type} · ${confirmDel.product} × ${confirmDel.quantity}. Stock will recalculate.` : ""}
        onConfirm={deleteTxn}
      />
    </Dialog>
  );
}

function StatTile({ label, value, icon: Ic, accent, full }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-4 bg-white ${full ? "md:col-span-3" : ""}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`w-7 h-7 rounded-lg ${accent} flex items-center justify-center`}><Ic className="w-3.5 h-3.5" /></div>
      </div>
      <div className="text-xl font-semibold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>{value}</div>
    </div>
  );
}
