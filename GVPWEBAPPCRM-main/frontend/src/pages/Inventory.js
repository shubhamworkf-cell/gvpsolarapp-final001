import React, { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import api, { formatApiError } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useProductList, useInvalidateInventory } from "@/hooks/useInventory";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, ArrowDownToLine, ArrowUpFromLine, AlertTriangle, ClipboardList, Layers, Search, Activity, History } from "lucide-react";
import { toast } from "sonner";
import InwardTab from "@/components/Inventory/InwardTab";
import OutwardTab from "@/components/Inventory/OutwardTab";
import ProductMasterTab from "@/components/Inventory/ProductMasterTab";
import BalanceTab from "@/components/Inventory/BalanceTab";
import HistoryTab from "@/components/Inventory/HistoryTab";
const HighValueAssets = React.lazy(() => import("@/pages/HighValueAssets"));

const StatCard = ({ label, value, sub, icon: Ic, accent }) => (
  <Card className="border-slate-200 card-lift">
    <CardContent className="p-4">
      <div className="flex items-start justify-between mb-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className={`w-8 h-8 rounded-lg ${accent} flex items-center justify-center`}><Ic className="w-4 h-4" /></div>
      </div>
      <div className="text-2xl font-semibold tabular-nums text-slate-900" style={{ fontFamily: "Outfit" }}>{value}</div>
      {sub && <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>}
    </CardContent>
  </Card>
);

export default function Inventory() {
  const { data: products = [], isLoading: productsLoading } = useProductList();
  const invalidateInventory = useInvalidateInventory();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState(null);
  const [defaults, setDefaults] = useState({ inward: {}, outward: {} });
  const [tab, setTab] = useState("inward");
  const [visitedTabs, setVisitedTabs] = useState(new Set(["inward"]));
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);
  const [search, setSearch] = useState("");

  // Fetch stats and defaults (kept as direct fetch since they don't need global caching)
  const reload = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get("/inventory/stats"),
        api.get("/inventory/defaults"),
      ]);
      setStats(s.data);
      setDefaults(d.data || { inward: {}, outward: {} });
    } catch (e) { toast.error(formatApiError(e)); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // bump() invalidates inventory cache so all consumers (tabs) re-fetch
  const bump = useCallback(() => {
    invalidateInventory();
    queryClient.invalidateQueries({ queryKey: ["ledger"] });
    queryClient.invalidateQueries({ queryKey: ["high-value-assets"] });
    reload();
  }, [invalidateInventory, reload, queryClient]);

  const saveDefaults = async (patch) => {
    try {
      const { data } = await api.patch("/inventory/defaults", patch);
      setDefaults(data);
      toast.success("Defaults saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const statsCards = useMemo(() => ([
    { label: "Total Products", value: stats?.total_products ?? "—", icon: Boxes, accent: "bg-blue-50 text-blue-600" },
    { label: "Total Stock Qty", value: stats?.total_stock_qty ?? 0, icon: Layers, accent: "bg-indigo-50 text-indigo-600" },
    { label: "Today's Inward", value: stats?.in_today ?? 0, icon: ArrowDownToLine, accent: "bg-emerald-50 text-emerald-600" },
    { label: "Today's Outward", value: stats?.out_today ?? 0, icon: ArrowUpFromLine, accent: "bg-amber-50 text-amber-600" },
    { label: "Low Stock Items", value: stats?.low_stock ?? 0, icon: AlertTriangle, accent: "bg-red-50 text-red-600" },
    { label: "Pending Requests", value: stats?.pending_requests ?? 0, icon: ClipboardList, accent: "bg-violet-50 text-violet-600" },
  ]), [stats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Data Management</h1>
          <p className="text-sm text-slate-500 mt-1">Inward · Outward · Products · Balance · History</p>
        </div>
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search product, vendor, client, challan, bill no…"
            className="pl-9 bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="inv-global-search"
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="inv-stats-grid">
        {statsCards.map((c) => <StatCard key={c.label} {...c} />)}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 sticky top-2 z-10 shadow-sm">
          <TabsTrigger value="inward" data-testid="tab-inward"><ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" /> Inward</TabsTrigger>
          <TabsTrigger value="outward" data-testid="tab-outward"><ArrowUpFromLine className="w-3.5 h-3.5 mr-1.5" /> Outward</TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-products"><Boxes className="w-3.5 h-3.5 mr-1.5" /> Product Master</TabsTrigger>
          <TabsTrigger value="balance" data-testid="tab-balance"><Activity className="w-3.5 h-3.5 mr-1.5" /> Balance Report</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history"><History className="w-3.5 h-3.5 mr-1.5" /> History</TabsTrigger>
          <TabsTrigger value="high-value-goods" data-testid="tab-high-value-goods"><ClipboardList className="w-3.5 h-3.5 mr-1.5" /> High Value Goods</TabsTrigger>
        </TabsList>

        <div style={{ display: tab === "inward" ? "block" : "none" }}>
          {visitedTabs.has("inward") && <InwardTab products={products} defaults={defaults.inward || {}} onSaveDefaults={(d) => saveDefaults({ inward: d })} onChanged={bump} globalSearch={search} />}
        </div>
        <div style={{ display: tab === "outward" ? "block" : "none" }}>
          {visitedTabs.has("outward") && <OutwardTab products={products} defaults={defaults.outward || {}} onSaveDefaults={(d) => saveDefaults({ outward: d })} onChanged={bump} globalSearch={search} />}
        </div>
        <div style={{ display: tab === "products" ? "block" : "none" }}>
          {visitedTabs.has("products") && <ProductMasterTab products={products} onChanged={bump} globalSearch={search} />}
        </div>
        <div style={{ display: tab === "balance" ? "block" : "none" }}>
          {visitedTabs.has("balance") && <BalanceTab products={products} globalSearch={search} />}
        </div>
        <div style={{ display: tab === "history" ? "block" : "none" }}>
          {visitedTabs.has("history") && <HistoryTab globalSearch={search} products={products} onChanged={bump} />}
        </div>
        <div style={{ display: tab === "high-value-goods" ? "block" : "none" }}>
          {visitedTabs.has("high-value-goods") && (
            <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading high value goods…</div>}>
              <HighValueAssets />
            </Suspense>
          )}
        </div>
      </Tabs>
    </div>
  );
}
