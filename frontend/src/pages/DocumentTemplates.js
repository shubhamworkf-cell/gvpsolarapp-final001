import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Download, User, Zap, Building2, CheckCircle2, ShieldCheck, FileCheck2, Layers } from "lucide-react";
import { toast } from "sonner";
import { invalidateAllClientQueries } from "@/lib/queryKeys";

export default function DocumentTemplates() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialClientId = searchParams.get("client_id") || null;
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(initialClientId);
  const [generatingDoc, setGeneratingDoc] = useState(null); // tracks "wcr:pdf", "wcr:docx", etc.

  // Synchronize client_id from URL query if provided
  useEffect(() => {
    const cid = searchParams.get("client_id");
    if (cid) {
      setSelectedClientId(cid);
    }
  }, [searchParams]);

  // 1. Fetch Client List using canonical /clients endpoint (same as Clients.js) with /client-data fallback
  const { data: clientsList = [], isLoading: loadingClients } = useQuery({
    queryKey: ["document-engine-clients-list"],
    queryFn: async () => {
      try {
        const { data: primaryData } = await api.get("/clients?limit=500");
        const list = Array.isArray(primaryData) ? primaryData : primaryData?.clients || [];
        if (list.length > 0) return list;
      } catch (_) {}

      try {
        const { data: fallbackData } = await api.get("/client-data");
        return Array.isArray(fallbackData) ? fallbackData : fallbackData?.clients || [];
      } catch (_) {}

      return [];
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Automatically pre-select first client if none selected
  useEffect(() => {
    if (!selectedClientId && clientsList.length > 0) {
      const first = clientsList[0];
      setSelectedClientId(first.id || first.sol_id || first._id);
    }
  }, [clientsList, selectedClientId]);

  // 2. Fetch Selected Client Full Details (onboarding & system specs)
  const { data: clientDetailData, isLoading: loadingDetail } = useQuery({
    queryKey: ["client-detail-doc-engine", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;
      try {
        const { data: detail } = await api.get(`/client-data/${selectedClientId}`);
        if (detail) return detail;
      } catch (_) {}

      try {
        const { data: clientObj } = await api.get(`/clients/${selectedClientId}`);
        return { client: clientObj };
      } catch (_) {}

      return null;
    },
    enabled: !!selectedClientId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  // Filter clients by Name, Mobile, Consumer Number, or SOL ID
  const filteredClients = clientsList.filter((c) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const name = (c.full_name || c.name || "").toLowerCase();
    const consumer = (c.consumer_number || "").toLowerCase();
    const mobile = (c.mobile || "").toLowerCase();
    const solId = (c.sol_id || c.client_code || c.id || "").toLowerCase();
    const city = (c.city || "").toLowerCase();
    return name.includes(q) || consumer.includes(q) || mobile.includes(q) || solId.includes(q) || city.includes(q);
  });

  // Selected client object (combining detail response and list item for instant single source of truth)
  const activeClientInList = clientsList.find(
    (c) => c.id === selectedClientId || c.sol_id === selectedClientId || c._id === selectedClientId
  );
  const activeClient = (activeClientInList || clientDetailData?.client || clientDetailData)
    ? { ...(activeClientInList || {}), ...(clientDetailData || {}), ...(clientDetailData?.client || {}) }
    : null;
  const company = companyDoc || {};

  // Handle direct document generation & immediate download
  // format: "pdf" (default) or "docx"
  const handleGeneratePdf = async (docType, docLabel, format = "pdf") => {
    if (!selectedClientId) {
      toast.error("Please select a client first.");
      return;
    }
    const genKey = `${docType}:${format}`;
    setGeneratingDoc(genKey);
    const fmtLabel = format === "docx" ? "Word" : "PDF";
    const toastId = toast.loading(`Generating ${docLabel} ${fmtLabel}...`);
    try {
      const response = await api.post(
        "/documents/download-direct",
        { client_id: selectedClientId, doc_type: docType, format },
        { responseType: "blob" }
      );

      const blob = response.data;
      const contentType = blob.type || response.headers?.["content-type"] || "";
      const disposition = response.headers?.["content-disposition"] || "";
      const isDocx = contentType.includes("wordprocessingml") ||
                     contentType.includes("docx") ||
                     contentType.includes("document") ||
                     disposition.toLowerCase().includes(".docx");
      const ext = isDocx ? ".docx" : ".pdf";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const clientName = (activeClient?.full_name || activeClient?.name || "Client").replace(/[^a-zA-Z0-9_-]/g, "_");
      link.href = url;
      link.setAttribute("download", `${docType.toUpperCase()}_${clientName}${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`${docLabel} (${fmtLabel}) downloaded successfully!`, { id: toastId });
    } catch (err) {
      toast.error(formatApiError(err) || `Failed to generate ${docLabel}`, { id: toastId });
    } finally {
      setGeneratingDoc(null);
    }
  };

  const availableDocs = [
    { type: "wcr", title: "WCR (Work Completion Report)", desc: "Complete 3-Page WCR with 28-row technical observation table, structural declaration, CMC certificate & Aadhaar box.", bg: "border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50", badge: "3-Page Official WCR" },
    { type: "sldr", title: "SLDR (Single Line Diagram)", desc: "Electrical DC/AC protection layout, surge arresters, net meter & earthing pit certifications.", bg: "border-amber-500 bg-amber-50/40 hover:bg-amber-50", badge: "Single Line Diagram" },
    { type: "meter_testing_request", title: "Meter Testing Request", desc: "Formal DISCOM meter lab testing request letter with customer, location & meter details.", bg: "border-rose-500 bg-rose-50/40 hover:bg-rose-50", badge: "DISCOM Lab Request" },
    { type: "net_meter_agreement", title: "Net Meter Agreement", desc: "DISCOM grid synchronization terms, bi-directional meter parameters & tariff compliance.", bg: "border-sky-500 bg-sky-50/40 hover:bg-sky-50", badge: "DISCOM Compliance" },
    { type: "vendor_agreement", title: "Vendor Agreement", desc: "Installation agreement, quality assurances, 5-year maintenance contract & warranty terms.", bg: "border-purple-500 bg-purple-50/40 hover:bg-purple-50", badge: "Legal Agreement" },
    { type: "annexure", title: "Annexure", desc: "Material & site specifications, panel/inverter serials and BOM component verification details.", bg: "border-blue-500 bg-blue-50/40 hover:bg-blue-50", badge: "Material Specs" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto" data-testid="documents-engine-container">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-7 h-7 text-blue-600" />
            Documents
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate and download 100% code-based PDFs automatically using existing Client, Onboarding, and Company details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 px-3 py-1 text-xs">
            <ShieldCheck className="w-3.5 h-3.5 mr-1" /> Code-Based Direct Download
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Panel: Searchable Client List */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="shadow-sm border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                Search Client
              </CardTitle>
              <CardDescription className="text-xs">Search by Name, Mobile, Consumer Number, or SOL ID</CardDescription>
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
            <CardContent className="p-0 max-h-[560px] overflow-y-auto divide-y divide-slate-100">
              {loadingClients ? (
                <div className="p-6 text-center text-sm text-slate-500">Loading client list...</div>
              ) : filteredClients.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No matching clients found</div>
              ) : (
                filteredClients.map((client) => {
                  const cid = client.id || client.sol_id || client._id;
                  const isSelected = selectedClientId === cid || selectedClientId === client.sol_id || selectedClientId === client.id;
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
                          <span>SOL ID: <strong className="text-slate-700">{client.sol_id || client.client_code || "—"}</strong></span>
                          <span>•</span>
                          <span>{client.mobile || "—"}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Consumer: {client.consumer_number || "—"}
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

        {/* Right Panel: Client Summary & Document Generator Cards */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedClientId ? (
            <Card className="border-dashed border-2 border-slate-200 shadow-none">
              <CardContent className="p-12 text-center text-slate-500 space-y-3">
                <FileText className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-700">No Client Selected</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Please select a client from the left list to load their onboarding details and generate official documents.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Client Summary Header Card */}
              <Card className="shadow-sm border-blue-100">
                <CardHeader className="bg-slate-50/70 pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-600" />
                        {activeClient?.full_name || activeClient?.name || "Client Summary"}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Consumer No: <span className="font-semibold text-slate-700">{activeClient?.consumer_number || "—"}</span> &nbsp;|&nbsp;
                        SOL ID: <span className="font-semibold text-slate-700">{activeClient?.sol_id || activeClient?.client_code || "—"}</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-none font-semibold">
                      {activeClient?.system_kw || "0"} kW Capacity
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  {/* Client & Location Details */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-blue-600" /> Client & Location
                    </div>
                    <div><span className="text-slate-500">Name:</span> <span className="font-medium text-slate-900">{activeClient?.full_name || "—"}</span></div>
                    <div><span className="text-slate-500">Mobile:</span> <span className="font-medium text-slate-900">{activeClient?.mobile || "—"}</span></div>
                    <div><span className="text-slate-500">Consumer No:</span> <span className="font-medium text-slate-900">{activeClient?.consumer_number || "—"}</span></div>
                    <div><span className="text-slate-500">Section Number:</span> <span className="font-medium text-slate-900">{activeClient?.sanction_number || activeClient?.sanction_no || activeClient?.section_number || "—"}</span></div>
                    <div><span className="text-slate-500">City:</span> <span className="font-medium text-slate-900">{activeClient?.city || "—"}</span></div>
                    <div><span className="text-slate-500">Category:</span> <span className="font-medium text-slate-900">{activeClient?.consumer_type || "—"}</span></div>
                    <div><span className="text-slate-500">Aadhaar:</span> <span className="font-medium text-slate-900">{activeClient?.aadhaar || activeClient?.aadhaar_number || "—"}</span></div>
                  </div>

                  {/* Onboarding & System Info */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-amber-600" /> Onboarding & System
                    </div>
                    <div><span className="text-slate-500">Capacity:</span> <span className="font-medium text-slate-900">{activeClient?.system_kw ? `${activeClient.system_kw} kW` : "—"}</span></div>
                    <div><span className="text-slate-500">Phase:</span> <span className="font-medium text-slate-900">{activeClient?.phase_type || "—"}</span></div>
                    <div><span className="text-slate-500">Panel Brand:</span> <span className="font-medium text-slate-900">{activeClient?.panel_brand || activeClient?.panel_make || "—"}</span></div>
                    <div><span className="text-slate-500">Panel Tech:</span> <span className="font-medium text-slate-900">{activeClient?.panel_technology || "—"}</span></div>
                    <div><span className="text-slate-500">Panels:</span> <span className="font-medium text-slate-900">{activeClient?.panel_wattage ? `${activeClient.panel_wattage}Wp` : "—"} ({activeClient?.num_panels ? `${activeClient.num_panels} Nos` : "—"})</span></div>
                    <div><span className="text-slate-500">Inverter Brand/Model:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_make || "—"} {activeClient?.inverter_model || ""} ({activeClient?.inverter_capacity || "—"})</span></div>
                    <div><span className="text-slate-500">Inv Serial / Year:</span> <span className="font-medium text-slate-900">{activeClient?.inverter_serial || "—"} {activeClient?.inverter_year ? `· ${activeClient.inverter_year}` : ""}</span></div>
                  </div>

                  {/* Company Details */}
                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                    <div className="font-semibold text-slate-700 text-xs border-b pb-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" /> Company Details
                    </div>
                    <div><span className="text-slate-500">Vendor:</span> <span className="font-medium text-slate-900">{company.company_name || "—"}</span></div>
                    <div><span className="text-slate-500">GSTIN:</span> <span className="font-medium text-slate-900">{company.gst_number || company.gst || "—"}</span></div>
                    <div><span className="text-slate-500">Phone:</span> <span className="font-medium text-slate-900">{company.mobile || company.phone || "—"}</span></div>
                    <div><span className="text-slate-500">Email:</span> <span className="font-medium text-slate-900 truncate block">{company.email || "—"}</span></div>
                    <div><span className="text-slate-500">Address:</span> <span className="font-medium text-slate-900 truncate block">{company.address || "—"}</span></div>
                  </div>
                </CardContent>
              </Card>

              {/* Global Panel Brand & Technology Settings */}
              <Card className="shadow-sm border-blue-200 bg-blue-50/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    Global Panel Brand, Technology & Category Settings
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Selections automatically update WCR, SLDR, Annexure, and all generated documents for this client.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Panel Brand</label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={activeClient?.panel_brand || activeClient?.panel_make || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!activeClient?.id) return;
                        try {
                          await api.patch(`/clients/${activeClient.id}`, { panel_brand: val, panel_make: val });
                          invalidateAllClientQueries(queryClient, activeClient.id);
                          toast.success(`Panel Brand updated to ${val || "blank"}`);
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                    >
                      <option value="">-- Select Panel Brand --</option>
                      {["INA", "Waaree", "Adani", "Vikram", "Tata", "Rayzon", "RenewSys", "Goldi", "Emmvee", "Premier", "First Solar", "Other"].map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Panel Technology</label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={activeClient?.panel_technology || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!activeClient?.id) return;
                        try {
                          await api.patch(`/clients/${activeClient.id}`, { panel_technology: val });
                          invalidateAllClientQueries(queryClient, activeClient.id);
                          toast.success(`Panel Technology updated to ${val || "blank"}`);
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                    >
                      <option value="">-- Select Panel Technology --</option>
                      {["TopCon Bifacial", "TopCon Mono", "Mono PERC", "Polycrystalline", "N-Type", "P-Type", "Other"].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Consumer Category</label>
                    <select
                      className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      value={activeClient?.consumer_type || ""}
                      onChange={async (e) => {
                        const val = e.target.value;
                        if (!activeClient?.id) return;
                        try {
                          await api.patch(`/clients/${activeClient.id}`, { consumer_type: val });
                          invalidateAllClientQueries(queryClient, activeClient.id);
                          toast.success(`Consumer Category updated to ${val || "blank"}`);
                        } catch (err) {
                          toast.error(formatApiError(err));
                        }
                      }}
                    >
                      <option value="">-- Select Consumer Category --</option>
                      {["Commercial Customer", "Residential Customer", "Domestic Customer"].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>

              {/* Generate Documents Cards Grid */}
              <Card className="shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    Generate Documents
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Click PDF or Word to generate and download each document immediately.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {availableDocs.map((doc) => {
                    const isGenPdf = generatingDoc === `${doc.type}:pdf`;
                    const isGenDocx = generatingDoc === `${doc.type}:docx`;
                    const anyGenerating = !!generatingDoc;
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
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            disabled={anyGenerating || loadingDetail}
                            onClick={() => handleGeneratePdf(doc.type, doc.title, "pdf")}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs px-3 py-2"
                            data-testid={`generate-${doc.type}-pdf-btn`}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            {isGenPdf ? "Generating..." : "PDF"}
                          </Button>
                          <Button
                            disabled={anyGenerating || loadingDetail}
                            onClick={() => handleGeneratePdf(doc.type, doc.title, "docx")}
                            variant="outline"
                            className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs px-3 py-2"
                            data-testid={`generate-${doc.type}-docx-btn`}
                          >
                            <FileText className="w-3.5 h-3.5 mr-1.5" />
                            {isGenDocx ? "Generating..." : "Word"}
                          </Button>
                        </div>
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
