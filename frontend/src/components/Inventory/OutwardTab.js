import React, { useEffect, useMemo, useState, useRef } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useOutwardList } from "@/hooks/useInventory";
import { useClientList } from "@/hooks/useClients";
import { useAssetList } from "@/hooks/useAssets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, Settings, Pencil, Trash2, Paperclip, ChevronDown, ChevronUp, FileText, FileImage, FileSpreadsheet, CheckCircle2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { Field, SelectField, TextareaField, ConfirmDialog, UNIT_OPTIONS, OUTWARD_REF_TYPES, today, applyDefaults, digitsOnly, ProductAutocompleteInput } from "./_shared";
import { usePermission } from "@/lib/permissions";
import ManualBulkImport from "@/components/ManualBulkImport";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

const CARRY_FORWARD_FIELDS = [
  { key: "date", label: "Date" },
  { key: "outward_challan_no", label: "Challan No." },
  { key: "reference_type", label: "Reference Type" },
  { key: "client_id", label: "Client" },
  { key: "client_name", label: "Client (name)" },
  { key: "project_id", label: "Project ID" },
  { key: "project_name", label: "Project" },
  { key: "unit", label: "Unit" },
  { key: "remarks", label: "Remarks" },
];

const STATUSES = ["Pending", "Dispatched", "Cancelled"];
const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Dispatched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-red-50 text-red-700 border-red-200",
};

const EMPTY = () => ({
  date: today(),
  client_id: "", client_name: "",
  project_id: "", project_name: "",
  outward_challan_no: "",
  reference_type: "Challan Number",
  product: "", size: "", quantity: "", unit: "Nos",
  remarks: "", status: "Dispatched",
  attachment_file_id: "", attachment_filename: "",
  high_value_goods: false,
  serial_number_required: false,
  serial_numbers: [],
  serial_text: "",
});

export default function OutwardTab({ products, defaults, onSaveDefaults, onChanged, globalSearch }) {
  const canCreate = usePermission("data_management", "create");
  const canEdit = usePermission("data_management", "edit");
  const canDelete = usePermission("data_management", "delete");
  const [form, setForm] = useState(() => applyDefaults(EMPTY(), defaults));
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsForm, setDefaultsForm] = useState(defaults);
  const [autoContinue, setAutoContinue] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inv_auto_continue_outward") || "false"); } catch { return false; }
  });
  const [carryFields, setCarryFields] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inv_carry_outward") || '["outward_challan_no","client_id","client_name","project_id","project_name","reference_type","unit","date"]'); }
    catch { return ["outward_challan_no", "client_id", "client_name", "project_id", "project_name", "reference_type", "unit", "date"]; }
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const fileRef = useRef(null);
  const [hvDialogOpen, setHvDialogOpen] = useState(false);
  const [hvDialogData, setHvDialogData] = useState({
    serial_number_required: false,
    serial_text: "",
    serial_numbers: [],
    installation_notes: "",
    warranty_start_date: "",
    asset_remarks: ""
  });

  useEffect(() => { localStorage.setItem("inv_auto_continue_outward", JSON.stringify(autoContinue)); }, [autoContinue]);
  useEffect(() => { localStorage.setItem("inv_carry_outward", JSON.stringify(carryFields)); }, [carryFields]);

  const { data: allAssets = [] } = useAssetList();
  const availableSerials = useMemo(() => {
    if (!form.product) return [];
    return allAssets.filter((a) =>
      a.product_name.toUpperCase() === form.product.toUpperCase() &&
      (a.status === "Available" || (editing && a.outward_entry_id === editing.id))
    );
  }, [allAssets, form.product, editing]);

  const suggestNextChallan = async () => {
    try {
      const prefix = defaults?.outward_challan_no || "";
      const { data } = await api.get("/inventory/next-challan", { params: { type: "outward", prefix } });
      setForm((f) => ({ ...f, outward_challan_no: data.suggested }));
      toast.success(`Next challan: ${data.suggested}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const { data: entries = [], refetch: refetchOutward } = useOutwardList();
  const { data: clients = [] } = useClientList();

  const load = () => {
    refetchOutward();
  };

  useEffect(() => { setDefaultsForm(defaults); }, [defaults]);

  const reset = () => { setForm(applyDefaults(EMPTY(), defaults)); setEditing(null); };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, attachment_file_id: data.id, attachment_filename: data.original_filename || file.name }));
      toast.success("Attachment uploaded");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const submitOutwardActual = async (hvData = {}) => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        ...hvData
      };
      if (editing) {
        await api.patch(`/inventory/outward/${editing.id}`, payload);
        toast.success("Outward entry updated");
        reset();
      } else {
        await api.post("/inventory/outward", payload);
        toast.success("Outward saved");
        if (autoContinue) {
          const carried = {};
          carryFields.forEach((k) => { if (form[k] !== undefined) carried[k] = form[k]; });
          setForm({ ...applyDefaults(EMPTY(), defaults), ...carried });
        } else {
          reset();
        }
      }
      load(); onChanged?.();
      setHvDialogOpen(false);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!form.product?.trim() || !form.quantity || Number(form.quantity) <= 0) {
      toast.error("Product and quantity are required"); return;
    }
    if (form.high_value_goods && form.serial_number_required) {
      setHvDialogData({
        serial_number_required: true,
        serial_text: form.serial_text || "",
        serial_numbers: form.serial_numbers || [],
        installation_notes: form.installation_notes || "",
        warranty_start_date: form.warranty_start_date || "",
        asset_remarks: form.asset_remarks || ""
      });
      setHvDialogOpen(true);
    } else {
      await submitOutwardActual({});
    }
  };

  const startEdit = (e) => {
    setEditing(e);
    const snList = e.serial_numbers || [];
    setForm({
      date: (e.date || "").slice(0, 10),
      client_id: e.client_id || "", client_name: e.client_name || "",
      project_id: e.project_id || "", project_name: e.project_name || "",
      outward_challan_no: e.outward_challan_no || "",
      reference_type: e.reference_type || "Challan Number",
      product: e.product || "", size: e.size || "", quantity: e.quantity || "",
      unit: e.unit || "Nos",
      remarks: e.remarks || "", status: e.status || "Dispatched",
      attachment_file_id: e.attachment_file_id || "", attachment_filename: e.attachment_filename || "",
      high_value_goods: e.high_value_goods || e.high_value_asset || false,
      serial_number_required: snList.length > 0,
      serial_numbers: snList,
      serial_text: snList.join("\n"),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDispatch = async (e) => {
    try {
      await api.patch(`/inventory/outward/${e.id}`, { ...e, status: "Dispatched" });
      toast.success("Dispatch confirmed");
      load(); onChanged?.();
    } catch (err) { toast.error(formatApiError(err)); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/inventory/outward/${confirmDel.id}`);
      toast.success("Outward entry deleted");
      setConfirmDel(null);
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const selectClient = (id) => {
    const c = clients.find((x) => x.id === id);
    if (c) setForm({ ...form, client_id: c.id, client_name: c.full_name, project_id: c.id, project_name: c.full_name });
  };

  const filtered = useMemo(() => {
    if (!globalSearch) return entries;
    const s = globalSearch.toLowerCase();
    return entries.filter((e) =>
      (e.product || "").toLowerCase().includes(s) ||
      (e.client_name || "").toLowerCase().includes(s) ||
      (e.project_name || "").toLowerCase().includes(s) ||
      (e.outward_challan_no || "").toLowerCase().includes(s) ||
      (e.remarks || "").toLowerCase().includes(s)
    );
  }, [entries, globalSearch]);

  const pendingCount = entries.filter((e) => e.status === "Pending").length;

  const saveDefaults = () => { onSaveDefaults?.(defaultsForm); setDefaultsOpen(false); };

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-amber-900">{pendingCount} pending outward {pendingCount === 1 ? "entry" : "entries"} awaiting dispatch confirmation</div>
              <div className="text-xs text-amber-700">Auto-created from approved Material Requests — confirm below to deduct from stock.</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Entry */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                {editing ? `Editing Outward · ${editing.product}` : "Quick Outward Entry"}
              </div>
              <div className="text-xs text-slate-500">{editing ? `#${editing.outward_challan_no || editing.id.slice(0, 8)}` : "Dispatch material to a client / project"}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50" data-testid="out-auto-continue-toggle">
                <input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                Auto-continue
              </label>
              <Button variant="outline" size="sm" onClick={() => setDefaultsOpen((o) => !o)} data-testid="outward-defaults-toggle">
                <Settings className="w-3.5 h-3.5 mr-1.5" /> Default Settings
                {defaultsOpen ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </div>

          {autoContinue && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs" data-testid="out-carry-panel">
              <div className="font-semibold text-blue-800 mb-1.5">Carry-forward fields — these values stay on the form after each save</div>
              <div className="flex flex-wrap gap-1.5">
                {CARRY_FORWARD_FIELDS.map((f) => {
                  const active = carryFields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      onClick={() => setCarryFields(active ? carryFields.filter((k) => k !== f.key) : [...carryFields, f.key])}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${active ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
                      data-testid={`out-carry-${f.key}`}
                    >
                      {active ? "✓ " : ""}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {defaultsOpen && (
            <div className="mb-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-3" data-testid="outward-defaults-panel">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Default values — auto-loaded on every new outward</div>
              <div className="grid md:grid-cols-3 gap-3">
                <Field label="Default Client" value={defaultsForm.client_name} onChange={(v) => setDefaultsForm({ ...defaultsForm, client_name: v })} placeholder="Pick from client list manually" testid="def-client" />
                <Field label="Default Outward Challan Prefix" value={defaultsForm.outward_challan_no} onChange={(v) => setDefaultsForm({ ...defaultsForm, outward_challan_no: digitsOnly(v) })} placeholder="(numeric start, e.g. 1001)" testid="def-out-prefix" inputMode="numeric" pattern="[0-9]*" />
                <Field label="Default Date" type="date" value={defaultsForm.date} onChange={(v) => setDefaultsForm({ ...defaultsForm, date: v })} testid="def-out-date" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setDefaultsOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={saveDefaults} data-testid="save-outward-defaults"><Save className="w-3.5 h-3.5 mr-1.5" /> Save Defaults</Button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="outward-form">
            <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testid="out-date" />
            <SelectField
              label="Reference Type"
              value={form.reference_type}
              onChange={(v) => setForm({ ...form, reference_type: v })}
              options={OUTWARD_REF_TYPES}
              testid="out-ref-type"
            />
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Outward Challan No.</label>
              <div className="mt-1.5 flex gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.outward_challan_no}
                  onChange={(e) => setForm({ ...form, outward_challan_no: digitsOnly(e.target.value) })}
                  placeholder="00001"
                  className="flex-1 h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 tabular-nums"
                  data-testid="out-challan"
                />
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={suggestNextChallan} title="Auto-suggest next challan" data-testid="out-challan-suggest"><Wand2 className="w-4 h-4 text-indigo-600" /></Button>
              </div>
            </div>
            <SelectField label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={STATUSES} testid="out-status" />

            <div className="md:col-span-2">
              <SelectField label="Client" value={form.client_id} onChange={selectClient} options={clients.map((c) => ({ value: c.id, label: c.full_name }))} allowEmpty placeholder="Select client" testid="out-client" />
              {!form.client_id && form.client_name && <div className="text-[10px] text-slate-400 mt-1">Free text: {form.client_name}</div>}
            </div>
            <Field label="Project" value={form.project_name} onChange={(v) => setForm({ ...form, project_name: v })} placeholder="Project label" testid="out-project" />

            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Product Name<span className="text-red-500 ml-0.5">*</span></label>
              <div className="mt-1.5">
                <ProductAutocompleteInput
                  value={form.product}
                  onChange={(v) => {
                    let pName = "";
                    let sizeVal = form.size || "";
                    let unitVal = form.unit || "Nos";
                    let isHighValue = false;
                    let isSerialRequired = false;

                    if (typeof v === "object" && v !== null) {
                      pName = (v.name || "").toUpperCase();
                      sizeVal = v.size || "";
                      unitVal = v.unit || "Nos";
                      isHighValue = Boolean(v.high_value_goods || v.high_value_asset);
                      isSerialRequired = Boolean(v.serial_number_required);
                    } else {
                      pName = v.toUpperCase();
                      const matched = products.find(p => p.name.toUpperCase() === pName);
                      if (matched) {
                        isHighValue = Boolean(matched.high_value_goods || matched.high_value_asset);
                        isSerialRequired = Boolean(matched.serial_number_required);
                        sizeVal = matched.size || "";
                        unitVal = matched.unit || "Nos";
                      } else {
                        const highValueKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "NET METER", "BATTERY"];
                        isHighValue = highValueKeywords.some(keyword => pName.includes(keyword));
                      }
                    }
                    setForm(prev => ({
                      ...prev,
                      product: pName,
                      size: sizeVal,
                      unit: unitVal,
                      high_value_goods: isHighValue,
                      high_value_asset: isHighValue,
                      serial_number_required: isSerialRequired,
                      serial_numbers: prev.product === pName ? prev.serial_numbers : [],
                      serial_text: prev.product === pName ? prev.serial_text : ""
                    }));
                  }}
                  products={products}
                  placeholder="e.g. WAAREE PANEL 540W"
                  testid="out-product"
                  required
                />
              </div>
            </div>
            <Field label="Size / Spec" value={form.size} onChange={(v) => setForm({ ...form, size: v })} placeholder="e.g. 540W Mono PERC" testid="out-size" />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} required testid="out-qty" />
              <SelectField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNIT_OPTIONS} testid="out-unit" />
            </div>

            {/* High Value Goods Checkbox & Inside Sub-option */}
            {form.high_value_goods && (
              <div className="md:col-span-3 lg:col-span-4 flex flex-col gap-2 py-2 border-t border-slate-100 mt-2">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.high_value_goods || false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm(prev => ({
                        ...prev,
                        high_value_goods: checked,
                        high_value_asset: checked,
                        serial_number_required: checked ? prev.serial_number_required : false
                      }));
                    }}
                    className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                  />
                  High Value Goods
                </label>

                {/* Sub-option inside High Value Goods (Default OFF) */}
                <div className="ml-6 flex items-center gap-2 py-1 bg-slate-50 p-2 rounded-md border border-slate-200 w-fit">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.serial_number_required || false}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm(prev => ({ ...prev, serial_number_required: checked }));
                      }}
                      className="w-3.5 h-3.5 accent-blue-600 rounded border-slate-300"
                      data-testid="out-serial-number-toggle"
                    />
                    Serial No. (ON / OFF)
                  </label>
                </div>
              </div>
            )}

            <TextareaField label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} testid="out-remarks" full />

            <div className="md:col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachment</div>
              <input type="file" ref={fileRef} className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="out-attach-input" />
              {form.attachment_filename ? (
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-xs">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <a href={fileUrl(form.attachment_file_id)} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{form.attachment_filename}</a>
                  <button type="button" onClick={() => setForm({ ...form, attachment_file_id: "", attachment_filename: "" })} className="text-slate-400 hover:text-red-600">×</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="out-attach-btn">
                  <Paperclip className="w-3.5 h-3.5 mr-1.5" /> {uploading ? "Uploading…" : "Attach delivery doc"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy || (!editing && !canCreate) || (editing && !canEdit)} data-testid="save-outward-btn">
              <Save className="w-4 h-4 mr-1.5" /> {editing ? "Update Outward" : "Save Outward"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy} data-testid="reset-outward-btn">
              <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
            </Button>
            <div className="flex-1" />
            {canCreate && (
              <Button variant="outline" className="border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                onClick={() => setManualOpen(true)}
                data-testid="manual-import-outward-btn"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Manual Bulk Import
              </Button>
            )}          </div>
        </CardContent>
      </Card>

      {/* Recent outward */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Recent Outward Entries</div>
            <Badge variant="outline" className="text-[10px]">{filtered.length} / {entries.length}</Badge>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm" data-testid="outward-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Client / Project</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Out. Challan</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No outward entries yet</td></tr>
                ) : filtered.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60" data-testid={`outward-row-${e.id}`}>
                    <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums">{dayjs(e.date).format("DD MMM YYYY")}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900 text-xs">{e.product}</div>
                      {e.size && <div className="text-[10px] text-slate-400 mt-0.5">{e.size}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{e.quantity} <span className="text-[10px] text-slate-500 font-normal">{e.unit || "Nos"}</span></td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-slate-700">{e.client_name || "—"}</div>
                      {e.project_name && e.project_name !== e.client_name && <div className="text-[10px] text-slate-400">{e.project_name}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-mono text-slate-700">{e.outward_challan_no || e.reference_number || "—"}</div>
                      {e.attachment_file_id && (
                        <a href={fileUrl(e.attachment_file_id)} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1">
                          {(e.attachment_filename || "").match(/\.(png|jpe?g|webp)$/i) ? <FileImage className="w-3 h-3" /> : <FileText className="w-3 h-3" />} attachment
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[e.status || "Dispatched"] || ""} text-[10px]`}>{e.status || "Dispatched"}</Badge>
                      {e.source === "auto-material-request" && <div className="text-[9px] text-slate-400 mt-0.5">Auto · Material Req</div>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {e.status === "Pending" && (
                        <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-[11px] mr-1" onClick={() => confirmDispatch(e)} data-testid={`dispatch-${e.id}`}>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Dispatch
                        </Button>
                      )}
                      {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(e)} data-testid={`edit-outward-${e.id}`}><Pencil className="w-3.5 h-3.5" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDel(e)} data-testid={`del-outward-${e.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete outward entry?"
        description={confirmDel ? `${confirmDel.product} × ${confirmDel.quantity} ${confirmDel.unit || "Nos"} to ${confirmDel.client_name || "—"}. Stock will be added back.` : ""}
        onConfirm={doDelete}
      />

      <ManualBulkImport open={manualOpen} onOpenChange={setManualOpen} mode="outward" products={products} onImported={() => { load(); onChanged?.(); }} />

      <Dialog open={hvDialogOpen} onOpenChange={setHvDialogOpen}>
        <DialogContent className="max-w-md bg-white border border-slate-200 shadow-xl rounded-xl" data-testid="hv-outward-dialog">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-semibold text-base" style={{ fontFamily: "Outfit" }}>High Value Goods Dispatch Details</DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Enter serial numbers and optional installation details for <strong>{form.product}</strong> (Qty: {form.quantity}).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm text-left">
            <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hvDialogData.serial_number_required || false}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setHvDialogData(prev => ({
                    ...prev,
                    serial_number_required: checked,
                    serial_numbers: checked ? prev.serial_numbers : []
                  }));
                }}
                className="w-4 h-4 accent-blue-600 rounded border-slate-300"
              />
              Serial No. (ON / OFF)
            </label>

            {hvDialogData.serial_number_required && (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Enter / Paste Serial Numbers</div>
                <Textarea
                  rows={3}
                  placeholder={`SN001\nSN002\nSN003`}
                  value={hvDialogData.serial_text || ""}
                  onChange={(e) => {
                    const text = e.target.value;
                    const parsed = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
                    setHvDialogData(prev => ({ ...prev, serial_text: text, serial_numbers: parsed }));
                  }}
                  className="font-mono text-xs bg-white border border-slate-200 rounded-lg p-2 w-full focus:ring-1 focus:ring-blue-500 text-slate-800"
                />
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-slate-500">
                    Entered: <strong>{hvDialogData.serial_numbers.length}</strong> / <strong>{Math.floor(Number(form.quantity) || 0)}</strong>
                  </span>
                  {hvDialogData.serial_numbers.length === Math.floor(Number(form.quantity) || 0) ? (
                    <span className="text-emerald-600 font-semibold">✓ Matches quantity</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">✗ Must match quantity</span>
                  )}
                </div>
              </div>
            )}

            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Installation Notes (Optional)</Label>
              <Input
                value={hvDialogData.installation_notes || ""}
                onChange={(e) => setHvDialogData(prev => ({ ...prev, installation_notes: e.target.value }))}
                placeholder="e.g. Installed on south-facing roof"
                className="mt-1 bg-white"
              />
            </div>

            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Warranty Start Date (Optional)</Label>
              <Input
                type="date"
                value={hvDialogData.warranty_start_date || ""}
                onChange={(e) => setHvDialogData(prev => ({ ...prev, warranty_start_date: e.target.value }))}
                className="mt-1 bg-white"
              />
            </div>

            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Asset Remarks (Optional)</Label>
              <Input
                value={hvDialogData.asset_remarks || ""}
                onChange={(e) => setHvDialogData(prev => ({ ...prev, asset_remarks: e.target.value }))}
                placeholder="Remarks specific to this asset batch"
                className="mt-1 bg-white"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setHvDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => {
                if (hvDialogData.serial_number_required) {
                  const reqCount = Math.floor(Number(form.quantity) || 0);
                  if (hvDialogData.serial_numbers.length !== reqCount) {
                    toast.error(`Please enter exactly ${reqCount} serial number(s).`);
                    return;
                  }
                }
                submitOutwardActual(hvDialogData);
              }}
            >
              Dispatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
