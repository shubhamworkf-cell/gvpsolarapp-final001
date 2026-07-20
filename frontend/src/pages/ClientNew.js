import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { useCreateClient } from "@/hooks/useClients";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, X } from "lucide-react";

export default function ClientNew() {
  const nav = useNavigate();
  const [tab, setTab] = useState("client");
  const [form, setForm] = useState({
    full_name: "", mobile: "", alt_mobile: "", consumer_number: "", address: "", city: "", state: "", pincode: "", aadhaar: "",
    system_kw: 0, panel_make: "", panel_wattage: 0, num_panels: 0, inverter_make: "", inverter_capacity: "", inverter_serial: "",
    phase_type: "Single Phase", subsidy_eligible: false, status: "Lead", documents: [],
  });
  const createClient = useCreateClient();
  const saving = createClient.isPending;
  const [uploading, setUploading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const upload = async (e, label) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "client");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, documents: [...(f.documents || []), { ...data, label }] }));
      toast.success(`${label} uploaded`);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setUploading(false); e.target.value = ""; }
  };

  const submit = async () => {
    if (!form.full_name || !form.mobile) { toast.error("Name and Mobile are required"); setTab("client"); return; }
    
    const payload = { ...form, system_kw: Number(form.system_kw) || 0, panel_wattage: Number(form.panel_wattage) || 0, num_panels: Number(form.num_panels) || 0 };
    createClient.mutate(payload, {
      onSuccess: (data) => {
        toast.success(`Client created: ${data.sol_id}`);
        nav(`/clients/${data.id}`);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <button onClick={() => nav("/clients")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 mb-2"><ArrowLeft className="w-4 h-4" /> Back to Clients</button>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>New Client</h1>
        </div>
        <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="save-client-btn">{saving ? "Saving…" : "Save Client"}</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} data-testid="new-client-form">
        <TabsList className="bg-white border border-slate-200">
          <TabsTrigger value="client" data-testid="tab-client-details">1. Client Details</TabsTrigger>
          <TabsTrigger value="system" data-testid="tab-system-details">2. System Details</TabsTrigger>
          <TabsTrigger value="docs" data-testid="tab-docs">3. Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="client">
          <Card className="border-slate-200">
            <CardContent className="p-6 grid md:grid-cols-2 gap-5">
              <F label="Full Name *"><Input value={form.full_name} onChange={set("full_name")} required data-testid="client-fullname" /></F>
              <F label="Mobile *"><Input value={form.mobile} onChange={set("mobile")} required data-testid="client-mobile" /></F>
              <F label="Alternate Mobile"><Input value={form.alt_mobile} onChange={set("alt_mobile")} /></F>
              <F label="Consumer Number"><Input value={form.consumer_number} onChange={set("consumer_number")} data-testid="client-consumer" /></F>
              <F label="Address" full><Input value={form.address} onChange={set("address")} /></F>
              <F label="City"><Input value={form.city} onChange={set("city")} /></F>
              <F label="State"><Input value={form.state} onChange={set("state")} /></F>
              <F label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></F>
              <F label="Aadhaar (Optional)"><Input value={form.aadhaar} onChange={set("aadhaar")} /></F>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system">
          <Card className="border-slate-200">
            <CardContent className="p-6 grid md:grid-cols-2 gap-5">
              <F label="System Size (KW)"><Input type="number" step="0.01" value={form.system_kw} onChange={set("system_kw")} data-testid="system-kw" /></F>
              <F label="Panel Make"><Input value={form.panel_make} onChange={set("panel_make")} /></F>
              <F label="Panel Wattage (W)"><Input type="number" value={form.panel_wattage} onChange={set("panel_wattage")} /></F>
              <F label="Number of Panels"><Input type="number" value={form.num_panels} onChange={set("num_panels")} /></F>
              <F label="Inverter Make"><Input value={form.inverter_make} onChange={set("inverter_make")} /></F>
              <F label="Inverter Capacity"><Input value={form.inverter_capacity} onChange={set("inverter_capacity")} /></F>
              <F label="Inverter Serial #"><Input value={form.inverter_serial} onChange={set("inverter_serial")} /></F>
              <F label="Phase Type">
                <Select value={form.phase_type} onValueChange={(v) => setForm({ ...form, phase_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Phase">Single Phase</SelectItem>
                    <SelectItem value="Three Phase">Three Phase</SelectItem>
                  </SelectContent>
                </Select>
              </F>
              <F label="Subsidy Eligible">
                <div className="flex items-center gap-3 h-10">
                  <Switch checked={form.subsidy_eligible} onCheckedChange={(v) => setForm({ ...form, subsidy_eligible: v })} data-testid="subsidy-switch" />
                  <span className="text-sm text-slate-600">{form.subsidy_eligible ? "Yes" : "No"}</span>
                </div>
              </F>
              <F label="Status">
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Lead", "Survey Pending", "Quotation Sent", "Approved", "Installation Pending", "Installation Complete", "Handover Complete"].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </F>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card className="border-slate-200">
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                {["Aadhaar", "Electricity Bill", "Site Photo", "Other Document"].map((label) => (
                  <label key={label} className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer transition-colors" data-testid={`upload-${label.replace(/\s/g, "-").toLowerCase()}`}>
                    <Upload className="w-6 h-6 text-slate-400 mb-2" />
                    <div className="text-sm font-medium text-slate-700">{label}</div>
                    <div className="text-xs text-slate-500 mt-1">PDF, JPG, PNG (max 10MB)</div>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => upload(e, label)} />
                  </label>
                ))}
              </div>
              {uploading && <div className="text-sm text-blue-600">Uploading…</div>}
              {form.documents?.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Uploaded ({form.documents.length})</div>
                  {form.documents.map((d, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-900">{d.label}</div>
                        <div className="text-xs text-slate-500">{d.filename}</div>
                      </div>
                      <button type="button" className="text-slate-400 hover:text-red-500" onClick={() => setForm((f) => ({ ...f, documents: f.documents.filter((_, idx) => idx !== i) }))}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const F = ({ label, children, full }) => (
  <div className={full ? "md:col-span-2" : ""}>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);
