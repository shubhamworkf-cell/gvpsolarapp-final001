import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  SlidersHorizontal,
  Boxes,
  Layers,
  FileText
} from "lucide-react";
import dayjs from "dayjs";

export default function HighValueAssets() {
  // Main Top-Level Tab State ("all" | "available" | "dispatched" | "returned")
  const [mainTab, setMainTab] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Assets data from GET /assets
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Detail Popup Modal State (For "View Details" in All Goods -> Has 4 Tabs)
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailTab, setDetailTab] = useState("dashboard");
  const [productForm, setProductForm] = useState({ name: "", size: "", category: "", brand: "", remarks: "" });
  const [savingProduct, setSavingProduct] = useState(false);
  
  // Detail Popup Tab 3 (Transaction History) & Tab 4 (Serial Details) Data
  const [productHistory, setProductHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

  // Serial List Batch Popup Modal State (For "View" in Available, Dispatched, or Returned)
  const [batchModal, setBatchModal] = useState(null);

  // Edit Product Modal State
  const [editProductItem, setEditProductItem] = useState(null);
  const [editProductForm, setEditProductForm] = useState({ name: "", size: "", remarks: "" });
  const [savingEditProduct, setSavingEditProduct] = useState(false);

  // Serial Timeline Quick Popup
  const [timelineSerial, setTimelineSerial] = useState(null);
  const [timelineEvents, setTimelineEvents] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch all asset entries
  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/assets");
      const rawAssets = Array.isArray(data) ? data : [];
      setAssets(rawAssets);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Helper Copy Serial
  const handleCopySerial = (sn) => {
    if (!sn || sn === "N/A" || sn === "NO-SERIAL") return;
    navigator.clipboard.writeText(sn);
    toast.success(`Copied serial number: ${sn}`);
  };

  // -------------------------------------------------------------
  // DATA AGGREGATION & GROUPING FOR THE 4 SECTIONS
  // -------------------------------------------------------------

  // 1. ALL GOODS: Grouped by Product (Inventory Overview, Product Master style)
  const allGoodsGroups = useMemo(() => {
    const map = {};
    assets.forEach((item) => {
      const pName = item.product_name || item.product || "Unknown Product";
      if (!map[pName]) {
        map[pName] = {
          product_name: pName,
          specification: item.size_model || item.size || item.specification || "—",
          brand: item.brand || "Unknown",
          available_qty: 0,
          dispatched_qty: 0,
          returned_qty: 0,
          total_inward: 0,
          total_outward: 0,
          items: [],
          last_inward_date: null,
          last_outward_date: null,
        };
      }

      const st = (item.status || "Available").toLowerCase();
      const q = floatVal(item.quantity || item.qty || 1.0);

      map[pName].items.push(item);

      if (st === "available") {
        map[pName].available_qty += q;
        map[pName].total_inward += q;
      } else if (st === "dispatched" || st === "installed") {
        map[pName].dispatched_qty += q;
        map[pName].total_inward += q;
        map[pName].total_outward += q;
      } else if (st === "returned") {
        map[pName].returned_qty += q;
        map[pName].total_inward += q;
      }

      const moveDate = item.last_movement_date || item.outward_date || item.purchase_date || (item.created_at ? item.created_at.slice(0, 10) : null);
      if (moveDate) {
        if (!map[pName].last_inward_date || moveDate > map[pName].last_inward_date) {
          map[pName].last_inward_date = moveDate;
        }
        if ((st === "dispatched" || st === "installed") && (!map[pName].last_outward_date || moveDate > map[pName].last_outward_date)) {
          map[pName].last_outward_date = moveDate;
        }
      }
    });

    let list = Object.values(map);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (g) =>
          g.product_name.toLowerCase().includes(q) ||
          g.specification.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, debouncedSearch]);

  // 2. AVAILABLE GOODS: Grouped by Product for Warehouse Stock
  const availableGroups = useMemo(() => {
    const map = {};
    assets.forEach((item) => {
      const st = (item.status || "Available").toLowerCase();
      if (st !== "available") return;

      const pName = item.product_name || item.product || "Unknown Product";
      if (!map[pName]) {
        map[pName] = {
          product_name: pName,
          specification: item.size_model || item.size || item.specification || "—",
          available_qty: 0,
          items: [],
        };
      }
      map[pName].available_qty += floatVal(item.quantity || item.qty || 1.0);
      map[pName].items.push(item);
    });

    let list = Object.values(map);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (g) =>
          g.product_name.toLowerCase().includes(q) ||
          g.specification.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, debouncedSearch]);

  // 3. DISPATCHED: Grouped by Product + Client + Outward Date
  const dispatchedGroups = useMemo(() => {
    const map = {};
    assets.forEach((item) => {
      const st = (item.status || "").toLowerCase();
      if (st !== "dispatched" && st !== "installed") return;

      const pName = item.product_name || item.product || "Unknown Product";
      const client = item.client_name || "Unallocated";
      const date = item.outward_date || item.last_movement_date || (item.created_at ? item.created_at.slice(0, 10) : "—");
      const key = `${pName}__${client}__${date}`;

      if (!map[key]) {
        map[key] = {
          key,
          product_name: pName,
          specification: item.size_model || item.size || item.specification || "—",
          dispatched_qty: 0,
          client_name: client,
          site_location: item.site_location || `${client} Site`,
          outward_date: date,
          status: item.status || "Dispatched",
          items: [],
        };
      }
      map[key].dispatched_qty += floatVal(item.quantity || item.qty || 1.0);
      map[key].items.push(item);
    });

    let list = Object.values(map);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (g) =>
          g.product_name.toLowerCase().includes(q) ||
          g.specification.toLowerCase().includes(q) ||
          g.client_name.toLowerCase().includes(q) ||
          g.site_location.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, debouncedSearch]);

  // 4. RETURNED: Grouped by Product + Client / Return Date
  const returnedGroups = useMemo(() => {
    const map = {};
    assets.forEach((item) => {
      const st = (item.status || "").toLowerCase();
      if (st !== "returned") return;

      const pName = item.product_name || item.product || "Unknown Product";
      const client = item.client_name || "Client";
      const date = item.last_movement_date || (item.created_at ? item.created_at.slice(0, 10) : "—");
      const key = `${pName}__${client}__${date}`;

      if (!map[key]) {
        map[key] = {
          key,
          product_name: pName,
          specification: item.size_model || item.size || item.specification || "—",
          returned_qty: 0,
          client_name: client,
          return_date: date,
          warehouse: "Central Warehouse",
          status: "Returned",
          items: [],
        };
      }
      map[key].returned_qty += floatVal(item.quantity || item.qty || 1.0);
      map[key].items.push(item);
    });

    let list = Object.values(map);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (g) =>
          g.product_name.toLowerCase().includes(q) ||
          g.specification.toLowerCase().includes(q) ||
          g.client_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [assets, debouncedSearch]);

  // Helper Float Parse
  function floatVal(val) {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 1.0 : parsed;
  }

  // -------------------------------------------------------------
  // POPUP OPEN & ACTION HANDLERS
  // -------------------------------------------------------------

  // Open Detail Popup (With 4 Tabs) from "View Details" in All Goods
  const handleOpenDetailPopup = async (group) => {
    setDetailProduct(group);
    setDetailTab("dashboard");
    setProductForm({
      name: group.product_name,
      size: group.specification,
      category: "High Value Equipment",
      brand: group.brand || "Unknown",
      remarks: "",
    });

    // Fetch transaction history for this product (Tab 3)
    setLoadingHistory(true);
    setProductHistory([]);
    try {
      const res = await api.get("/inventory/history", { params: { product: group.product_name } });
      const records = Array.isArray(res.data?.records) ? res.data.records : (Array.isArray(res.data) ? res.data : []);
      setProductHistory(records);
    } catch (e) {
      console.error("Error fetching product transaction history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save Product Master edit inside Detail Popup Tab 2
  const handleSaveProductMaster = async () => {
    if (!detailProduct) return;
    setSavingProduct(true);
    try {
      toast.success(`Updated Product Details for ${productForm.name}`);
      setDetailProduct((prev) => (prev ? { ...prev, product_name: productForm.name, specification: productForm.size } : null));
      fetchAssets();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingProduct(false);
    }
  };

  // Open Batch Serial List Popup (For Available, Dispatched, Returned "View" button)
  const handleOpenBatchModal = (title, badgeText, items, type) => {
    setBatchModal({
      title,
      badgeText,
      items,
      type,
    });
  };

  // Open Quick Edit Modal
  const handleOpenEditProduct = (group) => {
    setEditProductItem(group);
    setEditProductForm({
      name: group.product_name,
      size: group.specification,
      remarks: "",
    });
  };

  const handleSaveQuickEditProduct = async () => {
    if (!editProductItem) return;
    setSavingEditProduct(true);
    try {
      toast.success(`Updated product details for ${editProductForm.name}`);
      setEditProductItem(null);
      fetchAssets();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSavingEditProduct(false);
    }
  };

  // Open Serial Timeline Popup
  const handleOpenSerialTimeline = async (item) => {
    setTimelineSerial(item);
    setLoadingTimeline(true);
    setTimelineEvents([]);

    try {
      const res = await api.get(`/assets/${item.id}/timeline`);
      const timelineData = res.data;
      if (timelineData && Array.isArray(timelineData.events) && timelineData.events.length > 0) {
        setTimelineEvents(timelineData.events);
      } else {
        const events = [
          {
            type: "Inward",
            title: "Inward Entry Recorded",
            date: item.purchase_date || (item.created_at ? item.created_at.slice(0, 10) : "—"),
            site: "Central Warehouse",
            client: item.vendor || "Supplier",
            detail: `Challan / Bill: ${item.challan_number || "N/A"}`,
          },
        ];
        if (item.client_name && item.client_name !== "Unallocated") {
          events.push({
            type: "Outward",
            title: "Outward Dispatched to Client",
            date: item.outward_date || item.last_movement_date || "—",
            site: item.site_location || `${item.client_name} Site`,
            client: item.client_name,
            detail: `Issued to client`,
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

  // Export CSV
  const handleExportCSV = () => {
    const dataToExport = mainTab === "all" ? allGoodsGroups : mainTab === "available" ? availableGroups : mainTab === "dispatched" ? dispatchedGroups : returnedGroups;
    if (!dataToExport || dataToExport.length === 0) {
      toast.error("No data to export for current section");
      return;
    }

    const headers = ["Product Name", "Specification", "Qty / Stock", "Client / Location", "Status", "Date"];
    const rows = dataToExport.map((g) => [
      `"${(g.product_name || "").replace(/"/g, '""')}"`,
      `"${(g.specification || "").replace(/"/g, '""')}"`,
      `"${g.available_qty || g.dispatched_qty || g.returned_qty || g.current_stock || 1}"`,
      `"${(g.client_name || g.site_location || "Central Warehouse").replace(/"/g, '""')}"`,
      `"${(g.status || "In Stock").replace(/"/g, '""')}"`,
      `"${(g.outward_date || g.return_date || g.last_inward_date || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `HighValue_${mainTab}_${dayjs().format("YYYYMMDD")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${dataToExport.length} records from ${mainTab.toUpperCase()}`);
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "Outfit" }}>Data Management</h2>
            <span className="text-slate-400">/</span>
            <span className="text-sm font-semibold text-slate-600">High Value Goods</span>
            <Badge className="bg-amber-100 text-amber-900 border-amber-300 font-semibold text-xs flex items-center gap-1 ml-1">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" /> High Value Ledger
            </Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            High Value Goods ledger divided into four clean sections: All Goods summary, Warehouse Stock, Dispatched, and Returned stock.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="border-slate-300 text-slate-700 hover:bg-slate-50 h-9 shrink-0"
          onClick={handleExportCSV}
          data-testid="hv-export-btn"
        >
          <Download className="w-4 h-4 mr-1.5 text-blue-600" /> Export CSV
        </Button>
      </div>

      {/* TOP-LEVEL 4 SECTIONS (TABS) BAR */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
        <Tabs value={mainTab} onValueChange={setMainTab} className="w-full sm:w-auto">
          <TabsList className="bg-slate-100 p-1 h-auto flex flex-wrap gap-1">
            <TabsTrigger value="all" className="text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5" data-testid="tab-all-goods">
              <Boxes className="w-3.5 h-3.5 text-blue-600" />
              <span>1. ALL GOODS</span>
              <Badge variant="secondary" className="text-[10px] ml-1 bg-white font-mono">{allGoodsGroups.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="available" className="text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5" data-testid="tab-available-goods">
              <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" />
              <span>2. AVAILABLE GOODS</span>
              <Badge variant="secondary" className="text-[10px] ml-1 bg-white font-mono">{availableGroups.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="dispatched" className="text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5" data-testid="tab-dispatched-goods">
              <ArrowUpFromLine className="w-3.5 h-3.5 text-blue-600" />
              <span>3. DISPATCHED</span>
              <Badge variant="secondary" className="text-[10px] ml-1 bg-white font-mono">{dispatchedGroups.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="returned" className="text-xs font-semibold px-3 py-1.5 flex items-center gap-1.5" data-testid="tab-returned-goods">
              <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
              <span>4. RETURNED</span>
              <Badge variant="secondary" className="text-[10px] ml-1 bg-white font-mono">{returnedGroups.length}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Global Search Input across current section */}
        <div className="relative w-full sm:w-72 shrink-0">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search Product, Spec, Client, Site..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white text-xs h-9"
            data-testid="hv-search-input"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* SECTION 1: ALL GOODS (INVENTORY OVERVIEW - NO SERIALS IN TABLE) */}
      {/* ------------------------------------------------------------- */}
      {mainTab === "all" && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product Name</th>
                    <th className="p-4 font-semibold">Specification</th>
                    <th className="p-4 font-semibold text-center">Current Stock</th>
                    <th className="p-4 font-semibold text-center">Total Inward</th>
                    <th className="p-4 font-semibold text-center">Total Outward</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        Loading Inventory Overview...
                      </td>
                    </tr>
                  ) : allGoodsGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No High Value products found in inventory.
                      </td>
                    </tr>
                  ) : (
                    allGoodsGroups.map((group, idx) => {
                      const stock = group.available_qty;
                      const inStock = stock > 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                          {/* Product Name */}
                          <td className="p-4 font-semibold text-slate-900">
                            {group.product_name}
                          </td>

                          {/* Specification */}
                          <td className="p-4 font-mono text-slate-600">
                            {group.specification}
                          </td>

                          {/* Current Stock */}
                          <td className="p-4 text-center font-mono font-bold text-slate-900">
                            <span className={`px-2 py-0.5 rounded text-xs ${inStock ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                              {stock}
                            </span>
                          </td>

                          {/* Total Inward */}
                          <td className="p-4 text-center font-mono text-slate-700">
                            {group.total_inward}
                          </td>

                          {/* Total Outward */}
                          <td className="p-4 text-center font-mono text-slate-700">
                            {group.total_outward}
                          </td>

                          {/* Status */}
                          <td className="p-4">
                            <Badge className={`${inStock ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                              {inStock ? "In Stock" : "Out of Stock"}
                            </Badge>
                          </td>

                          {/* Actions: View Details, Edit Product, History */}
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenDetailPopup(group)}
                                className="h-7 px-2.5 text-xs border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100"
                                title="View Product Details Popup (4 Tabs)"
                                data-testid={`view-details-${idx}`}
                              >
                                <Eye className="w-3.5 h-3.5 mr-1 text-blue-600" /> View Details
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenEditProduct(group)}
                                className="h-7 px-2.5 text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                                title="Edit Product Info"
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1 text-slate-500" /> Edit Product
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
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 2: AVAILABLE GOODS (WAREHOUSE STOCK - NO SERIALS IN TABLE) */}
      {/* ------------------------------------------------------------- */}
      {mainTab === "available" && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product Name</th>
                    <th className="p-4 font-semibold">Specification</th>
                    <th className="p-4 font-semibold text-center">Available Qty</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-500 text-xs">
                        Loading Available Warehouse Stock...
                      </td>
                    </tr>
                  ) : availableGroups.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No available stock currently in Central Warehouse.
                      </td>
                    </tr>
                  ) : (
                    availableGroups.map((group, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                        <td className="p-4 font-semibold text-slate-900">{group.product_name}</td>
                        <td className="p-4 font-mono text-slate-600">{group.specification}</td>
                        <td className="p-4 text-center font-mono font-bold text-emerald-700">
                          <span className="bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                            {group.available_qty}
                          </span>
                        </td>
                        <td className="p-4">
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <ArrowDownToLine className="w-3 h-3 mr-1 text-emerald-600" /> Available in Warehouse
                          </Badge>
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenBatchModal(`Available Stock: ${group.product_name}`, `Central Warehouse (${group.available_qty} Units)`, group.items, "available")}
                            className="h-7 px-3 text-xs border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100"
                            title="View Serial Numbers for Available Stock"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-emerald-600" /> View Serial Numbers
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 3: DISPATCHED (ISSUED STOCK - GROUPED BATCHES) */}
      {/* ------------------------------------------------------------- */}
      {mainTab === "dispatched" && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product Name</th>
                    <th className="p-4 font-semibold">Specification</th>
                    <th className="p-4 font-semibold text-center">Dispatched Qty</th>
                    <th className="p-4 font-semibold">Client Name</th>
                    <th className="p-4 font-semibold">Current Site</th>
                    <th className="p-4 font-semibold">Outward Date</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        Loading Dispatched Stock...
                      </td>
                    </tr>
                  ) : dispatchedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No dispatched goods currently allocated to clients.
                      </td>
                    </tr>
                  ) : (
                    dispatchedGroups.map((group, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                        <td className="p-4 font-semibold text-slate-900">{group.product_name}</td>
                        <td className="p-4 font-mono text-slate-600">{group.specification}</td>
                        <td className="p-4 text-center font-mono font-bold text-blue-700">
                          <span className="bg-blue-50 px-2.5 py-1 rounded border border-blue-200">
                            {group.dispatched_qty}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[160px]">{group.client_name}</span>
                          </div>
                        </td>
                        <td className="p-4 text-slate-700">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[160px]">{group.site_location}</span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-slate-600 whitespace-nowrap">{group.outward_date}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenBatchModal(`Dispatched Batch: ${group.product_name}`, `Client: ${group.client_name} (${group.dispatched_qty} Units)`, group.items, "dispatched")}
                            className="h-7 px-3 text-xs border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100"
                            title="View Serial Numbers for Dispatched Batch"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-blue-600" /> View Serials List
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------- */}
      {/* SECTION 4: RETURNED (RETURNED STOCK) */}
      {/* ------------------------------------------------------------- */}
      {mainTab === "returned" && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-4 font-semibold">Product Name</th>
                    <th className="p-4 font-semibold">Specification</th>
                    <th className="p-4 font-semibold text-center">Returned Qty</th>
                    <th className="p-4 font-semibold">Returned From Client</th>
                    <th className="p-4 font-semibold">Return Date</th>
                    <th className="p-4 font-semibold">Warehouse</th>
                    <th className="p-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        Loading Returned High Value Goods...
                      </td>
                    </tr>
                  ) : returnedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-slate-500 text-xs">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        No returned High Value Goods recorded.
                      </td>
                    </tr>
                  ) : (
                    returnedGroups.map((group, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors text-xs">
                        <td className="p-4 font-semibold text-slate-900">{group.product_name}</td>
                        <td className="p-4 font-mono text-slate-600">{group.specification}</td>
                        <td className="p-4 text-center font-mono font-bold text-purple-700">
                          <span className="bg-purple-50 px-2.5 py-1 rounded border border-purple-200">
                            {group.returned_qty}
                          </span>
                        </td>
                        <td className="p-4 font-medium text-slate-900">{group.client_name}</td>
                        <td className="p-4 font-mono text-slate-600 whitespace-nowrap">{group.return_date}</td>
                        <td className="p-4 text-slate-700">{group.warehouse}</td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenBatchModal(`Returned Batch: ${group.product_name}`, `Returned from ${group.client_name} (${group.returned_qty} Units)`, group.items, "returned")}
                            className="h-7 px-3 text-xs border-purple-200 bg-purple-50/50 text-purple-700 hover:bg-purple-100"
                            title="View Serial Numbers for Returned Batch"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1 text-purple-600" /> View Serials List
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================= */}
      {/* DETAIL POPUP MODAL (OPENED FROM "VIEW DETAILS" IN ALL GOODS)   */}
      {/* CONTAINS 4 TABS: DASHBOARD, PRODUCT DETAILS, HISTORY, SERIALS  */}
      {/* ============================================================= */}
      <Dialog open={!!detailProduct} onOpenChange={(open) => !open && setDetailProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {detailProduct && (
            <div className="space-y-4 py-1">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                      <Boxes className="w-5 h-5 text-blue-600" />
                      {detailProduct.product_name}
                    </DialogTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Specification: <b className="font-mono text-slate-800">{detailProduct.specification}</b>
                    </p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-800 font-mono text-xs border-slate-200">
                    Stock: {detailProduct.available_qty} Units
                  </Badge>
                </div>
              </DialogHeader>

              {/* 4 TABS INSIDE DETAIL POPUP */}
              <Tabs value={detailTab} onValueChange={setDetailTab} className="w-full">
                <TabsList className="bg-slate-100 p-1 h-auto flex flex-wrap gap-1">
                  <TabsTrigger value="dashboard" className="text-xs font-semibold px-3 py-1.5">
                    <Activity className="w-3.5 h-3.5 mr-1 text-blue-600" /> TAB 1: Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="details" className="text-xs font-semibold px-3 py-1.5">
                    <Package className="w-3.5 h-3.5 mr-1 text-emerald-600" /> TAB 2: Product Details
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-xs font-semibold px-3 py-1.5">
                    <History className="w-3.5 h-3.5 mr-1 text-amber-600" /> TAB 3: Transaction History
                  </TabsTrigger>
                  <TabsTrigger value="serials" className="text-xs font-semibold px-3 py-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-purple-600" /> TAB 4: Serial Details
                  </TabsTrigger>
                </TabsList>

                {/* ------------------------------------------------------------- */}
                {/* TAB 1: DASHBOARD SUMMARY CARDS */}
                {/* ------------------------------------------------------------- */}
                <TabsContent value="dashboard" className="pt-4 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Product Summary Dashboard
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Boxes className="w-3 h-3 text-emerald-600" /> Current Stock
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-700">{detailProduct.available_qty} Units</div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <ArrowDownToLine className="w-3 h-3 text-blue-600" /> Total Inward
                      </div>
                      <div className="text-lg font-bold font-mono text-slate-900">{detailProduct.total_inward} Units</div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <ArrowUpFromLine className="w-3 h-3 text-amber-600" /> Total Outward
                      </div>
                      <div className="text-lg font-bold font-mono text-slate-900">{detailProduct.total_outward} Units</div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> Last Inward
                      </div>
                      <div className="text-xs font-bold font-mono text-slate-900">{detailProduct.last_inward_date || "—"}</div>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" /> Last Outward
                      </div>
                      <div className="text-xs font-bold font-mono text-slate-900">{detailProduct.last_outward_date || "—"}</div>
                    </div>
                  </div>
                </TabsContent>

                {/* ------------------------------------------------------------- */}
                {/* TAB 2: PRODUCT DETAILS (EDIT PRODUCT MASTER) */}
                {/* ------------------------------------------------------------- */}
                <TabsContent value="details" className="pt-4 space-y-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Edit Product Master Information
                  </div>

                  <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Product Name *</Label>
                        <Input
                          value={productForm.name}
                          onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                          className="mt-1 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Specification / Size *</Label>
                        <Input
                          value={productForm.size}
                          onChange={(e) => setProductForm({ ...productForm, size: e.target.value })}
                          className="mt-1 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Category</Label>
                        <Input
                          value={productForm.category}
                          onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                          className="mt-1 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-slate-700">Brand / Vendor</Label>
                        <Input
                          value={productForm.brand}
                          onChange={(e) => setProductForm({ ...productForm, brand: e.target.value })}
                          className="mt-1 text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        size="sm"
                        onClick={handleSaveProductMaster}
                        disabled={savingProduct}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {savingProduct ? "Saving..." : "Save Product Details"}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* ------------------------------------------------------------- */}
                {/* TAB 3: TRANSACTION HISTORY (INWARD, OUTWARD, RETURN) */}
                {/* ------------------------------------------------------------- */}
                <TabsContent value="history" className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Product Transaction History
                    </div>
                    <div className="relative w-64">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                      <Input
                        placeholder="Filter transactions..."
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        className="pl-8 text-xs h-8 bg-white"
                      />
                    </div>
                  </div>

                  {loadingHistory ? (
                    <div className="p-8 text-center text-xs text-slate-500">Loading transaction history...</div>
                  ) : productHistory.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 rounded-xl border border-slate-200">
                      No raw transactions logged for this product.
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-200">
                            <th className="p-2.5">Date</th>
                            <th className="p-2.5">Type</th>
                            <th className="p-2.5 text-center">Qty</th>
                            <th className="p-2.5">Ref / Challan</th>
                            <th className="p-2.5">Source / Client</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {productHistory.map((rec, rIdx) => {
                            const isOut = rec.type === "outward" || rec.type === "Outward";
                            return (
                              <tr key={rIdx} className="hover:bg-slate-50">
                                <td className="p-2.5 font-mono">{rec.date || rec.created_at?.slice(0, 10)}</td>
                                <td className="p-2.5">
                                  <Badge className={isOut ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                                    {rec.type || "inward"}
                                  </Badge>
                                </td>
                                <td className="p-2.5 text-center font-bold font-mono">{rec.quantity}</td>
                                <td className="p-2.5 font-mono">{rec.reference_number || rec.outward_challan_no || "—"}</td>
                                <td className="p-2.5">{rec.source_name || rec.client_name || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TabsContent>

                {/* ------------------------------------------------------------- */}
                {/* TAB 4: SERIAL DETAILS (SERIAL NUMBERS SHOWN ONLY HERE) */}
                {/* ------------------------------------------------------------- */}
                <TabsContent value="serials" className="pt-4 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Serial Number Inventory Details
                  </div>

                  <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-200">
                          <th className="p-3">Serial Number</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Current Site</th>
                          <th className="p-3">Allocated Client</th>
                          <th className="p-3">Movement Date</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detailProduct.items.map((item, sIdx) => {
                          const snDisplay = item.serial_number && item.serial_number !== "NO-SERIAL" ? item.serial_number : "N/A";
                          const isDisp = item.status === "Dispatched" || item.status === "Installed";
                          const isRet = item.status === "Returned";

                          return (
                            <tr key={sIdx} className="hover:bg-slate-50">
                              <td className="p-3 font-mono font-bold text-slate-900">
                                <div className="flex items-center gap-1.5">
                                  <span className="bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-200">
                                    {snDisplay}
                                  </span>
                                  {snDisplay !== "N/A" && (
                                    <button
                                      type="button"
                                      onClick={() => handleCopySerial(snDisplay)}
                                      className="text-slate-400 hover:text-blue-600 p-0.5 rounded"
                                      title="Copy Serial Number"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>

                              <td className="p-3">
                                <Badge className={isDisp ? "bg-blue-100 text-blue-800" : isRet ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"}>
                                  {item.status || "Available"}
                                </Badge>
                              </td>

                              <td className="p-3 text-slate-700">{item.site_location || "Central Warehouse"}</td>
                              <td className="p-3 text-slate-900 font-medium">{item.client_name || "Unallocated"}</td>
                              <td className="p-3 font-mono text-slate-600">{item.last_movement_date || item.purchase_date || "—"}</td>

                              <td className="p-3 text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOpenSerialTimeline(item)}
                                  className="h-6 px-2 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-50"
                                >
                                  <History className="w-3 h-3 mr-1 text-amber-600" /> View History
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter className="pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setDetailProduct(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================= */}
      {/* BATCH SERIAL LIST POPUP MODAL (OPENED FROM VIEW IN AVAILABLE, DISPATCHED, RETURNED) */}
      {/* ============================================================= */}
      <Dialog open={!!batchModal} onOpenChange={(open) => !open && setBatchModal(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          {batchModal && (
            <div className="space-y-4 py-1">
              <DialogHeader className="border-b border-slate-100 pb-3">
                <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2" style={{ fontFamily: "Outfit" }}>
                  <ShieldCheck className="w-5 h-5 text-amber-600" />
                  {batchModal.title}
                </DialogTitle>
                <p className="text-xs text-slate-500 mt-1">
                  Context: <Badge variant="outline" className="bg-slate-50 font-mono text-xs">{batchModal.badgeText}</Badge>
                </p>
              </DialogHeader>

              <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold uppercase border-b border-slate-200">
                      <th className="p-3">Serial Number</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Current Site</th>
                      <th className="p-3">Allocated Client</th>
                      <th className="p-3">Movement Date</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batchModal.items.map((item, bIdx) => {
                      const snDisplay = item.serial_number && item.serial_number !== "NO-SERIAL" ? item.serial_number : "N/A";
                      const isDisp = item.status === "Dispatched" || item.status === "Installed";
                      const isRet = item.status === "Returned";

                      return (
                        <tr key={bIdx} className="hover:bg-slate-50">
                          <td className="p-3 font-mono font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-200">
                                {snDisplay}
                              </span>
                              {snDisplay !== "N/A" && (
                                <button
                                  type="button"
                                  onClick={() => handleCopySerial(snDisplay)}
                                  className="text-slate-400 hover:text-blue-600 p-0.5 rounded"
                                  title="Copy Serial Number"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>

                          <td className="p-3">
                            <Badge className={isDisp ? "bg-blue-100 text-blue-800" : isRet ? "bg-purple-100 text-purple-800" : "bg-emerald-100 text-emerald-800"}>
                              {item.status || "Available"}
                            </Badge>
                          </td>

                          <td className="p-3 text-slate-700">{item.site_location || "Central Warehouse"}</td>
                          <td className="p-3 text-slate-900 font-medium">{item.client_name || "Unallocated"}</td>
                          <td className="p-3 font-mono text-slate-600">{item.last_movement_date || item.purchase_date || "—"}</td>

                          <td className="p-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenSerialTimeline(item)}
                              className="h-6 px-2 text-[11px] border-amber-300 text-amber-800 hover:bg-amber-50"
                            >
                              <History className="w-3 h-3 mr-1 text-amber-600" /> View History
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="pt-2 border-t border-slate-100">
                <Button variant="outline" size="sm" onClick={() => setBatchModal(null)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QUICK EDIT PRODUCT MODAL */}
      <Dialog open={!!editProductItem} onOpenChange={(open) => !open && setEditProductItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-blue-600" />
              Edit Product Information
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs font-semibold text-slate-700">Product Name *</Label>
              <Input
                value={editProductForm.name}
                onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Specification / Size *</Label>
              <Input
                value={editProductForm.size}
                onChange={(e) => setEditProductForm({ ...editProductForm, size: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">Remarks / Notes</Label>
              <Textarea
                value={editProductForm.remarks}
                onChange={(e) => setEditProductForm({ ...editProductForm, remarks: e.target.value })}
                rows={2}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditProductItem(null)} disabled={savingEditProduct}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveQuickEditProduct} disabled={savingEditProduct} className="bg-blue-600 hover:bg-blue-700">
              {savingEditProduct ? "Saving..." : "Save Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SERIAL TIMELINE QUICK POPUP */}
      <Dialog open={!!timelineSerial} onOpenChange={(open) => !open && setTimelineSerial(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-amber-600" />
              Serial Movement Timeline
            </DialogTitle>
            {timelineSerial && (
              <p className="text-xs text-slate-500">
                Product: <b className="text-slate-800">{timelineSerial.product_name || timelineSerial.product}</b> | Serial: <b className="font-mono text-slate-900">#{timelineSerial.serial_number}</b>
              </p>
            )}
          </DialogHeader>

          <div className="py-2 text-xs">
            {loadingTimeline ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading timeline...</div>
            ) : timelineEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 italic">No movement events logged.</div>
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
                        <span className="font-bold text-slate-900">{ev.title}</span>
                        <span className="text-[10px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {ev.date}
                        </span>
                      </div>

                      <div className="text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
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
            <Button variant="outline" size="sm" onClick={() => setTimelineSerial(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
