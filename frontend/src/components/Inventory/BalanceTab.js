import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Activity } from "lucide-react";
import { CATEGORY_OPTIONS } from "./_shared";

const STATUS_STYLES = {
  "Normal": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200",
  "Out Of Stock": "bg-red-50 text-red-700 border-red-200",
};

export default function BalanceTab({ products, globalSearch }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const filtered = useMemo(() => {
    const all = (globalSearch || search || "").toLowerCase().trim();
    return products.filter((p) => {
      if (statusFilter !== "all" && p.stock_status !== statusFilter) return false;
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (all) {
        const name = (p.name || "").toLowerCase();
        const size = (p.size || "").toLowerCase();
        const brand = (p.brand || "").toLowerCase();
        const category = (p.category || "").toLowerCase();
        const challan = (p.challan_number || p.challan || p.reference_number || "").toLowerCase();
        const sku = (p.sku || p.code || p.product_code || "").toLowerCase();

        const match =
          name.includes(all) ||
          size.includes(all) ||
          brand.includes(all) ||
          category.includes(all) ||
          challan.includes(all) ||
          sku.includes(all);

        if (!match) return false;
      }
      return true;
    });
  }, [products, search, statusFilter, categoryFilter, globalSearch]);

  const totals = useMemo(() => filtered.reduce((acc, p) => {
    acc.in += p.total_in || 0;
    acc.out += p.total_out || 0;
    acc.bal += p.balance || 0;
    if (p.stock_status === "Low Stock") acc.low += 1;
    if (p.stock_status === "Out Of Stock") acc.out_stock += 1;
    return acc;
  }, { in: 0, out: 0, bal: 0, low: 0, out_stock: 0 }), [filtered]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="border-slate-200">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Search product / size / category…" className="pl-9 border-none focus-visible:ring-0" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="bal-search" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44" data-testid="bal-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Out Of Stock">Out Of Stock</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48" data-testid="bal-cat-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 ml-auto text-xs text-slate-500">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">In: {totals.in}</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Out: {totals.out}</Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold">Bal: {totals.bal}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Balance Report</div>
              <div className="text-xs text-slate-500">{filtered.length} products · {totals.low} low · {totals.out_stock} out of stock</div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm" data-testid="balance-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Size</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total Inward</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total Outward</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Balance</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Min</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    <Activity className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    No products match filters
                  </td></tr>
                ) : filtered.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100" data-testid={`balance-row-${p.id}`}>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      {p.size && <div className="text-[10px] text-slate-400 mt-0.5">{p.size}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{p.size || "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px]">{p.category || "Solar"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-medium">{p.total_in || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-amber-700 font-medium">{p.total_out || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900">{p.balance}{" "}<span className="text-[10px] text-slate-500 font-normal">{p.unit || "Nos"}</span></td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-500">{p.min_stock || 0}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[p.stock_status] || ""} text-[10px]`}>{p.stock_status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
