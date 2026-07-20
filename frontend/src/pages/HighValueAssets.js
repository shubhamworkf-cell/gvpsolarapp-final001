import React, { useEffect, useState, useMemo, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAssetList, useInvalidateAssets } from "@/hooks/useAssets";
import { useClientList } from "@/hooks/useClients";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, User, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/Inventory/_shared";

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

  const filters = useMemo(() => ({
    search: debouncedSearch,
    status: tab === "all" ? "" : tab
  }), [debouncedSearch, tab]);

  const { data: assets = [], isLoading: assetsLoading } = useAssetList(filters);
  const { data: clients = [], isLoading: clientsLoading } = useClientList();

  const loading = assetsLoading || clientsLoading;

  const invalidateAssets = useInvalidateAssets();
  const queryClient = useQueryClient();

  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [installOpen, setInstallOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [assetToDelete, setAssetToDelete] = useState(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  const confirmDeleteAsset = (asset) => {
    setAssetToDelete(asset);
  };

  const handleDeleteAsset = async () => {
    if (!assetToDelete) return;
    setDeletingAsset(true);
    try {
      await api.delete(`/assets/${assetToDelete.id}`);
      toast.success("High Value Goods record deleted permanently");
      setAssetToDelete(null);
      invalidateAssets();
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    } catch (e) {
      toast.error("Failed to delete record: " + formatApiError(e));
    } finally {
      setDeletingAsset(false);
    }
  };

  const handleInstallClick = (assetId) => {
    setSelectedAssetIds([assetId]);
    setSelectedClientId("");
    setInstallOpen(true);
  };

  const handleBulkInstallClick = () => {
    if (selectedAssetIds.length === 0) {
      toast.warning("Please select at least one asset to install.");
      return;
    }
    setSelectedClientId("");
    setInstallOpen(true);
  };

  const submitInstall = async () => {
    if (!selectedClientId) {
      toast.error("Please select a client.");
      return;
    }
    try {
      await api.post("/assets/install", {
        asset_ids: selectedAssetIds,
        client_id: selectedClientId
      });
      toast.success("Assets installed successfully!");
      setInstallOpen(false);
      setSelectedAssetIds([]);
      invalidateAssets();
    } catch (e) {
      toast.error("Failed to install assets: " + formatApiError(e));
    }
  };

  const handleStatusChange = async (assetIds, status) => {
    try {
      await api.post("/assets/change-status", {
        asset_ids: assetIds,
        status: status
      });
      toast.success(`Status updated to ${status}`);
      invalidateAssets();
      setSelectedAssetIds([]);
    } catch (e) {
      toast.error("Failed to update status: " + formatApiError(e));
    }
  };

  const toggleSelectAsset = (id) => {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedAssetIds.length === assets.length) {
      setSelectedAssetIds([]);
    } else {
      setSelectedAssetIds(assets.map((a) => a.id));
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Available":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Installed":
        return "bg-blue-50 text-blue-700 border-blue-200";
      case "Returned":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Replaced":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "Scrapped":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-slate-50 text-slate-700 border-slate-200";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>High Value Goods Ledger</h2>
          <p className="text-xs text-slate-500">Track and manage high-value serialized equipment and their installation lifecycle.</p>
        </div>
        <div className="flex gap-2">
          {selectedAssetIds.length > 0 && (
            <>
              <Button onClick={handleBulkInstallClick} className="bg-blue-600 hover:bg-blue-700 h-9 text-xs">
                Install Selected ({selectedAssetIds.length})
              </Button>
              <Select onValueChange={(val) => handleStatusChange(selectedAssetIds, val)}>
                <SelectTrigger className="w-48 bg-white h-9 text-xs">
                  <SelectValue placeholder="Bulk Change Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Returned">Returned</SelectItem>
                  <SelectItem value="Replaced">Replaced</SelectItem>
                  <SelectItem value="Scrapped">Scrapped</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 w-full md:w-auto">
          {[
            { id: "all", label: "All Goods" },
            { id: "available", label: "Available" },
            { id: "installed", label: "Installed" },
            { id: "dispatched", label: "Dispatched" },
            { id: "returned", label: "Returned" }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSelectedAssetIds([]);
              }}
              className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-[2px] transition ${
                tab === t.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search serial, product, client, challan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <th className="p-4 w-10">
                    <input
                      type="checkbox"
                      checked={assets.length > 0 && selectedAssetIds.length === assets.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="p-4 font-semibold">Product</th>
                  <th className="p-4 font-semibold">Qty</th>
                  <th className="p-4 font-semibold">Serial Number</th>
                  <th className="p-4 font-semibold">Challan / Vendor</th>
                  <th className="p-4 font-semibold">Installed Client</th>
                  <th className="p-4 font-semibold">Installation / Warranty</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-500">Loading assets...</td>
                  </tr>
                ) : assets.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-500">
                      No assets found. Upload high-value items via Inward Entry to register them here.
                    </td>
                  </tr>
                ) : (
                  assets.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <input
                           type="checkbox"
                           checked={selectedAssetIds.includes(a.id)}
                           onChange={() => toggleSelectAsset(a.id)}
                           className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-4">
                        <div className="font-semibold text-slate-900">{a.product_name}</div>
                        {a.size_model && <div className="text-xs text-slate-400 mt-0.5">{a.size_model}</div>}
                      </td>
                      <td className="p-4 font-medium text-slate-900">
                        {a.quantity !== undefined && a.quantity !== null ? a.quantity : 1}
                      </td>
                      <td className="p-4 font-mono font-semibold text-xs text-slate-800">{a.serial_number || "—"}</td>
                      <td className="p-4">
                        <div className="text-xs text-slate-900 font-medium">Challan: {a.challan_number || "—"}</div>
                        <div className="text-[11px] text-slate-500">{a.vendor} · Inward: {a.purchase_date}</div>
                        {a.outward_date && (
                          <div className="text-[10px] text-blue-600 font-semibold mt-0.5">Outward: {a.outward_date}</div>
                        )}
                      </td>
                      <td className="p-4">
                        {a.client_name ? (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-semibold text-slate-900">{a.client_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Not Assigned</span>
                        )}
                      </td>
                      <td className="p-4">
                        {a.installation_date ? (
                          <>
                            <div className="text-xs text-slate-900 font-medium">Installed: {a.installation_date}</div>
                            <div className={`text-[10px] inline-flex items-center gap-1 font-semibold ${
                              a.warranty_status === "Active" ? "text-emerald-600" : "text-rose-600"
                            }`}>
                              {a.warranty_status === "Active" ? (
                                <ShieldCheck className="w-3 h-3" />
                              ) : (
                                <ShieldAlert className="w-3 h-3" />
                              )}
                              Warranty: {a.warranty_status}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusColor(a.status)}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {a.status === "Available" ? (
                            <Button size="sm" onClick={() => handleInstallClick(a.id)} className="bg-blue-600 hover:bg-blue-700 text-xs py-1 h-7">
                              Install
                            </Button>
                          ) : (
                            <Select onValueChange={(val) => handleStatusChange([a.id], val)} value={a.status}>
                              <SelectTrigger className="w-28 h-7 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Installed">Installed</SelectItem>
                                <SelectItem value="Returned">Returned</SelectItem>
                                <SelectItem value="Replaced">Replaced</SelectItem>
                                <SelectItem value="Scrapped">Scrapped</SelectItem>
                                <SelectItem value="Available">Available</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-600 hover:text-red-800 hover:bg-red-50"
                            onClick={() => confirmDeleteAsset(a)}
                            data-testid={`delete-asset-${a.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Install Asset Dialog */}
      <Dialog open={installOpen} onOpenChange={setInstallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>Assign & Install Assets</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-xs text-slate-500">Select the customer/client to assign the selected high-value assets to. This will update client records automatically.</p>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Client / Customer</label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Select Customer..." />
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} ({c.sol_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallOpen(false)}>Cancel</Button>
            <Button onClick={submitInstall} className="bg-blue-600 hover:bg-blue-700">Confirm Assignment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!assetToDelete}
        onOpenChange={(open) => { if (!open) setAssetToDelete(null); }}
        title="Delete High Value Goods Record"
        description={`Are you sure you want to permanently delete the serial number "${assetToDelete?.serial_number || 'N/A'}" for "${assetToDelete?.product_name}"? This action cannot be undone.`}
        confirmLabel={deletingAsset ? "Deleting..." : "Delete Permanently"}
        onConfirm={handleDeleteAsset}
        disabled={deletingAsset}
      />
    </div>
  );
}
