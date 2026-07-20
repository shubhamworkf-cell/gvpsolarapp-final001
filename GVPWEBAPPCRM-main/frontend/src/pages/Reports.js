import React, { useEffect, useState, useMemo } from "react";
import api, { formatApiError } from "@/lib/api";
import { useClientList } from "@/hooks/useClients";
import { useLedger } from "@/hooks/useClientDataHooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Search, FileText, Download, ScrollText, Boxes, ArrowUpFromLine, ArrowDownToLine,
  Activity, AlertTriangle, FileSpreadsheet, Eye
} from "lucide-react";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";

export default function Reports() {
  const { data: clients = [], isLoading: loadingClients } = useClientList();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);

  const { data: ledger = null, isLoading: loadingLedger } = useLedger(selectedClient?.id, !!selectedClient);

  const [busyExport, setBusyExport] = useState({ excel: false, csv: false, pdf: false });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Export ledger to PDF, Excel, or CSV
  const handleExport = async (format) => {
    if (!selectedClient) return;
    setBusyExport((prev) => ({ ...prev, [format]: true }));
    try {
      const response = await api.get(`/inventory/ledger/${selectedClient.id}/export`, {
        params: { format },
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: response.headers["content-type"] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      
      const ext = format === "excel" ? "xlsx" : format === "pdf" ? "pdf" : "csv";
      const filename = `material_ledger_${selectedClient.sol_id || selectedClient.id.slice(0, 8)}.${ext}`;
      
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} exported successfully`);
    } catch (e) {
      toast.error(`Export failed: ${formatApiError(e)}`);
    } finally {
      setBusyExport((prev) => ({ ...prev, [format]: false }));
    }
  };

  // Filter clients by search query
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const s = search.toLowerCase();
      return (
        c.full_name?.toLowerCase().includes(s) ||
        c.mobile?.includes(s) ||
        c.consumer_number?.includes(s) ||
        c.sol_id?.toLowerCase().includes(s)
      );
    });
  }, [clients, search]);

  const totalPages = Math.ceil(filteredClients.length / itemsPerPage);
  const paginatedClients = useMemo(() => {
    return filteredClients.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredClients, currentPage, itemsPerPage]);

  return (
    <div className="space-y-6">
      {/* Header and Title */}
      <div>
        <div className="flex items-center gap-2 text-slate-500 text-xs">
          <span>Reports</span>
          {selectedClient && (
            <>
              <span>/</span>
              <span className="text-slate-900 font-medium">Client Material Report</span>
            </>
          )}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mt-1.5" style={{ fontFamily: "Outfit" }}>
          {selectedClient ? `Ledger: ${selectedClient.full_name}` : "Reports Center"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {selectedClient 
            ? "View and export real-time material balance ledger for this client." 
            : "Select a client to view and export their material ledger report."}
        </p>
      </div>

      {!selectedClient ? (
        // --- 1. Client List View ---
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients by name, mobile, consumer #..."
              className="pl-9 bg-white"
            />
          </div>

          <Card className="border-slate-200">
            {loadingClients ? (
              <div className="p-6 space-y-4 animate-pulse">
                {[1, 2, 3, 4, 5].map((x) => (
                  <div key={x} className="flex justify-between items-center py-3 border-b border-slate-100 last:border-none">
                    <div className="h-4 w-40 bg-slate-200 rounded" />
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                    <div className="h-4 w-20 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredClients.length === 0 ? (
              <div className="py-20 text-center text-sm text-slate-500">No onboarding clients found.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="text-left px-5 py-3.5 font-semibold">Client Name</th>
                        <th className="text-left px-5 py-3.5 font-semibold">Project ID</th>
                        <th className="text-left px-5 py-3.5 font-semibold">Mobile</th>
                        <th className="text-left px-5 py-3.5 font-semibold">Consumer No</th>
                        <th className="text-left px-5 py-3.5 font-semibold">Status</th>
                        <th className="text-right px-5 py-3.5 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedClients.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-slate-900">{c.full_name}</td>
                          <td className="px-5 py-3.5 text-slate-600 font-mono text-xs">{c.sol_id || "—"}</td>
                          <td className="px-5 py-3.5 text-slate-600">{c.mobile || "—"}</td>
                          <td className="px-5 py-3.5 text-slate-600">{c.consumer_number || "—"}</td>
                          <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                          <td className="px-5 py-3.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => setSelectedClient(c)}
                              data-testid={`view-ledger-${c.id}`}
                            >
                              <Eye className="w-3.5 h-3.5 mr-1" /> View Ledger
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-slate-500">
                      Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredClients.length)} of {filteredClients.length} clients
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ) : (
        // --- 2. Client Ledger Details View ---
        <div className="space-y-6">
          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
              onClick={() => setSelectedClient(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Clients List
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-700"
                onClick={() => handleExport("excel")}
                disabled={busyExport.excel || loadingLedger}
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
                {busyExport.excel ? "Exporting Excel…" : "Excel"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-700"
                onClick={() => handleExport("csv")}
                disabled={busyExport.csv || loadingLedger}
              >
                <FileText className="w-4 h-4 mr-1.5 text-blue-600" />
                {busyExport.csv ? "Exporting CSV…" : "CSV"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-300 text-slate-700"
                onClick={() => handleExport("pdf")}
                disabled={busyExport.pdf || loadingLedger}
              >
                <Download className="w-4 h-4 mr-1.5 text-rose-600" />
                {busyExport.pdf ? "Exporting PDF…" : "PDF"}
              </Button>
            </div>
          </div>

          {loadingLedger ? (
            <div className="py-20 text-center text-sm text-slate-500">Loading ledger data…</div>
          ) : !ledger ? (
            <div className="py-20 text-center text-sm text-slate-500">No ledger data available.</div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Card className="border-slate-200">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Products</div>
                      <div className="text-2xl font-bold mt-1 text-slate-800">{ledger.summary.total_products}</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500">
                      <Boxes className="w-5 h-5 text-indigo-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Outward Qty</div>
                      <div className="text-2xl font-bold mt-1 text-slate-800">{ledger.summary.total_outward_qty}</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500">
                      <ArrowUpFromLine className="w-5 h-5 text-amber-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Returned Qty</div>
                      <div className="text-2xl font-bold mt-1 text-slate-800">{ledger.summary.total_returned_qty}</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500">
                      <ArrowDownToLine className="w-5 h-5 text-emerald-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Current Balance</div>
                      <div className="text-2xl font-bold mt-1 text-slate-800">{ledger.summary.current_balance}</div>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500">
                      <Activity className="w-5 h-5 text-blue-600" />
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-slate-200 ${ledger.summary.negative_items > 0 ? "border-red-200 bg-red-50/20" : ""}`}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Negative Items</div>
                      <div className={`text-2xl font-bold mt-1 ${ledger.summary.negative_items > 0 ? "text-red-600" : "text-slate-800"}`}>
                        {ledger.summary.negative_items}
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-slate-50 text-slate-500">
                      <AlertTriangle className={`w-5 h-5 ${ledger.summary.negative_items > 0 ? "text-red-600" : "text-slate-500"}`} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Ledger Table */}
              <Card className="border-slate-200">
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                        <tr>
                          <th className="text-left px-5 py-3 font-semibold">Product</th>
                          <th className="text-left px-5 py-3 font-semibold">Size</th>
                          <th className="text-left px-5 py-3 font-semibold">Unit</th>
                          <th className="text-right px-5 py-3 font-semibold">Total Outward</th>
                          <th className="text-right px-5 py-3 font-semibold">Total Returned</th>
                          <th className="text-right px-5 py-3 font-semibold font-bold">Current Balance</th>
                          <th className="text-center px-5 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledger.items.map((row, idx) => {
                          let statusStyle = "bg-slate-100 text-slate-700";
                          let balanceStyle = "text-slate-900";
                          
                          if (row.current_balance < 0) {
                            statusStyle = "bg-red-50 text-red-700 font-semibold border border-red-200";
                            balanceStyle = "text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded";
                          } else if (row.current_balance === 0) {
                            statusStyle = "bg-slate-100 text-slate-400";
                            balanceStyle = "text-slate-400";
                          } else if (row.current_balance > 0) {
                            statusStyle = "bg-amber-50 text-amber-700 font-semibold border border-amber-200";
                            balanceStyle = "text-slate-900 font-semibold";
                          }

                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-5 py-3.5 font-medium text-slate-900">{row.product}</td>
                              <td className="px-5 py-3.5 text-slate-600">{row.size || "—"}</td>
                              <td className="px-5 py-3.5 text-slate-600">{row.unit}</td>
                              <td className="px-5 py-3.5 text-right text-slate-700 tabular-nums">{row.total_outward}</td>
                              <td className="px-5 py-3.5 text-right text-slate-700 tabular-nums">{row.total_returned}</td>
                              <td className="px-5 py-3.5 text-right tabular-nums">
                                <span className={balanceStyle}>{row.current_balance}</span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <Badge className={`text-[10px] capitalize shadow-none ${statusStyle}`}>
                                  {row.status}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
