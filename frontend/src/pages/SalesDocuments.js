import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Quotation from "@/pages/Quotation";
import TaxInvoice from "@/pages/TaxInvoice";
import DeliveryBill from "@/pages/DeliveryBill";
import { FileText } from "lucide-react";

export default function SalesDocuments() {
  const [tab, setTab] = useState("quotation");
  const [visitedTabs, setVisitedTabs] = useState(new Set(["quotation"]));

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Sales Documents</h1>
        <p className="text-sm text-slate-500 mt-1">Manage and generate Quotations, Tax Invoices, and Delivery Bills.</p>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="sticky top-2 z-10 w-full overflow-x-auto scrollbar-none touch-pan-x bg-slate-100/95 backdrop-blur rounded-lg p-1 shadow-sm border border-slate-200/60">
          <TabsList className="bg-transparent p-0 h-auto w-max min-w-full flex items-center justify-start flex-nowrap gap-1">
            <TabsTrigger value="quotation" data-testid="tab-quotation" className="shrink-0 whitespace-nowrap">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Quotation
            </TabsTrigger>
            <TabsTrigger value="tax-invoice" data-testid="tab-tax-invoice" className="shrink-0 whitespace-nowrap">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Tax Invoice
            </TabsTrigger>
            <TabsTrigger value="delivery-bill" data-testid="tab-delivery-bill" className="shrink-0 whitespace-nowrap">
              <FileText className="w-3.5 h-3.5 mr-1.5" /> Delivery Bill
            </TabsTrigger>
          </TabsList>
        </div>

        <div style={{ display: tab === "quotation" ? "block" : "none" }}>
          {visitedTabs.has("quotation") && <Quotation />}
        </div>
        <div style={{ display: tab === "tax-invoice" ? "block" : "none" }}>
          {visitedTabs.has("tax-invoice") && <TaxInvoice />}
        </div>
        <div style={{ display: tab === "delivery-bill" ? "block" : "none" }}>
          {visitedTabs.has("delivery-bill") && <DeliveryBill />}
        </div>
      </Tabs>
    </div>
  );
}
