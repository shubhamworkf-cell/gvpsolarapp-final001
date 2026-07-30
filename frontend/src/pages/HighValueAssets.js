import React, { useEffect, useState, useMemo } from "react";
import { useHighValueLedger } from "@/hooks/useAssets";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldCheck, ArrowUpRight, ArrowDownLeft, RotateCcw, Package } from "lucide-react";

export default function HighValueAssets() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tab, setTab] = useState("all");

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: ledger, isLoading: loading } = useHighValueLedger(debouncedSearch);

  const allGoods = ledger.all_goods || [];
  const availableGoods = ledger.available || [];
  const dispatchedTransactions = ledger.dispatched || [];
  const returnedTransactions = ledger.returned || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>High Value Goods Ledger</h2>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs">Live Inventory View</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">Real-time inventory tracking for high-value materials synchronized with Balance Sheet & Product Master.</p>
        </div>
      </div>

      {/* Tabs + Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 w-full md:w-auto">
          {[
            { id: "all", label: "All Goods", count: allGoods.length },
            { id: "available", label: "Available", count: availableGoods.length },
            { id: "dispatched", label: "Dispatched", count: dispatchedTransactions.length },
            { id: "returned", label: "Returned", count: returnedTransactions.length }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-[2px] transition flex items-center gap-1.5 ${
                tab === t.id
                  ? "border-amber-600 text-amber-900 font-bold"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
              data-testid={`tab-${t.id}`}
            >
              <span>{t.label}</span>
              <Badge variant="outline" className={`ml-1 text-[10px] px-1.5 py-0 ${tab === t.id ? "bg-amber-100 text-amber-900 border-amber-300" : "bg-slate-100 text-slate-600"}`}>
                {t.count}
              </Badge>
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search product, size, client, challan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white text-xs h-9"
            data-testid="hv-search-input"
          />
        </div>
      </div>

      {/* Content Table Card */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">

            {/* TAB 1: ALL GOODS */}
            {tab === "all" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product</th>
                    <th className="p-4 font-semibold">Size / Spec</th>
                    <th className="p-4 font-semibold text-center">Total Inward</th>
                    <th className="p-4 font-semibold text-center">Total Outward</th>
                    <th className="p-4 font-semibold text-center">Returned</th>
                    <th className="p-4 font-semibold text-center">Available Qty</th>
                    <th className="p-4 font-semibold">Last Movement</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-slate-500 text-xs">Loading live High Value Goods ledger...</td></tr>
                  ) : allGoods.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No high value products found in Product Master. Mark products as High Value in Product Master to track them here.
                      </td>
                    </tr>
                  ) : (
                    allGoods.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-semibold text-slate-900 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{row.product}</span>
                        </td>
                        <td className="p-4 text-slate-700 text-xs font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-medium text-slate-800">{row.total_in} {row.unit}</td>
                        <td className="p-4 text-center font-medium text-slate-800">{row.total_out} {row.unit}</td>
                        <td className="p-4 text-center font-medium text-emerald-700">{row.returned} {row.unit}</td>
                        <td className="p-4 text-center font-bold text-slate-900 text-base">
                          <span className={row.available_qty > 0 ? "text-slate-900" : "text-red-500"}>
                            {row.available_qty} {row.unit}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            {row.last_movement.includes("Outward") ? (
                              <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            ) : row.last_movement.includes("Inward") ? (
                              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ) : null}
                            <span>{row.last_movement}</span>
                          </div>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            row.status === "Available" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 2: AVAILABLE */}
            {tab === "available" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product</th>
                    <th className="p-4 font-semibold">Size / Spec</th>
                    <th className="p-4 font-semibold text-center">Available Qty</th>
                    <th className="p-4 font-semibold">Last Inward</th>
                    <th className="p-4 font-semibold">Challan / Vendor</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-500 text-xs">Loading available high value goods...</td></tr>
                  ) : availableGoods.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No available High Value Goods in stock.
                      </td>
                    </tr>
                  ) : (
                    availableGoods.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 font-semibold text-slate-900 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{row.product}</span>
                        </td>
                        <td className="p-4 text-slate-700 text-xs font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-bold text-emerald-700 text-base">{row.available_qty} {row.unit}</td>
                        <td className="p-4 text-xs text-slate-700">{row.last_inward || "—"}</td>
                        <td className="p-4 text-xs text-slate-700 font-medium">{row.challan_vendor}</td>
                        <td className="p-4 text-right">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Available
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 3: DISPATCHED */}
            {tab === "dispatched" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Date</th>
                    <th className="p-4 font-semibold">Product</th>
                    <th className="p-4 font-semibold">Size</th>
                    <th className="p-4 font-semibold text-center">Qty</th>
                    <th className="p-4 font-semibold">Challan No.</th>
                    <th className="p-4 font-semibold">Client / Project</th>
                    <th className="p-4 font-semibold">Site</th>
                    <th className="p-4 font-semibold">Requested By / Issued To</th>
                    <th className="p-4 font-semibold">Reference</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={10} className="p-8 text-center text-slate-500 text-xs">Loading dispatch history...</td></tr>
                  ) : dispatchedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-500 text-xs">
                        <ArrowUpRight className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No High Value Goods outward/dispatch transactions found.
                      </td>
                    </tr>
                  ) : (
                    dispatchedTransactions.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-xs font-medium text-slate-700">{row.date}</td>
                        <td className="p-4 font-semibold text-slate-900">{row.product}</td>
                        <td className="p-4 text-xs text-slate-600 font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-bold text-blue-700">{row.quantity} {row.unit}</td>
                        <td className="p-4 text-xs font-mono font-medium text-slate-800">{row.challan_number}</td>
                        <td className="p-4 text-xs font-semibold text-slate-900">{row.client_name}</td>
                        <td className="p-4 text-xs text-slate-600">{row.site}</td>
                        <td className="p-4 text-xs text-slate-700">{row.requested_by}</td>
                        <td className="p-4 text-xs text-slate-500 truncate max-w-[140px]">{row.reference}</td>
                        <td className="p-4 text-right">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 4: RETURNED */}
            {tab === "returned" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Return Date</th>
                    <th className="p-4 font-semibold">Product</th>
                    <th className="p-4 font-semibold">Size</th>
                    <th className="p-4 font-semibold text-center">Qty</th>
                    <th className="p-4 font-semibold">Client / Project</th>
                    <th className="p-4 font-semibold">Site</th>
                    <th className="p-4 font-semibold">Original Challan</th>
                    <th className="p-4 font-semibold">Return Reason / Remark</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-500 text-xs">Loading return history...</td></tr>
                  ) : returnedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                        <RotateCcw className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No High Value Goods return transactions found.
                      </td>
                    </tr>
                  ) : (
                    returnedTransactions.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-xs font-medium text-slate-700">{row.return_date}</td>
                        <td className="p-4 font-semibold text-slate-900">{row.product}</td>
                        <td className="p-4 text-xs text-slate-600 font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-bold text-emerald-700">{row.quantity} {row.unit}</td>
                        <td className="p-4 text-xs font-semibold text-slate-900">{row.client_name}</td>
                        <td className="p-4 text-xs text-slate-600">{row.site}</td>
                        <td className="p-4 text-xs font-mono text-slate-800">{row.original_challan}</td>
                        <td className="p-4 text-xs text-slate-600 truncate max-w-[160px]">{row.return_reason}</td>
                        <td className="p-4 text-right">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200">
                            Returned
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
}

