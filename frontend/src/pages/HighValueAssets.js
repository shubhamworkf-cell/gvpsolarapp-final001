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
  CheckCircle2,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Clock,
  Activity,
  Check,
  Building,
  SlidersHorizontal
} from "lucide-react";
import dayjs from "dayjs";

export default function HighValueAssets() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Assets list (one item per serial number)
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  // View Popup Modal (Contains Section 1 Dashboard, Section 2 Editable Info, Section 3 Timeline)
  const [viewAsset, setViewAsset] = useState(null);
  const [viewForm, setViewForm] = useState({ serial_number: "", site_location: "", remarks: "" });
  const [savingViewEdit, setSavingViewEdit] = useState(false);
  const [viewTimeline, setViewTimeline] = useState([]);
  const [loadingViewTimeline, setLoadingViewTimeline] = useState(false);

  // Edit Serial Modal
  const [editAsset, setEditAsset] = useState(null);
  const [editForm, setEditForm] = useState({ serial_number: "", site_location: "", remarks: "" });
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick Serial Movement Timeline Modal
  const [timelineAsset, setTimelineAsset] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch all serial tracking assets (1 entry per serial number)
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/assets", { params: { search: debouncedSearch } });
      const rawAssets = Array.isArray(data) ? data : [];
      
      // Ensure every asset has valid serial representation
      const validSerials = rawAssets.map((a) => ({
        ...a,
        serial_number: a.serial_number || "NO-SERIAL",
        status: a.status || "Available",
        site_location: a.site_location || (a.client_name ? `${a.client_name} Site` : "Central Warehouse"),
        client_name: a.client_name || "Unallocated",
      }));

      setAssets(validSerials);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Filter Assets list by status & search
  const filteredAssets = useMemo(() => {
    let list = [...assets];

    if (statusFilter !== "all") {
      list = list.filter((a) => {
        const st = (a.status || "Available").toLowerCase();
        const sf = statusFilter.toLowerCase();
        if (sf === "dispatched" || sf === "installed") {
          return st === "dispatched" || st === "installed";
        }
        return st === sf;
      });
    }

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (a) =>
          (a.serial_number || "").toLowerCase().includes(q) ||
          (a.product_name || a.product || "").toLowerCase().includes(q) ||
          (a.client_name || "").toLowerCase().includes(q) ||
          (a.site_location || "").toLowerCase().includes(q) ||
          (a.size_model || a.size || "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [assets, statusFilter, debouncedSearch]);

  // Copy Serial Helper
  const handleCopySerial = (sn) => {
    if (!sn) return;
    navigator.clipboard.writeText(sn);
    toast.success(`Copied serial number: ${sn}`);
  };

  // ── Open View Popup Modal ──
  const handleOpenView = async (asset) => {
    setViewAsset(asset);
    setViewForm({
      serial_number: asset.serial_number || "",
      site_location: asset.site_location || asset.site || "",
      remarks: asset.remarks || asset.asset_remarks || "",
    });
    setLoadingViewTimeline(true);
    setViewTimeline([]);

    try {
      // Fetch full serial timeline from backend
      const res = await api.get(`/assets/${asset.id}/timeline`);
      const timelineData = res.data;
      if (timelineData && Array.isArray(timelineData.events) && timelineData.events.length > 0) {
        setViewTimeline(timelineData.events);
      } else {
        // Fallback: construct from asset metadata
        const events = [];
        events.push({
          type: "Inward",
          title: "Inward Entry Recorded",
          date: asset.purchase_date || asset.inward_date || (asset.created_at ? asset.created_at.slice(0, 10) : "—"),
          site: "Central Warehouse",
          client: asset.vendor || "Supplier",
          detail: `Challan / Bill: ${asset.challan_number || "N/A"}`,
        });

        if (asset.client_name && asset.client_name !== "Unallocated") {
          events.push({
            type: asset.status === "Installed" ? "Installed" : "Outward",
            title: "Outward Dispatched to Client",
            date: asset.installation_date || asset.outward_date || "—",
            site: asset.site_location || `${asset.client_name} Site`,
            client: asset.client_name,
            detail: `Serial #${asset.serial_number} allocated to client`,
          });
        }

        if (asset.status === "Returned") {
          events.push({
            type: "Returned",
            title: "Material Returned to Warehouse",
            date: asset.last_movement_date || asset.updated_at || "—",
            site: "Central Warehouse",
            client: asset.client_name || "Client",
            detail: "Returned to stock",
          });
        }

        setViewTimeline(events);
      }
    } catch (err) {
      console.error("Error fetching serial timeline:", err);
    } finally {
      setLoadingViewTimeline(false);
    }
  };

  // Save changes inside View Popup
  const handleSaveViewEdit = async () => {
    if (!viewAsset) return;
    setSavingViewEdit(true);
    try {
      await api.patch(`/assets/${viewAsset.id}`, viewForm);
      toast.success("Serial details updated successfully");
      setViewAsset((prev) => (prev ? { ...prev, ...viewForm } : null));
      fetchAssets();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingViewEdit(false);
    }
  };

  // ── Open Quick History Timeline Modal ──
  const handleOpenTimeline = async (asset) => {
    setTimelineAsset(asset);
    setLoadingTimeline(true);
    setTimelineEvents([]);

    try {
      const res = await api.get(`/assets/${asset.id}/timeline`);
      const timelineData = res.data;
      if (timelineData && Array.isArray(timelineData.events) && timelineData.events.length > 0) {
        setTimelineEvents(timelineData.events);
      } else {
        // Fallback
        const events = [];
        events.push({
          type: "Inward",
          title: "Inward Entry Recorded",
          date: asset.purchase_date || asset.inward_date || (asset.created_at ? asset.created_at.slice(0, 10) : "—"),
          site: "Central Warehouse",
          client: asset.vendor || "Supplier",
          detail: `Challan / Bill: ${asset.challan_number || "N/A"}`,
        });

        if (asset.client_name && asset.client_name !== "Unallocated") {
          events.push({
            type: "Outward",
            title: "Outward Dispatched to Client",
            date: asset.installation_date || asset.outward_date || "—",
            site: asset.site_location || `${asset.client_name} Site`,
            client: asset.client_name,
            detail: `Serial #${asset.serial_number} allocated`,
          });
        }
        setTimelineEvents(events);
      }
    } catch (e) {
      toast.error("Failed to load serial timeline");
    } finally {
      setLoadingTimeline(false);
    }
  };

  // ── Open Edit Modal ──
  const handleOpenEdit = (asset) => {
    setEditAsset(asset);
    setEditForm({
      serial_number: asset.serial_number || "",
      site_location: asset.site_location || asset.site || "",
      remarks: asset.remarks || asset.asset_remarks || "",
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

  // Export Serial List CSV
  const handleExportCSV = () => {
    if (!filteredAssets || filteredAssets.length === 0) {
      toast.error("No serial tracking data to export");
      return;
    }
    const headers = ["Serial Number", "Product Name", "Size / Spec", "Current Status", "Current Site", "Allocated Client", "Last Movement Date"];
    const rows = filteredAssets.map((a) => [
      `"${(a.serial_number || "").replace(/"/g, '""')}"`,
      `"${(a.product_name || a.product || "").replace(/"/g, '""')}"`,
      `"${(a.size_model || a.size || "").replace(/"/g, '""')}"`,
      `"${(a.status || "Available").replace(/"/g, '""')}"`,
      `"${(a.site_location || "Warehouse").replace(/"/g, '""')}"`,
      `"${(a.client_name || "Unallocated").replace(/"/g, '""')}"`,
      `"${(a.installation_date || a.purchase_date || a.last_movement_date || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Serial_Tracking_${statusFilter}_${dayjs().format("YYYYMMDD")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAssets.length} serial records`);
  };

  // Filter Count Calculations
  const counts = useMemo(() => {
    const avail = assets.filter((a) => (a.status || "Available").toLowerCase() === "available").length;
    const disp = assets.filter((a) => (a.status || "").toLowerCase() === "dispatched").length;
    const inst = assets.filter((a) => (a.status || "").toLowerCase() === "installed").length;
    const ret = assets.filter((a) => (a.status || "").toLowerCase() === "returned").length;
    return { all: assets.length, available: avail, dispatched: disp, installed: inst, returned: ret };
  }, [assets]);

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>High Value Goods</h2>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> Live Serial Tracking Ledger
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Pure live serial number ledger calculated directly from transaction history (Inward + Outward + Returns).
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

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
          {[
            { id: "all", label: "All Serials", count: counts.all, icon: SlidersHorizontal },
            { id: "available", label: "Available", count: counts.available, icon: ArrowDownToLine },
            { id: "dispatched", label: "Dispatched", count: counts.dispatched, icon: ArrowUpFromLine },
            { id: "installed", label: "Installed", count: counts.installed, icon: CheckCircle2 },
            { id: "returned", label: "Returned", count: counts.returned, icon: RotateCcw }
          ].map((sf) => {
            const Ic = sf.icon;
            const isActive = statusFilter === sf.id;
            return (
              <button
                key={sf.id}
                onClick={() => setStatusFilter(sf.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  isActive
                    ? "bg-slate-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
                data-testid={`status-filter-${sf.id}`}
              >
                <Ic className={`w-3.5 h-3.5 ${isActive ? "text-amber-400" : "text-slate-500"}`} />
                <span>{sf.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? "bg-slate-800 text-slate-200" : "bg-slate-200 text-slate-700"}`}>
                  {sf.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Global Search Input */}
        <div className="relative w-full sm:w-80 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search Serial, Product, Client, Site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white text-xs h-9"
            data-testid="hv-search-input"
          />
        </div>
      </div>

      {/* MAIN SERIAL TRACKING LEDGER TABLE (ONE ROW PER SERIAL NUMBER) */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 font-semibold">Product Name</th>
                  <th className="p-4 font-semibold">Specification</th>
                  <th className="p-4 font-semibold text-center">Qty</th>
                  <th className="p-4 font-semibold">Serial Number</th>
                  <th className="p-4 font-semibold">Allocated Client</th>
                  <th className="p-4 font-semibold">Current Site / Location</th>
                  <th className="p-4 font-semibold">Movement Date</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                      Loading serial tracking ledger...
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500 text-xs">
                      <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      No high value tracking records found matching the filter.
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset, idx) => {
                    const pName = asset.product_name || asset.product || "Unknown Product";
                    const spec = asset.size_model || asset.size || asset.specification || "—";
                    const qty = asset.quantity || asset.qty || 1;
                    const snDisplay = asset.serial_number && asset.serial_number !== "NO-SERIAL" ? asset.serial_number : "N/A";
                    const isInstalled = asset.status === "Installed" || asset.status === "Dispatched";
                    const isReturned = asset.status === "Returned";
                    const lastMoveDate = asset.last_movement_date || asset.outward_date || asset.installation_date || asset.purchase_date || (asset.created_at ? asset.created_at.slice(0, 10) : "—");

                    return (
                      <tr key={asset.id || idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                        {/* Product Name */}
                        <td className="p-4 font-semibold text-slate-900">
                          {pName}
                        </td>

                        {/* Specification */}
                        <td className="p-4 font-mono text-slate-600">
                          {spec}
                        </td>

                        {/* Quantity */}
                        <td className="p-4 text-center font-mono font-bold text-slate-800">
                          {qty}
                        </td>

                        {/* Serial Number + 1-Click Copy */}
                        <td className="p-4 font-mono font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span className="bg-slate-100 text-slate-900 px-2 py-1 rounded border border-slate-200">
                              {snDisplay}
                            </span>
                            {snDisplay !== "N/A" && (
                              <button
                                type="button"
                                onClick={() => handleCopySerial(snDisplay)}
                                className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition"
                                title="Copy Serial Number"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Allocated Client */}
                        <td className="p-4 font-medium text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{asset.client_name || "Unallocated"}</span>
                          </div>
                        </td>

                        {/* Current Site */}
                        <td className="p-4 text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[150px]">{asset.site_location || "Central Warehouse"}</span>
                          </div>
                        </td>

                        {/* Movement Date */}
                        <td className="p-4 font-mono text-slate-600 whitespace-nowrap">
                          {lastMoveDate}
                        </td>

                        {/* Status Badge */}
                        <td className="p-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                              isInstalled
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : isReturned
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-emerald-50 text-emerald-700 border-emerald-200"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isInstalled ? "bg-blue-500" : isReturned ? "bg-purple-500" : "bg-emerald-500"}`} />
                            {asset.status || "Available"}
                          </span>
                        </td>

                        {/* Actions: View, History, Edit */}
                        <td className="p-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenView(asset)}
                              className="h-7 px-2.5 text-xs border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100"
                              title="View Serial Details Popup"
                            >
                              <Eye className="w-3.5 h-3.5 mr-1 text-blue-600" /> View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenTimeline(asset)}
                              className="h-7 px-2.5 text-xs border-amber-300 text-amber-800 hover:bg-amber-50"
                              title="View Full Serial History Timeline"
                            >
                              <History className="w-3.5 h-3.5 mr-1 text-amber-600" /> History
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(asset)}
                              className="h-7 px-2.5 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                              title="Edit Serial Number & Site"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1 text-slate-500" /> Edit
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

      {/* VIEW POPUP MODAL (SECTION 1 DASHBOARD + SECTION 2 EDITABLE INFO + SECTION 3 TIMELINE) */}
      <Dialog open={!!viewAsset} onOpenChange={(open) => !open && setViewAsset(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {viewAsset && (
            <div className="space-y-6 py-2">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                    <ShieldCheck className="w-5 h-5 text-amber-600" />
                    Serial Unit Details
                  </DialogTitle>
                  <Badge className="bg-slate-100 text-slate-800 font-mono text-xs border-slate-200">
                    Serial #{viewAsset.serial_number}
                  </Badge>
                </div>
              </DialogHeader>

              {/* SECTION 1: SMALL DASHBOARD (4-5 SMALL CARDS) */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">
                  Section 1 — Serial Dashboard Overview
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Card 1: Current Status */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Activity className="w-3 h-3 text-slate-400" /> Current Status
                    </div>
                    <div>
                      <Badge className={`text-xs ${
                        viewAsset.status === "Installed" || viewAsset.status === "Dispatched"
                          ? "bg-blue-100 text-blue-800 border-blue-200"
                          : viewAsset.status === "Returned"
                          ? "bg-purple-100 text-purple-800 border-purple-200"
                          : "bg-emerald-100 text-emerald-800 border-emerald-200"
                      }`}>
                        {viewAsset.status || "Available"}
                      </Badge>
                    </div>
                  </div>

                  {/* Card 2: Current Site */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-400" /> Current Site
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {viewAsset.site_location || "Central Warehouse"}
                    </div>
                  </div>

                  {/* Card 3: Allocated Client */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> Allocated Client
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {viewAsset.client_name || "Unallocated"}
                    </div>
                  </div>

                  {/* Card 4: Last Movement Date */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" /> Last Movement
                    </div>
                    <div className="text-xs font-bold font-mono text-slate-900">
                      {viewAsset.last_movement_date || viewAsset.installation_date || viewAsset.purchase_date || (viewAsset.created_at ? viewAsset.created_at.slice(0, 10) : "—")}
                    </div>
                  </div>

                  {/* Card 5: Total Movements */}
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <History className="w-3 h-3 text-slate-400" /> Total Movements
                    </div>
                    <div className="text-sm font-extrabold font-mono text-blue-700">
                      {viewTimeline.length || 1} Movements
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: EDITABLE INFORMATION */}
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Section 2 — Editable Serial Information
                </div>

                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Product Name</Label>
                      <Input
                        value={viewAsset.product_name || viewAsset.product || ""}
                        disabled
                        className="mt-1 text-xs bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-600">Specification / Size</Label>
                      <Input
                        value={viewAsset.size_model || viewAsset.size || ""}
                        disabled
                        className="mt-1 text-xs bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Serial Number *</Label>
                      <Input
                        value={viewForm.serial_number}
                        onChange={(e) => setViewForm({ ...viewForm, serial_number: e.target.value })}
                        placeholder="e.g. UTL-100-00021"
                        className="mt-1 text-xs font-mono bg-white"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">Current Site / Location *</Label>
                      <Input
                        value={viewForm.site_location}
                        onChange={(e) => setViewForm({ ...viewForm, site_location: e.target.value })}
                        placeholder="e.g. ABC Factory or Central Warehouse"
                        className="mt-1 text-xs bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">Remarks / Condition Notes</Label>
                    <Textarea
                      value={viewForm.remarks}
                      onChange={(e) => setViewForm({ ...viewForm, remarks: e.target.value })}
                      placeholder="Enter optional serial notes or remarks..."
                      rows={2}
                      className="mt-1 text-xs bg-white"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <Button
                      size="sm"
                      onClick={handleSaveViewEdit}
                      disabled={savingViewEdit}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {savingViewEdit ? "Saving..." : "Save Editable Information"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* SECTION 3: MOVEMENT TIMELINE (EVERY MOVEMENT IN CHRONOLOGICAL ORDER) */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Section 3 — Complete Serial Movement Timeline
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-slate-50">
                    {viewTimeline.length} Events Logged
                  </Badge>
                </div>

                {loadingViewTimeline ? (
                  <div className="p-8 text-center text-xs text-slate-500">Loading complete serial timeline...</div>
                ) : viewTimeline.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No movement events logged for this serial number.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {viewTimeline.map((ev, idx) => (
                      <div key={idx} className="relative flex items-start gap-4">
                        <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                          ev.type === "Inward" ? "border-emerald-500 text-emerald-600" :
                          ev.type === "Returned" ? "border-purple-500 text-purple-600" :
                          "border-blue-500 text-blue-600"
                        }`}>
                          {ev.type === "Inward" ? <ArrowDownToLine className="w-3 h-3" /> :
                           ev.type === "Returned" ? <RotateCcw className="w-3 h-3" /> :
                           <ArrowUpFromLine className="w-3 h-3" />}
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 w-full space-y-1.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                              <span>{ev.title}</span>
                              <Badge className={`text-[10px] px-1.5 py-0 ${
                                ev.type === "Inward" ? "bg-emerald-100 text-emerald-800" :
                                ev.type === "Returned" ? "bg-purple-100 text-purple-800" :
                                "bg-blue-100 text-blue-800"
                              }`}>
                                {ev.type}
                              </Badge>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {ev.date}
                            </span>
                          </div>

                          <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
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

              <DialogFooter className="pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setViewAsset(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QUICK TIMELINE MODAL */}
      <Dialog open={!!timelineAsset} onOpenChange={(open) => !open && setTimelineAsset(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              Serial Movement Timeline
            </DialogTitle>
            {timelineAsset && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{timelineAsset.product_name || timelineAsset.product}</b> | Serial: <b className="font-mono text-slate-900">#{timelineAsset.serial_number}</b>
              </p>
            )}
          </DialogHeader>

          <div className="py-2">
            {loadingTimeline ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading timeline...</div>
            ) : timelineEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">No movement events logged for this serial number.</div>
            ) : (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {timelineEvents.map((ev, idx) => (
                  <div key={idx} className="relative flex items-start gap-4">
                    <div className={`absolute -left-6 top-1 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center ${
                      ev.type === "Inward" ? "border-emerald-500 text-emerald-600" :
                      ev.type === "Returned" ? "border-purple-500 text-purple-600" :
                      "border-blue-500 text-blue-600"
                    }`}>
                      {ev.type === "Inward" ? <ArrowDownToLine className="w-3 h-3" /> :
                       ev.type === "Returned" ? <RotateCcw className="w-3 h-3" /> :
                       <ArrowUpFromLine className="w-3 h-3" />}
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 w-full space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900">{ev.title}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {ev.date}
                        </span>
                      </div>

                      <div className="text-xs text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
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
              Edit Serial &amp; Current Site
            </DialogTitle>
            {editAsset && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{editAsset.product_name || editAsset.product}</b>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Serial Number *</Label>
              <Input
                value={editForm.serial_number}
                onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
                placeholder="e.g. UTL-100-00021"
                className="mt-1 text-xs font-mono"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Current Site / Location *</Label>
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
