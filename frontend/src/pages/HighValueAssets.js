import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  ShieldCheck,
  Package,
  Download,
  Copy,
  History,
  Pencil,
  Eye,
  MapPin,
  User,
  CheckCircle2
} from "lucide-react";

export default function HighValueAssets() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Assets list
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [productPopupItem, setProductPopupItem] = useState(null);
  const [timelineAsset, setTimelineAsset] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  const [editAsset, setEditAsset] = useState(null);
  const [editForm, setEditForm] = useState({ serial_number: "", site_location: "", remarks: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch all serial tracking assets
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/assets", { params: { search: debouncedSearch } });
      setAssets(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Filtered Assets list
  const filteredAssets = useMemo(() => {
    let list = [...assets];
    if (statusFilter !== "all") {
      list = list.filter(
        (a) => (a.status || "Available").toLowerCase() === statusFilter.toLowerCase()
      );
    }
    return list;
  }, [assets, statusFilter]);

  // Group assets by product for Product Popup calculation
  const productSummaryMap = useMemo(() => {
    const map = {};
    assets.forEach((a) => {
      const name = a.product_name || a.product || "Unknown Product";
      if (!map[name]) {
        map[name] = {
          name,
          spec: a.size_model || a.size || "—",
          category: a.category || "Solar Equipment",
          total: 0,
          available: 0,
          installed: 0,
          items: []
        };
      }
      map[name].total += 1;
      if ((a.status || "Available") === "Available") map[name].available += 1;
      if ((a.status || "") === "Installed") map[name].installed += 1;
      map[name].items.push(a);
    });
    return map;
  }, [assets]);

  // Handle Copy Serial
  const handleCopySerial = (sn) => {
    if (!sn) return;
    navigator.clipboard.writeText(sn);
    toast.success(`Copied serial number: ${sn}`);
  };

  // Open Serial Timeline Popup
  const handleOpenTimeline = async (asset) => {
    setTimelineAsset(asset);
    setLoadingTimeline(true);
    setTimelineEvents([]);
    try {
      const pName = asset.product_name || asset.product || "";
      const { data } = await api.get("/inventory/history", { params: { product: pName } });
      const rawRecords = Array.isArray(data.records) ? data.records : (Array.isArray(data) ? data : []);

      // Filter timeline events matching asset's serial number or purchase/inward record
      const sn = (asset.serial_number || "").toUpperCase();
      const events = [];

      // 1. Inward Event
      events.push({
        type: "Inward",
        title: "Inward Entry Recorded",
        date: asset.purchase_date || asset.inward_date || asset.created_at || "—",
        site: "Central Warehouse",
        client: asset.vendor || "Supplier",
        detail: `Challan / Bill: ${asset.challan_number || "N/A"}`
      });

      // 2. Client Allocation / Installation Event
      if (asset.client_name || asset.status === "Installed" || asset.status === "Dispatched") {
        events.push({
          type: asset.status === "Installed" ? "Installed" : "Allocated",
          title: asset.status === "Installed" ? "Installed at Client Site" : "Outward Dispatched to Client",
          date: asset.installation_date || asset.last_movement_date || "—",
          site: asset.site_location || asset.client_name || "Client Site",
          client: asset.client_name || "Client",
          detail: `Serial #${sn} allocated to project`
        });
      }

      // 3. Check extra history records from ledger
      rawRecords.forEach((rec) => {
        const recType = (rec.type || rec.entry_type || "").toLowerCase();
        if (recType.includes("transfer") || recType.includes("return")) {
          events.push({
            type: recType.includes("return") ? "Returned" : "Transferred",
            title: recType.includes("return") ? "Material Returned to Stock" : "Site-to-Site Transfer",
            date: (rec.date || rec.created_at || "").slice(0, 10),
            site: rec.site || rec.location || "Site Location",
            client: rec.client_name || rec.source_name || "Client",
            detail: rec.remarks || rec.reference_number || "Movement logged"
          });
        }
      });

      events.sort((a, b) => new Date(a.date) - new Date(b.date));
      setTimelineEvents(events);
    } catch (e) {
      toast.error("Failed to load serial movement timeline");
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Open Edit Asset Modal
  const handleOpenEdit = (asset) => {
    setEditAsset(asset);
    setEditForm({
      serial_number: asset.serial_number || "",
      site_location: asset.site_location || asset.site || "",
      remarks: asset.remarks || asset.asset_remarks || ""
    });
  };

  // Save Edit Asset
  const handleSaveEdit = async () => {
    if (!editAsset) return;
    setSavingEdit(true);
    try {
      await api.patch(`/assets/${editAsset.id}`, editForm);
      toast.success("Serial & Site details updated");
      setEditAsset(null);
      fetchAssets();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingEdit(false);
    }
  };

  // Export Serial List to CSV
  const handleExportCSV = () => {
    if (!filteredAssets || filteredAssets.length === 0) {
      toast.error("No serial tracking data to export");
      return;
    }
    const headers = ["Serial Number", "Product Name", "Size / Spec", "Current Status", "Current Site", "Allocated Client", "Date"];
    const rows = filteredAssets.map((a) => [
      `"${(a.serial_number || "").replace(/"/g, '""')}"`,
      `"${(a.product_name || a.product || "").replace(/"/g, '""')}"`,
      `"${(a.size_model || "").replace(/"/g, '""')}"`,
      `"${(a.status || "Available").replace(/"/g, '""')}"`,
      `"${(a.site_location || "Warehouse").replace(/"/g, '""')}"`,
      `"${(a.client_name || "Unallocated").replace(/"/g, '""')}"`,
      `"${(a.installation_date || a.purchase_date || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Serial_Tracking_${statusFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAssets.length} serial records`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>High Value Goods</h2>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Serial Tracking Ledger
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Single source of truth for individual High Value serial numbers, sites, client allocations, and movement timelines.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-slate-300 text-slate-700 hover:bg-slate-50 h-9 shrink-0"
          onClick={handleExportCSV}
          data-testid="hv-download-btn"
        >
          <Download className="w-4 h-4 mr-1.5 text-blue-600" /> Export Serial CSV
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          {[
            { id: "all", label: "All Statuses", count: assets.length },
            { id: "available", label: "Available", count: assets.filter(a => (a.status || "Available") === "Available").length },
            { id: "installed", label: "Installed", count: assets.filter(a => a.status === "Installed").length },
            { id: "dispatched", label: "Dispatched", count: assets.filter(a => a.status === "Dispatched").length },
            { id: "returned", label: "Returned", count: assets.filter(a => a.status === "Returned").length },
            { id: "scrapped", label: "Scrapped", count: assets.filter(a => a.status === "Scrapped").length }
          ].map((sf) => (
            <button
              key={sf.id}
              onClick={() => setStatusFilter(sf.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                statusFilter === sf.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
              data-testid={`status-filter-${sf.id}`}
            >
              <span>{sf.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${statusFilter === sf.id ? "bg-slate-800 text-slate-200" : "bg-slate-200 text-slate-700"}`}>
                {sf.count}
              </span>
            </button>
          ))}
        </div>

        {/* Global Search Input */}
        <div className="relative w-full sm:w-80 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search Serial Number, Client, Site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white text-xs h-9"
            data-testid="hv-search-input"
          />
        </div>
      </div>

      {/* Main Serial Ledger Table */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Serial Number</th>
                  <th className="p-4 font-semibold">Product Name & Spec</th>
                  <th className="p-4 font-semibold">Current Status</th>
                  <th className="p-4 font-semibold">Current Site</th>
                  <th className="p-4 font-semibold">Allocated Client</th>
                  <th className="p-4 font-semibold">Last Movement / Date</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                      Loading high-value serial tracking ledger...
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                      <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      No serial tracking records found matching the filter.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset, idx) => {
                    const pName = asset.product_name || asset.product || "Unknown Product";
                    const summary = productSummaryMap[pName];

                    return (
                      <tr key={asset.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        {/* Serial Number + Copy */}
                        <td className="p-4 font-mono font-bold text-slate-900 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span>{asset.serial_number || "—"}</span>
                            {asset.serial_number && (
                              <button
                                type="button"
                                onClick={() => handleCopySerial(asset.serial_number)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                                title="Copy Serial Number"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Product & Spec */}
                        <td className="p-4">
                          <button
                            type="button"
                            onClick={() => setProductPopupItem(summary || { name: pName, spec: asset.size_model || "—", items: [asset] })}
                            className="font-semibold text-slate-900 hover:text-blue-600 text-left hover:underline block"
                          >
                            {pName}
                          </button>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {asset.size_model || asset.size || "—"}
                          </div>
                        </td>

                        {/* Current Status */}
                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                              asset.status === "Installed"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : asset.status === "Available"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : asset.status === "Dispatched"
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {asset.status || "Available"}
                          </span>
                        </td>

                        {/* Current Site */}
                        <td className="p-4 text-xs text-slate-700">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{asset.site_location || (asset.client_name ? `${asset.client_name} Site` : "Warehouse")}</span>
                          </div>
                        </td>

                        {/* Allocated Client */}
                        <td className="p-4 text-xs font-medium text-slate-900">
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{asset.client_name || "Unallocated"}</span>
                          </div>
                        </td>

                        {/* Last Movement Date */}
                        <td className="p-4 text-xs font-mono text-slate-600">
                          {asset.installation_date || asset.purchase_date || (asset.created_at ? asset.created_at.slice(0, 10) : "—")}
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setProductPopupItem(summary || { name: pName, spec: asset.size_model || "—", items: [asset] })}
                              className="h-7 px-2 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                              title="View Product Popup"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> Product
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenTimeline(asset)}
                              className="h-7 px-2 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                              title="View Serial History Timeline"
                            >
                              <History className="w-3.5 h-3.5 mr-1 text-amber-600" /> History
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(asset)}
                              className="h-7 px-2 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                              title="Edit Serial & Site"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ONE PRODUCT POPUP MODAL */}
      <Dialog open={!!productPopupItem} onOpenChange={(open) => !open && setProductPopupItem(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {productPopupItem && (
            <div className="space-y-4">
              {/* Header: Product Name, Spec, Current Balance, Category, High Value Badge */}
              <div className="border-b border-slate-200 pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>
                      {productPopupItem.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      <span className="text-xs font-mono font-medium text-slate-600">
                        Spec: {productPopupItem.spec}
                      </span>
                      <span className="text-slate-300">•</span>
                      <Badge className="bg-blue-100 text-blue-800 border-blue-200 font-semibold text-xs">
                        {productPopupItem.category || "Solar Equipment"}
                      </Badge>
                      <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs">
                        High Value Goods
                      </Badge>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-lg text-right">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Current Balance</div>
                    <div className="text-lg font-bold text-emerald-700 font-mono">
                      {productPopupItem.available ?? productPopupItem.items?.length ?? 0} Nos
                    </div>
                  </div>
                </div>
              </div>

              {/* Serial Number Ledger Table */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Serial Number Ledger ({productPopupItem.items?.length || 0} tracked serials)
                </h4>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <th className="p-3 font-semibold">Serial Number</th>
                        <th className="p-3 font-semibold">Current Status</th>
                        <th className="p-3 font-semibold">Current Site</th>
                        <th className="p-3 font-semibold">Allocated Client</th>
                        <th className="p-3 font-semibold">Last Transaction</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(!productPopupItem.items || productPopupItem.items.length === 0) ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                            No serial number entries registered for this product.
                          </td>
                        </tr>
                      ) : (
                        productPopupItem.items.map((sub, i) => (
                          <tr key={sub.id || i} className="hover:bg-slate-50/50">
                            <td className="p-3 font-mono font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{sub.serial_number || "—"}</span>
                                {sub.serial_number && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopySerial(sub.serial_number)}
                                    className="text-slate-400 hover:text-blue-600 p-0.5 rounded"
                                    title="Copy Serial Number"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                sub.status === "Installed" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                sub.status === "Available" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                "bg-slate-100 text-slate-700 border-slate-200"
                              }`}>
                                {sub.status || "Available"}
                              </span>
                            </td>
                            <td className="p-3 text-slate-700">{sub.site_location || "Warehouse"}</td>
                            <td className="p-3 font-medium text-slate-900">{sub.client_name || "Unallocated"}</td>
                            <td className="p-3 font-mono text-slate-600">{sub.installation_date || sub.purchase_date || "—"}</td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenTimeline(sub)}
                                  className="h-6 px-2 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-50"
                                >
                                  History
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenEdit(sub)}
                                  className="h-6 px-2 text-[11px] border-slate-300 text-slate-700 hover:bg-slate-50"
                                >
                                  Edit
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setProductPopupItem(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* SERIAL HISTORY TIMELINE MODAL */}
      <Dialog open={!!timelineAsset} onOpenChange={(open) => !open && setTimelineAsset(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              Serial Movement Timeline
            </DialogTitle>
            {timelineAsset && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{timelineAsset.product_name || timelineAsset.product}</b> | Serial: <b className="font-mono text-slate-900">{timelineAsset.serial_number || "N/A"}</b>
              </p>
            )}
          </DialogHeader>

          <div className="py-4">
            {loadingTimeline ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading movement timeline...</div>
            ) : timelineEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">No movement events logged for this serial number.</div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timelineEvents.map((ev, idx) => (
                  <div key={idx} className="relative flex items-start gap-4">
                    <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                      ev.type === "Inward" ? "border-emerald-500 text-emerald-600" :
                      ev.type === "Installed" || ev.type === "Allocated" ? "border-blue-500 text-blue-600" :
                      "border-amber-500 text-amber-600"
                    }`}>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 w-full space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">{ev.title}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {ev.date}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1 pt-1">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" /> {ev.site}
                        </span>
                        {ev.client && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" /> {ev.client}
                          </span>
                        )}
                      </div>

                      {ev.detail && (
                        <div className="text-[11px] text-slate-500 pt-1 font-mono border-t border-slate-100">
                          {ev.detail}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTimelineAsset(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EDIT SERIAL MODAL */}
      <Dialog open={!!editAsset} onOpenChange={(open) => !open && setEditAsset(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-600" />
              Edit Serial & Current Site
            </DialogTitle>
            {editAsset && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{editAsset.product_name || editAsset.product}</b>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Serial Number</Label>
              <Input
                value={editForm.serial_number}
                onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                placeholder="e.g. UTL-00021"
                className="mt-1 text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Current Site / Location</Label>
              <Input
                value={editForm.site_location}
                onChange={(e) => setEditForm({ ...editForm, site_location: e.target.value })}
                placeholder="e.g. Central Warehouse or Client Site Address"
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Remarks / Notes</Label>
              <Textarea
                value={editForm.remarks}
                onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                placeholder="Optional movement or condition notes..."
                rows={3}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditAsset(null)} disabled={savingEdit}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveEdit} disabled={savingEdit} className="bg-blue-600 hover:bg-blue-700">
              {savingEdit ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
