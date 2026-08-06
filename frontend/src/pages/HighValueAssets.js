import React, { useEffect, useState, useMemo } from "react";
import { useHighValueLedger } from "@/hooks/useAssets";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, ShieldCheck, ArrowUpRight, ArrowDownLeft, RotateCcw, Package, Download, Filter, Copy, History, Eye, FileText } from "lucide-react";

export default function HighValueAssets() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serials, setSerials] = useState([]);
  const [loadingSerials, setLoadingSerials] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchSerials = React.useCallback(async () => {
    setLoadingSerials(true);
    try {
      const { data } = await api.get("/assets", { params: { search: debouncedSearch } });
      setSerials(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoadingSerials(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    if (tab === "serials") {
      fetchSerials();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, fetchSerials]);

  const handleOpenHistory = async (asset) => {
    setSelectedAsset(asset);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const pName = asset.product_name || asset.product || "";
      const { data } = await api.get("/inventory/history", { params: { product: pName } });
      setHistoryRecords(Array.isArray(data.records) ? data.records : (Array.isArray(data) ? data : []));
    } catch (e) {
      toast.error("Failed to load transaction history");
    } finally {
      setLoadingHistory(false);
    }
  };
  const [stockFilter, setStockFilter] = useState("all"); // "all" | "normal" | "low" | "out_of_stock"

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: ledger, isLoading: loading } = useHighValueLedger(debouncedSearch);

  const rawAllGoods = ledger.all_goods || [];
  const availableGoods = ledger.available || [];
  const dispatchedTransactions = ledger.dispatched || [];
  const returnedTransactions = ledger.returned || [];

  // Filter & Sort All Goods based on Stock Status (All / Normal Stock / Low Stock / Out Of Stock) and Product Name A -> Z
  const filteredAllGoods = useMemo(() => {
    let list = Array.isArray(ledger?.all_goods) ? [...ledger.all_goods] : [];

    // Stock status filtering
    if (stockFilter === "normal") {
      list = list.filter((r) => r.available_qty > (r.minimum_stock || 0));
    } else if (stockFilter === "low") {
      list = list.filter((r) => r.available_qty > 0 && r.available_qty <= (r.minimum_stock || 0));
    } else if (stockFilter === "out_of_stock") {
      list = list.filter((r) => r.available_qty <= 0);
    }

    // Always sort Product Name Ascending (A -> Z) using locale-aware comparison
    list.sort((a, b) => (a.product || "").localeCompare(b.product || "", undefined, { sensitivity: "base", numeric: true }));

    return list;
  }, [ledger?.all_goods, stockFilter]);

  const handleExportCSV = () => {
    let headers = [];
    let rows = [];
    let filename = "High_Value_Goods.csv";

    if (tab === "all") {
      if (!filteredAllGoods || filteredAllGoods.length === 0) {
        toast.error("No High Value Goods data matching the selected filter to export");
        return;
      }
      const filterSuffix = stockFilter === "low" ? "_Low_Stock" : stockFilter === "out_of_stock" ? "_Out_Of_Stock" : stockFilter === "normal" ? "_Normal_Stock" : "_All";
      filename = `High_Value_Goods${filterSuffix}.csv`;
      headers = ["Product Name", "Size / Spec", "Total Inward", "Total Outward", "Returned", "Available Qty", "Min Stock", "Unit", "Last Movement", "Status"];
      rows = filteredAllGoods.map((row) => [
        `"${(row.product || "").replace(/"/g, '""')}"`,
        `"${(row.size || "").replace(/"/g, '""')}"`,
        row.total_in || 0,
        row.total_out || 0,
        row.returned || 0,
        row.available_qty || 0,
        row.minimum_stock || 0,
        `"${(row.unit || "Nos").replace(/"/g, '""')}"`,
        `"${(row.last_movement || "").replace(/"/g, '""')}"`,
        `"${(row.status || "").replace(/"/g, '""')}"`
      ]);
    } else if (tab === "available") {
      if (!availableGoods || availableGoods.length === 0) {
        toast.error("No available High Value Goods to export");
        return;
      }
      filename = "High_Value_Goods_Available.csv";
      headers = ["Product Name", "Size / Spec", "Available Qty", "Unit", "Last Inward", "Challan / Vendor", "Status"];
      rows = availableGoods.map((row) => [
        `"${(row.product || "").replace(/"/g, '""')}"`,
        `"${(row.size || "").replace(/"/g, '""')}"`,
        row.available_qty || 0,
        `"${(row.unit || "Nos").replace(/"/g, '""')}"`,
        `"${(row.last_inward || "").replace(/"/g, '""')}"`,
        `"${(row.challan_vendor || "").replace(/"/g, '""')}"`,
        `"${(row.status || "Available").replace(/"/g, '""')}"`
      ]);
    } else if (tab === "dispatched") {
      if (!dispatchedTransactions || dispatchedTransactions.length === 0) {
        toast.error("No dispatched High Value Goods to export");
        return;
      }
      filename = "High_Value_Goods_Dispatched.csv";
      headers = ["Date", "Product Name", "Size / Spec", "Quantity", "Unit", "Challan No.", "Client / Project", "Site", "Requested By / Issued To", "Reference", "Status"];
      rows = dispatchedTransactions.map((row) => [
        `"${(row.date || "").replace(/"/g, '""')}"`,
        `"${(row.product || "").replace(/"/g, '""')}"`,
        `"${(row.size || "").replace(/"/g, '""')}"`,
        row.quantity || 0,
        `"${(row.unit || "Nos").replace(/"/g, '""')}"`,
        `"${(row.challan_number || "").replace(/"/g, '""')}"`,
        `"${(row.client_name || "").replace(/"/g, '""')}"`,
        `"${(row.site || "").replace(/"/g, '""')}"`,
        `"${(row.requested_by || "").replace(/"/g, '""')}"`,
        `"${(row.reference || "").replace(/"/g, '""')}"`,
        `"${(row.status || "Dispatched").replace(/"/g, '""')}"`
      ]);
    } else if (tab === "returned") {
      if (!returnedTransactions || returnedTransactions.length === 0) {
        toast.error("No returned High Value Goods to export");
        return;
      }
      filename = "High_Value_Goods_Returned.csv";
      headers = ["Return Date", "Product Name", "Size / Spec", "Quantity", "Unit", "Client / Project", "Site", "Original Challan", "Return Reason / Remark", "Status"];
      rows = returnedTransactions.map((row) => [
        `"${(row.return_date || "").replace(/"/g, '""')}"`,
        `"${(row.product || "").replace(/"/g, '""')}"`,
        `"${(row.size || "").replace(/"/g, '""')}"`,
        row.quantity || 0,
        `"${(row.unit || "Nos").replace(/"/g, '""')}"`,
        `"${(row.client_name || "").replace(/"/g, '""')}"`,
        `"${(row.site || "").replace(/"/g, '""')}"`,
        `"${(row.original_challan || "").replace(/"/g, '""')}"`,
        `"${(row.return_reason || "").replace(/"/g, '""')}"`,
        `"${(row.status || "Returned").replace(/"/g, '""')}"`
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("High Value Goods data exported successfully");
  };

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
        <Button
          variant="outline"
          size="sm"
          className="border-slate-300 text-slate-700 hover:bg-slate-50 h-9 shrink-0"
          onClick={handleExportCSV}
          data-testid="hv-download-btn"
        >
          <Download className="w-4 h-4 mr-1.5 text-blue-600" /> Export CSV
        </Button>
      </div>

      {/* Tabs + Stock Filter + Search Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 w-full md:w-auto">
          {[
            { id: "all", label: "All Goods", count: filteredAllGoods.length },
            { id: "available", label: "Available", count: availableGoods.length },
            { id: "dispatched", label: "Dispatched", count: dispatchedTransactions.length },
            { id: "returned", label: "Returned", count: returnedTransactions.length },
            { id: "serials", label: "Serial Tracking", count: serials.length }
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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
          {/* Stock Filter Sub-Pills (Shown when Tab === 'all') */}
          {tab === "all" && (
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium shrink-0">
              {[
                { id: "all", label: "All Stock" },
                { id: "normal", label: "Normal Stock" },
                { id: "low", label: "Low Stock" },
                { id: "out_of_stock", label: "Out Of Stock" }
              ].map((sf) => (
                <button
                  key={sf.id}
                  onClick={() => setStockFilter(sf.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    stockFilter === sf.id
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  data-testid={`stock-filter-${sf.id}`}
                >
                  {sf.label}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search product, size, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white text-xs h-9"
              data-testid="hv-search-input"
            />
          </div>
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
                    <th className="p-4 font-semibold">Product (A-Z)</th>
                    <th className="p-4 font-semibold">Size / Spec</th>
                    <th className="p-4 font-semibold text-center">Total Inward</th>
                    <th className="p-4 font-semibold text-center">Total Outward</th>
                    <th className="p-4 font-semibold text-center">Returned</th>
                    <th className="p-4 font-semibold text-center">Available Qty</th>
                    <th className="p-4 font-semibold text-center">Min Stock</th>
                    <th className="p-4 font-semibold">Last Movement</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-500 text-xs">Loading live High Value Goods ledger...</td></tr>
                  ) : filteredAllGoods.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No high value products matching the selected stock filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAllGoods.map((row) => {
                      const isOut = row.available_qty <= 0;
                      const isLow = !isOut && row.available_qty <= (row.minimum_stock || 0);
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-4 font-semibold text-slate-900 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{row.product}</span>
                          </td>
                          <td className="p-4 text-slate-700 text-xs font-mono">{row.size || "—"}</td>
                          <td className="p-4 text-center font-medium text-slate-800">{row.total_in} {row.unit}</td>
                          <td className="p-4 text-center font-medium text-slate-800">{row.total_out} {row.unit}</td>
                          <td className="p-4 text-center font-medium text-emerald-700">{row.returned} {row.unit}</td>
                          <td className="p-4 text-center font-bold text-base">
                            <span className={isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-700"}>
                              {row.available_qty} {row.unit}
                            </span>
                          </td>
                          <td className="p-4 text-center text-xs text-slate-500">{row.minimum_stock || 0} {row.unit}</td>
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
                              isOut ? "bg-red-50 text-red-700 border-red-200" : isLow ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}>
                              {isOut ? "Out Of Stock" : isLow ? "Low Stock" : "Normal Stock"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}

            {/* TAB 2: AVAILABLE */}
            {tab === "available" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product (A-Z)</th>
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
                    <th className="p-4 font-semibold">Size / Spec</th>
                    <th className="p-4 font-semibold text-center">Dispatched Qty</th>
                    <th className="p-4 font-semibold">Challan No.</th>
                    <th className="p-4 font-semibold">Client / Project</th>
                    <th className="p-4 font-semibold">Site / Location</th>
                    <th className="p-4 font-semibold">Requested By</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={9} className="p-8 text-center text-slate-500 text-xs">Loading dispatched goods...</td></tr>
                  ) : dispatchedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No High Value Goods outward/dispatch transactions found.
                      </td>
                    </tr>
                  ) : (
                    dispatchedTransactions.map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-xs font-mono text-slate-600">{row.date}</td>
                        <td className="p-4 font-semibold text-slate-900">{row.product}</td>
                        <td className="p-4 text-slate-700 text-xs font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-bold text-blue-700">{row.quantity} {row.unit}</td>
                        <td className="p-4 text-xs font-mono text-slate-700">{row.challan_number}</td>
                        <td className="p-4 text-xs font-medium text-slate-900">{row.client_name}</td>
                        <td className="p-4 text-xs text-slate-600">{row.site}</td>
                        <td className="p-4 text-xs text-slate-600">{row.requested_by}</td>
                        <td className="p-4 text-right">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200">
                            Dispatched
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
                    <th className="p-4 font-semibold">Size / Spec</th>
                    <th className="p-4 font-semibold text-center">Returned Qty</th>
                    <th className="p-4 font-semibold">Client / Project</th>
                    <th className="p-4 font-semibold">Original Challan</th>
                    <th className="p-4 font-semibold">Reason / Remark</th>
                    <th className="p-4 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-slate-500 text-xs">Loading returned goods...</td></tr>
                  ) : returnedTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No High Value Goods return transactions found.
                      </td>
                    </tr>
                  ) : (
                    returnedTransactions.map((row, idx) => (
                      <tr key={row.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-xs font-mono text-slate-600">{row.return_date}</td>
                        <td className="p-4 font-semibold text-slate-900">{row.product}</td>
                        <td className="p-4 text-slate-700 text-xs font-mono">{row.size || "—"}</td>
                        <td className="p-4 text-center font-bold text-emerald-700">{row.quantity} {row.unit}</td>
                        <td className="p-4 text-xs font-medium text-slate-900">{row.client_name}</td>
                        <td className="p-4 text-xs font-mono text-slate-700">{row.original_challan}</td>
                        <td className="p-4 text-xs text-slate-600">{row.return_reason}</td>
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

            {/* TAB 5: SERIAL TRACKING */}
            {tab === "serials" && (
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Serial Number</th>
                    <th className="p-4 font-semibold">Product & Spec</th>
                    <th className="p-4 font-semibold">Current Site</th>
                    <th className="p-4 font-semibold">Current Status</th>
                    <th className="p-4 font-semibold">Allocated Client</th>
                    <th className="p-4 font-semibold">Transaction Date</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingSerials ? (
                    <tr><td colSpan={7} className="p-8 text-center text-slate-500 text-xs">Loading serial tracking...</td></tr>
                  ) : serials.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No high value serial number records found.
                      </td>
                    </tr>
                  ) : (
                    serials.map((asset, idx) => (
                      <tr key={asset.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-4 text-xs font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{asset.serial_number || "—"}</span>
                            {asset.serial_number && (
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(asset.serial_number);
                                  toast.success("Serial number copied");
                                }}
                                className="text-slate-400 hover:text-blue-600 p-0.5 rounded"
                                title="Copy Serial Number"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-4 font-semibold text-slate-900">
                          <div>{asset.product_name || asset.product}</div>
                          {asset.size_model && <div className="text-[10px] text-slate-400 font-normal">{asset.size_model}</div>}
                        </td>
                        <td className="p-4 text-xs text-slate-700">{asset.site_location || asset.site || "Warehouse"}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                            asset.status === "Installed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                            asset.status === "Available" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            asset.status === "Dispatched" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }`}>
                            {asset.status || "Available"}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-medium text-slate-900">{asset.client_name || "Unallocated"}</td>
                        <td className="p-4 text-xs font-mono text-slate-600">{asset.installation_date || asset.purchase_date || (asset.created_at ? asset.created_at.slice(0, 10) : "—")}</td>
                        <td className="p-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenHistory(asset)}
                            className="h-7 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                          >
                            <History className="w-3.5 h-3.5 mr-1 text-amber-600" /> Related History
                          </Button>
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

      {/* Related Transactions Modal */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              Related Transactions History
            </DialogTitle>
            {selectedAsset && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{selectedAsset.product_name || selectedAsset.product}</b> | Serial: <b className="font-mono text-slate-800">{selectedAsset.serial_number || "N/A"}</b>
              </p>
            )}
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {loadingHistory ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading related transaction history...</div>
            ) : historyRecords.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No related inward/outward history records found.</div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                      <th className="p-3 font-semibold">Date</th>
                      <th className="p-3 font-semibold">Type</th>
                      <th className="p-3 font-semibold">Source / Client</th>
                      <th className="p-3 font-semibold text-center">Qty</th>
                      <th className="p-3 font-semibold">Challan / Bill</th>
                      <th className="p-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyRecords.map((rec, i) => (
                      <tr key={rec.id || i} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-slate-600">{(rec.date || rec.created_at || "").slice(0, 10)}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            (rec.type || "").toLowerCase() === "inward" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}>
                            {rec.type || rec.entry_type || "Transaction"}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-800">{rec.source_name || rec.client_name || rec.vendor || "—"}</td>
                        <td className="p-3 text-center font-bold text-slate-900">{rec.quantity || 1}</td>
                        <td className="p-3 font-mono text-slate-600">{rec.reference_number || rec.bill_number || "—"}</td>
                        <td className="p-3 text-slate-600">{rec.status || "Completed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
