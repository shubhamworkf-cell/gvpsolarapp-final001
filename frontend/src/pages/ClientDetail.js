import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useClientDetail } from "@/hooks/useClients";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { toast } from "sonner";
import { ArrowLeft, Check, FileText, MessageSquare, Phone, MapPin, Zap, Wand2, Sparkles } from "lucide-react";
import dayjs from "dayjs";
import TemplateGenerateDialog from "@/components/TemplateGenerateDialog";

const STAGES = [
  "Onboarding",
  "Survey",
  "Quotation",
  "Material Delivery",
  "Installation",
  "Document Making",
  "Document Signed",
  "Meter Testing Request",
  "Meter Testing Completed",
  "PM Surya Ghar Upload",
  "MSEDCL Upload",
  "Verification",
  "Handover",
];
const STATUSES = ["Lead", "Survey Pending", "Quotation Sent", "Approved", "Installation Pending", "Installation Complete", "Handover Complete"];

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [editMode, setEditMode] = useState(params.get("edit") === "1");
  const [editData, setEditData] = useState(null);
  const [note, setNote] = useState("");
  const [tplOpen, setTplOpen] = useState(false);

  // — React Query: cached for 3 min, no refetch on re-navigation —
  const { data: client, isLoading } = useClientDetail(id);

  // Sync editData when client is loaded or edit mode changes
  const handleStartEdit = () => {
    setEditData({
      full_name: client?.full_name || "",
      mobile: client?.mobile || "",
      alt_mobile: client?.alt_mobile || "",
      consumer_number: client?.consumer_number || "",
      address: client?.address || "",
      city: client?.city || "",
      state: client?.state || "",
      pincode: client?.pincode || "",
      aadhaar: client?.aadhaar || "",
      system_kw: client?.system_kw || 0,
      panel_make: client?.panel_make || "",
      panel_wattage: client?.panel_wattage || 0,
      num_panels: client?.num_panels || 0,
      inverter_make: client?.inverter_make || "",
      inverter_capacity: client?.inverter_capacity || "",
      inverter_serial: client?.inverter_serial || "",
      phase_type: client?.phase_type || "Single Phase",
      subsidy_eligible: client?.subsidy_eligible ?? false,
      status: client?.status || "Lead",
    });
    setEditMode(true);
  };

  const handleCancelEdit = () => {
    setEditData(null);
    setEditMode(false);
  };

  // Redirect to clients list if the client is not found after loading
  useEffect(() => {
    if (!isLoading && client === undefined) nav("/clients");
  }, [isLoading, client, nav]);

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    queryClient.invalidateQueries({ queryKey: ["client-data"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }, [queryClient]);

  const currentStage = React.useMemo(() => {
    if (!client?.stages) return "Onboarding";
    const next = STAGES.find((s) => !client.stages?.[s]);
    return next || STAGES[STAGES.length - 1];
  }, [client]);

  const completedCount = React.useMemo(() => {
    return STAGES.filter((s) => client?.stages?.[s]).length;
  }, [client]);

  const toggleStage = async (stage) => {
    const stages = { ...client.stages, [stage]: !client.stages?.[stage] };
    try {
      await api.patch(`/clients/${id}/stages`, { stages });
      invalidate();
      toast.success(`${stage} ${!client.stages?.[stage] ? "completed" : "reset"}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const updateStatus = async (status) => {
    try { await api.patch(`/clients/${id}/status`, { status }); invalidate(); toast.success("Status updated"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    try { await api.post(`/clients/${id}/notes`, { text: note }); setNote(""); invalidate(); toast.success("Note added"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const generateDoc = async (doc_type) => {
    try {
      const { data } = await api.post(`/clients/${id}/generate-document`, { doc_type });
      toast.success(`${data.label} generated`);
      invalidate();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const saveEdit = async () => {
    if (!editData) return;
    try {
      const payload = {
        ...editData,
        system_kw: Number(editData.system_kw) || 0,
        panel_wattage: Number(editData.panel_wattage) || 0,
        num_panels: Number(editData.num_panels) || 0,
      };
      delete payload.id; delete payload.sol_id; delete payload.created_at; delete payload.updated_at; delete payload.notes; delete payload.progress; delete payload.company_id; delete payload.created_by; delete payload.high_value_assets;
      await api.put(`/clients/${id}`, payload);
      toast.success("Client updated successfully");
      setEditMode(false);
      setEditData(null);
      invalidate();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  if (isLoading || !client) return <div className="text-slate-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <button onClick={() => nav("/clients")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="w-4 h-4" /> Back to Clients</button>

      <Card className="border-slate-200" data-testid="client-id-header">
        <CardContent className="p-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>{client.full_name}</h1>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-semibold">{client.sol_id}</span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> {client.mobile}</span>
              {client.consumer_number && <span>Consumer: <b className="text-slate-900">{client.consumer_number}</b></span>}
              <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {[client.city, client.state].filter(Boolean).join(", ") || "—"}</span>
              <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-slate-400" /> {client.system_kw || 0} kW · {client.phase_type}</span>
              {client.subsidy_eligible && <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded text-xs font-medium">Subsidy Eligible</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={client.status} onValueChange={updateStatus}>
              <SelectTrigger className="w-56" data-testid="status-select"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            {editMode ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleCancelEdit}>Cancel</Button>
                <Button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
              </div>
            ) : (
              <Button variant="outline" onClick={handleStartEdit}>Edit</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress Timeline */}
      <Card className="border-slate-200">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div>
              <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Project Progress</div>
              <div className="text-xs text-slate-500">Current stage, completed steps, and total progress.</div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center sm:text-right sm:grid-cols-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Stage</div>
                <div className="text-sm font-semibold text-slate-900">{currentStage}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Completed</div>
                <div className="text-sm font-semibold text-slate-900">{completedCount} / {STAGES.length}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Progress</div>
                <div className="text-sm font-semibold text-blue-600">{client.progress}%</div>
              </div>
            </div>
          </div>

          <div className="relative" data-testid="progress-timeline">
            <div className="hidden sm:block absolute top-10 left-5 right-5 h-0.5 bg-slate-200 pointer-events-none" />
            <div className="hidden sm:block absolute top-10 left-5 h-0.5 bg-blue-600 transition-all pointer-events-none" style={{ width: `calc((100% - 2.5rem) * ${client.progress / 100})` }} />
            <div className="scrollbar-hidden -mx-4 overflow-x-auto px-4 py-3 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="flex gap-4 min-w-full sm:min-w-0">
                {STAGES.map((s, i) => {
                  const done = !!client.stages?.[s];
                  const isCurrent = currentStage === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStage(s);
                      }}
                      className={`flex min-w-[88px] flex-col items-center rounded-2xl border px-2 py-3 text-center transition-colors cursor-pointer hover:border-blue-300 ${done ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white"} ${isCurrent ? "shadow-lg border-blue-400 bg-blue-100" : ""}`}
                      data-testid={`stage-${s.replace(/\s/g, "-").toLowerCase()}`}
                    >
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${done ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-400"}`}>
                        {done ? <Check className="w-5 h-5" /> : <span className="text-sm font-semibold">{i + 1}</span>}
                      </div>
                      <div className={`mt-2 text-[10px] leading-snug ${done ? "text-slate-900" : "text-slate-500"}`}>{s}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generate Documents */}
      <Card className="border-slate-200 bg-gradient-to-br from-blue-50/40 to-white">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Wand2 className="w-4 h-4 text-blue-600" />
            <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Generate Documents</div>
            <span className="text-xs text-slate-500">— auto-fills from client + company profile and marks the Document Making stage</span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-indigo-300 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 hover:from-indigo-100 hover:to-blue-100 hover:text-indigo-800"
              onClick={() => setTplOpen(true)}
              data-testid="generate-from-template-btn"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Generate from Template (.docx)
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { k: "annexure", l: "Annexure" },
              { k: "wcr", l: "WCR" },
              { k: "sldr", l: "SLDR" },
              { k: "net_meter_agreement", l: "Net Meter Agreement" },
              { k: "vendor_agreement", l: "Vendor Agreement" },
            ].map((d) => (
              <Button key={d.k} variant="outline" size="sm" onClick={() => generateDoc(d.k)} data-testid={`gen-${d.k}`}>
                <FileText className="w-3.5 h-3.5 mr-1.5" /> {d.l} (PDF)
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <TemplateGenerateDialog open={tplOpen} onOpenChange={setTplOpen} clientId={id} onGenerated={invalidate} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-slate-200 lg:col-span-2">
          <CardContent className="p-6">
            <div className="font-semibold text-slate-900 mb-4" style={{ fontFamily: "Outfit" }}>Client & System Details</div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <Row label="Address">{client.address || "—"}, {client.city}, {client.state} {client.pincode}</Row>
              <Row label="Alternate Mobile">{client.alt_mobile || "—"}</Row>
              <Row label="Aadhaar">{client.aadhaar || "—"}</Row>
              <Row label="Panel">{client.panel_make ? `${client.panel_make} · ${client.panel_wattage}W × ${client.num_panels}` : "—"}</Row>
              <Row label="Inverter">{client.inverter_make ? `${client.inverter_make} · ${client.inverter_capacity}` : "—"}</Row>
              <Row label="Inverter Serial">{client.inverter_serial || "—"}</Row>
            </div>

            {editMode && editData && (
              <div className="mt-6 pt-6 border-t border-slate-200 grid md:grid-cols-2 gap-4">
                <EF label="Full Name" v={editData.full_name} k="full_name" set={setEditData} />
                <EF label="Mobile" v={editData.mobile} k="mobile" set={setEditData} />
                <EF label="Alternate Mobile" v={editData.alt_mobile} k="alt_mobile" set={setEditData} />
                <EF label="Consumer #" v={editData.consumer_number} k="consumer_number" set={setEditData} />
                <EF label="Aadhaar #" v={editData.aadhaar} k="aadhaar" set={setEditData} />
                <EF label="System KW" v={editData.system_kw} k="system_kw" type="number" set={setEditData} />
                <EF label="Address" v={editData.address} k="address" set={setEditData} full />
                <EF label="City" v={editData.city} k="city" set={setEditData} />
                <EF label="State" v={editData.state} k="state" set={setEditData} />
                <EF label="Pincode" v={editData.pincode} k="pincode" set={setEditData} />
                <EF label="Panel Make" v={editData.panel_make} k="panel_make" set={setEditData} />
                <EF label="Panel Wattage (Wp)" v={editData.panel_wattage} k="panel_wattage" type="number" set={setEditData} />
                <EF label="Number of Panels" v={editData.num_panels} k="num_panels" type="number" set={setEditData} />
                <EF label="Inverter Make" v={editData.inverter_make} k="inverter_make" set={setEditData} />
                <EF label="Inverter Capacity" v={editData.inverter_capacity} k="inverter_capacity" set={setEditData} />
                <EF label="Inverter Serial" v={editData.inverter_serial} k="inverter_serial" set={setEditData} />
              </div>
            )}

            {client.documents?.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Documents</div>
                <div className="grid md:grid-cols-2 gap-3">
                  {client.documents.map((d, i) => (
                    <a key={i} href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{d.label}</div>
                        <div className="text-xs text-slate-500 truncate">{d.filename}</div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Installed High Value Assets */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Installed High Value Assets</div>
              {(!client.high_value_assets || client.high_value_assets.length === 0) ? (
                <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 border border-dashed border-slate-200">
                  No high-value assets (Solar Panel, Inverter, Battery, etc.) installed for this client yet.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-100 rounded-lg">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                        <th className="p-3 font-semibold">Product</th>
                        <th className="p-3 font-semibold">Qty</th>
                        <th className="p-3 font-semibold">Serial Number</th>
                        <th className="p-3 font-semibold">Installation Date</th>
                        <th className="p-3 font-semibold">Warranty Status</th>
                        <th className="p-3 font-semibold">Current Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {client.high_value_assets.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">
                             <div>{a.product_name}</div>
                             {a.size_model && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{a.size_model}</div>}
                           </td>
                          <td className="p-3 font-medium text-slate-800">{a.quantity !== undefined && a.quantity !== null ? a.quantity : 1}</td>
                          <td className="p-3 font-mono font-medium text-slate-600">{a.serial_number || "—"}</td>
                          <td className="p-3 text-slate-700">{a.installation_date || "—"}</td>
                          <td className="p-3">
                            <span className={`font-semibold ${a.warranty_status === "Active" ? "text-emerald-600" : "text-rose-600"}`}>
                              {a.warranty_status || "—"}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                              {a.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Internal Notes</div>
            </div>
            <div className="space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" rows={3} data-testid="note-input" />
              <Button onClick={addNote} disabled={!note.trim()} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="add-note-button">Add Note</Button>
            </div>
            <div className="mt-5 space-y-3 max-h-96 overflow-y-auto" data-testid="notes-list">
              {(!client.notes || client.notes.length === 0) && <div className="text-sm text-slate-500 text-center py-6">No notes yet.</div>}
              {client.notes?.slice().reverse().map((n) => (
                <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">{n.text}</div>
                  <div className="text-[11px] text-slate-500 mt-1.5">{n.user_name} · {dayjs(n.created_at).format("MMM D, h:mm A")}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Row = ({ label, children }) => (
  <div>
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
    <div className="text-sm text-slate-900 mt-0.5">{children}</div>
  </div>
);

const EF = ({ label, v, k, type = "text", set, full }) => (
  <div className={full ? "md:col-span-2" : ""}>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <Input type={type} value={v !== undefined && v !== null ? v : ""} onChange={(e) => set((prev) => ({ ...prev, [k]: e.target.value }))} className="mt-1" />
  </div>
);
