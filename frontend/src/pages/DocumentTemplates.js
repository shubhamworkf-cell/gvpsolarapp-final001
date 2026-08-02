import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Download, User, Zap, Building2, CheckCircle2, ShieldCheck, FileCheck2, Layers } from "lucide-react";
import { toast } from "sonner";

export default function DocumentTemplates() {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [generatingDoc, setGeneratingDoc] = useState(null);

  // 1. Fetch Client List
  const { data: clientsData = [], isLoading: loadingClients } = useQuery({
    queryKey: queryKeys.clientData.list({ limit: 500 }),
    queryFn: async () => {
      const { data } = await api.get("/client-data");
      return Array.isArray(data) ? data : data?.clients || [];
    },
    staleTime: 60000,
  });

  // 2. Fetch Selected Client Details (Parallel wave fetching for onboarding & specs)
  const { data: clientDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ["client-detail-doc-engine", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      const { data } = await api.get(`/client-data/${selectedClientId}`);
      return data;
    },
    enabled: !!selectedClientId,
  });

  // 3. Fetch Company Details
  const { data: companyDoc } = useQuery({
    queryKey: ["company-doc-engine"],
    queryFn: async () => {
      const { data } = await api.get("/company");
      return data;
    },
    staleTime: 300000,
  });

  // Filter clients
  const filteredClients = clientsData.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (c.full_name || c.name || "").toLowerCase();
    const consumer = (c.consumer_number || "").toLowerCase();
    const mobile = (c.mobile || "").toLowerCase();
    const city = (c.city || "").toLowerCase();
    return name.includes(q) || consumer.includes(q) || mobile.includes(q) || city.includes(q);
  });

  // Selected client object
  const activeClient = clientDetail?.client || clientsData.find((c) => (c.id === selectedClientId || c.sol_id === selectedClientId)) || null;
  const company = companyDoc || {};

  // Handle direct PDF generation & download
  const handleGeneratePdf = async (docType, docLabel) => {
    if (!selectedClientId) {
      toast.error("Please select a client first.");
      return;
    }
    setGeneratingDoc(docType);
    const toastId = toast.loading(`Generating ${docLabel} PDF from code...`);
    try {
      const response = await api.post(
        "/documents/download-direct",
        { client_id: selectedClientId, doc_type: docType },
        { responseType: "blob" }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const clientName = (activeClient?.full_name || activeClient?.name || "Client").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.href = url;
      link.setAttribute("download", `${docType.toUpperCase()}_${clientName}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${docLabel} downloaded successfully!`, { id: toastId });
    } catch (err) {
      toast.error(formatApiError(err) || `Failed to generate ${docLabel}`, { id: toastId });
    } finally {
      setGeneratingDoc(null);
    }
  };

  const availableDocs = [
    { type: "wcr", title: "WCR (Work Completion Report)", desc: "Complete 3-Page WCR with 28-row technical observation table, declaration, CMC certificate & Aadhaar card box.", bg: "border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50", badge: "Primary 3-Page WCR" },
    { type: "annexure", title: "Material Annexure", desc: "BOM component details, field verified quantities and panel/inverter serial specifications.", bg: "border-blue-500 bg-blue-50/40 hover:bg-blue-50", badge: "Material Spec" },
    { type: "sldr", title: "SLDR (Single Line Diagram)", desc: "Electrical DC/AC protection layout, surge arresters, net meter & earthing pit certifications.", bg: "border-amber-500 bg-amber-50/40 hover:bg-amber-50", badge: "Single Line Diagram" },
    { type: "vendor_agreement", title: "Vendor Agreement", desc: "Formal installation agreement, quality assurances, 5-year maintenance contract & warranty terms.", bg: "border-purple-500 bg-purple-50/40 hover:bg-purple-50", badge: "Legal Agreement" },
    { type: "net_meter_agreement", title: "Net Metering Agreement", desc: "DISCOM grid synchronization terms, bi-directional meter parameters & tariff compliance.", bg: "border-sky-500 bg-sky-50/40 hover:bg-sky-50", badge: "DISCOM Compliance" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="documents-engine-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-7 h-7 text-blue-600" />
            Documents Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Automatic 100% code-based PDF generator for WCR, Annexure, SLDR, and Agreements. No templates or manual editing required.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Fresh Direct PDF Download
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Client List Search */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                Select Client
              </CardTitle>
              <CardDescription className="text-xs">Search client by name, consumer number, or mobile</CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search client..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 text-sm"
                  data-testid="client-search-input"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[520px] overflow-y-auto divide-y divide-slate-100">
              {loadingClients ? (
                <div className="p-6 text-center text-sm text-slate-500">Loading client list...</div>
              ) : filteredClients.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No matching clients found</div>
              ) : (
                filteredClients.map((client) => {
                  const cid = client.id || client.sol_id;
                  const isSelected = selectedClientId === cid;
                  return (
                    <div
                      key={cid}
                      onClick={() => setSelectedClientId(cid)}
                      className={`p-3.5 cursor-pointer transition-colors flex items-center justify-between ${
                        isSelected ? "bg-blue-50/80 border-l-4 border-blue-600" : "hover:bg-slate-50"
                      }`}
                      data-testid={`client-card-${cid}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-slate-900 truncate">
                          {client.full_name || client.name || "Unnamed Client"}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>Consumer: {client.consumer_number || "—"}</span>
                          {client.system_kw && <span>• {client.system_kw} kW</span>}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Selected Client Info Preview & Available Document Generators */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedClientId ? (
            <Card className="border-dashed border-2 border-slate-200 shadow-none">
              <CardContent className="p-12 text-center text-slate-500 space-y-3">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-700">No Client Selected</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Please choose a client from the search list on the left to view verified onboarding details and generate official documents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Selected Client Information Preview Card */}
              <Card className="shadow-sm border-blue-100">
                <CardHeader className="bg-slate-50/70 pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        {activeClient?.full_name || activeClient?.name || "Client Details"}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Consumer No: <span className="font-semibold text-slate-700">{activeClient?.consumer_number || "—"}</span> &nbsp;|&nbsp;
                        Sol ID: <span className="font-semibold text-slate-700">{activeClient?.sol_id || activeClient?.client_code || "—"}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-none font-semibold">
                      {activeClient?.system_kw || "0"} kW System
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* General Info */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-blue-600" /> General Info
                    </div>
                    <div><span className="text-slate-500">Name:</span> <span className="font-medium text-slate-900">{activeClient?.full_name || "—"}</span></div>
                    <div><span className="text-slate-500">Consumer Type:</span> <span className="font-medium text-slate-900">{activeClient?.consumer_type || "Private Sector"}</span></div>
                    <div><span className="text-slate-500">Aadhaar:</span> <span className="font-medium text-slate-900">{activeClient?.aadhaar || activeClient?.aadhaar_number || "—"}</span></div>
                    <div><span className="text-slate-500">Mobile:</span> <span className="font-medium text-slate-900">{activeClient?.mobile || "—"}</span></div>
                  </div>

                  {/* Solar System Info */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600" /> Solar Info
                    </div>
                    <div><span className="text-slate-500">Capacity:</span> <span className="font-medium text-slate-900">{activeClient?.system_kw || "0"} kW ({activeClient?.panel_wattage || "540"}Wp)</span></div>
                    <div><span className="text-slate-500">Panels:</span> <span className="font-medium text-slate-900">{activeClient?.panel_make || "GVP SOLAR"} ({activeClient?.num_panels || 0} Nos)</span></div>
                    <div><span className="text-slate-500">Inverter:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_make || "GROWATT"} ({activeClient?.inverter_capacity || "—"})</span></div>
                    <div><span className="text-slate-500">Inv Serial:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_serial || "—"}</span></div>
                  </div>

                  {/* Company Info */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" /> Company Info
                    </div>
                    <div><span className="text-slate-500">Vendor:</span> <span className="font-medium text-slate-900">{company.company_name || "GVP SOLAR ENERGY"}</span></div>
                    <div><span className="text-slate-500">GSTIN:</span> <span className="font-medium text-slate-900">{company.gst_number || company.gst || "27AAAAA0000A1Z5"}</span></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-medium text-slate-900">{company.mobile || company.phone || "—"}</span></div>
                    <div><span className="text-slate-500">Address:</span> <span className="font-medium text-slate-900 truncate block">{company.address || "Office Address"}</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Document Generation Buttons Grid */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Available Document Generators
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Click any document below to generate a fresh, complete PDF from code and download immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {availableDocs.map((doc) => {
                    const isGenerating = generatingDoc === doc.type;
                    return (
                      <div
                        key={doc.type}
                        className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${doc.bg}`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">{doc.title}</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border-slate-300 bg-white">
                              {doc.badge}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed max-w-xl">{doc.desc}</p>
                        </div>
                        <Button
                          disabled={isGenerating || loadingDetail}
                          onClick={() => handleGeneratePdf(doc.type, doc.title)}
                          className="shrink-0 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-4 py-2"
                          data-testid={`generate-${doc.type}-btn`}
                        >
                          <Download className="w-3.5 h-3.5 mr-2" />
                          {isGenerating ? "Generating PDF..." : "Generate & Download"}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
