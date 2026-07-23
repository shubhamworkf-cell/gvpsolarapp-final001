import React, { useEffect, useMemo, useState, useRef } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useInwardList } from "@/hooks/useInventory";
import { useClientList } from "@/hooks/useClients";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RotateCcw, Settings, Pencil, Trash2, Paperclip, ChevronDown, ChevronUp, FileText, FileImage, FileSpreadsheet, Wand2 } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { Field, SelectField, TextareaField, ConfirmDialog, UNIT_OPTIONS, REF_TYPES, SRC_TYPES, today, applyDefaults, digitsOnly, ProductAutocompleteInput } from "./_shared";
import ManualBulkImport from "@/components/ManualBulkImport";
import { usePermission } from "@/lib/permissions";

const CARRY_FORWARD_FIELDS = [
  { key: "date", label: "Date" },
  { key: "reference_type", label: "Reference Type" },
  { key: "reference_number", label: "Challan No." },
  { key: "bill_number", label: "Bill No." },
  { key: "source_type", label: "Source Type" },
  { key: "source_name", label: "Vendor" },
  { key: "unit", label: "Unit" },
  { key: "remarks", label: "Remarks" },
];

const EMPTY = () => ({
  date: today(),
  reference_number: "", reference_type: "Challan Number",
  source_type: "Supplier", source_name: "",
  client_id: "", client_name: "",
  product: "", size: "", quantity: "", unit: "Nos",
  bill_number: "", remarks: "",
  attachment_file_id: "", attachment_filename: "",
  high_value_asset: false,
  serial_number_required: false,
  serial_numbers: [],
});

export default function InwardTab({ products, defaults, onSaveDefaults, onChanged, globalSearch }) {
  const canCreate = usePermission("data_management", "create");
  const canEdit = usePermission("data_management", "edit");
  const canDelete = usePermission("data_management", "delete");
  const [form, setForm] = useState(() => applyDefaults(EMPTY(), defaults));
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [defaultsForm, setDefaultsForm] = useState(defaults);
  const [autoContinue, setAutoContinue] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inv_auto_continue_inward") || "false"); } catch { return false; }
  });
  const [carryFields, setCarryFields] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inv_carry_inward") || '["source_name","source_type","reference_type","unit","date"]'); }
    catch { return ["source_name", "source_type", "reference_type", "unit", "date"]; }
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { localStorage.setItem("inv_auto_continue_inward", JSON.stringify(autoContinue)); }, [autoContinue]);
  useEffect(() => { localStorage.setItem("inv_carry_inward", JSON.stringify(carryFields)); }, [carryFields]);

  const suggestNextChallan = async () => {
    try {
      const prefix = defaults?.reference_number || "";
      const { data } = await api.get("/inventory/next-challan", { params: { type: "inward", prefix } });
      setForm((f) => ({ ...f, reference_number: data.suggested }));
      toast.success(`Next challan: ${data.suggested}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const { data: entries = [], refetch: refetchInward } = useInwardList();
  const { data: clients = [] } = useClientList();

  const load = () => {
    refetchInward();
  };

  useEffect(() => { setDefaultsForm(defaults); }, [defaults]);

  // Reset = apply defaults; preserve nothing
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

  const submit = async () => {
    if (!form.product?.trim() || !form.quantity || Number(form.quantity) <= 0) {
      toast.error("Product and quantity are required"); return;
    }
    const isSNReq = Boolean(form.high_value_asset && form.serial_number_required);
    if (isSNReq) {
      const qty = Math.floor(Number(form.quantity) || 0);
      const serials = (form.serial_numbers || []).map(s => (s || "").trim().toUpperCase());
      if (serials.length !== qty) {
        toast.error(`Quantity is ${qty}. Exactly ${qty} serial numbers are required.`);
        return;
      }
      if (serials.some(s => !s)) {
        toast.error("Blank serial numbers are not allowed when Serial Number Required is ON.");
        return;
      }
      const uniqueSet = new Set(serials);
      if (uniqueSet.size !== serials.length) {
        toast.error("Duplicate serial numbers detected. Each serial number must be unique.");
        return;
      }
    }
    setBusy(true);
    try {
      const payload = { ...form, quantity: Number(form.quantity) };
      if (editing) {
        await api.patch(`/inventory/inward/${editing.id}`, payload);
        toast.success("Inward entry updated");
        reset();
      } else {
        await api.post("/inventory/inward", payload);
        toast.success("Inward saved");
        if (autoContinue) {
          // carry-forward selected fields, blank the rest
          const carried = {};
          carryFields.forEach((k) => { if (form[k] !== undefined) carried[k] = form[k]; });
          setForm({ ...applyDefaults(EMPTY(), defaults), ...carried });
        } else {
          reset();
        }
      }
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const startEdit = (e) => {
    setEditing(e);
    setForm({
      date: (e.date || "").slice(0, 10),
      reference_number: e.reference_number || "", reference_type: e.reference_type || "Challan Number",
      source_type: e.source_type || "Supplier", source_name: e.source_name || "",
      client_id: e.client_id || "", client_name: e.client_name || "",
      product: e.product || "", size: e.size || "", quantity: e.quantity || "",
      unit: e.unit || "Nos",
      bill_number: e.bill_number || "", remarks: e.remarks || "",
      attachment_file_id: e.attachment_file_id || "", attachment_filename: e.attachment_filename || "",
      high_value_asset: e.high_value_asset || false,
      serial_numbers: e.serial_numbers || [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/inventory/inward/${confirmDel.id}`);
      toast.success("Inward entry deleted");
      setConfirmDel(null);
      load(); onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = useMemo(() => {
    if (!globalSearch) return entries;
    const s = globalSearch.toLowerCase();
    return entries.filter((e) =>
      (e.product || "").toLowerCase().includes(s) ||
      (e.source_name || "").toLowerCase().includes(s) ||
      (e.reference_number || "").toLowerCase().includes(s) ||
      (e.bill_number || "").toLowerCase().includes(s) ||
      (e.remarks || "").toLowerCase().includes(s)
    );
  }, [entries, globalSearch]);

  const saveDefaults = () => { onSaveDefaults?.(defaultsForm); setDefaultsOpen(false); };

  return (
    <div className="space-y-4">
      {/* Quick Entry Form */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>
                {editing ? `Editing Inward · ${editing.product}` : "Quick Inward Entry"}
              </div>
              <div className="text-xs text-slate-500">{editing ? `#${editing.reference_number || editing.id.slice(0, 8)}` : "Receive material from a supplier or vendor"}</div>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none px-2.5 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50" data-testid="auto-continue-toggle">
                <input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                Auto-continue
              </label>
              <Button variant="outline" size="sm" onClick={() => setDefaultsOpen((o) => !o)} data-testid="inward-defaults-toggle">
                <Settings className="w-3.5 h-3.5 mr-1.5" /> Default Settings
                {defaultsOpen ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
              </Button>
            </div>
          </div>

          {/* Carry-forward chips */}
          {autoContinue && (
            <div className="mb-4 p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs" data-testid="carry-forward-panel">
              <div className="font-semibold text-blue-800 mb-1.5">Carry-forward fields — these values stay on the form after each save</div>
              <div className="flex flex-wrap gap-1.5">
                {CARRY_FORWARD_FIELDS.map((f) => {
                  const active = carryFields.includes(f.key);
                  return (
                    <button
                      key={f.key}
                      onClick={() => setCarryFields(active ? carryFields.filter((k) => k !== f.key) : [...carryFields, f.key])}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${active ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
                      data-testid={`carry-${f.key}`}
                    >
                      {active ? "✓ " : ""}{f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Default Settings panel */}
          {defaultsOpen && (
            <div className="mb-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 space-y-3" data-testid="inward-defaults-panel">
              <div className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">Default values — auto-loaded on every new inward</div>
              <div className="grid md:grid-cols-3 gap-3">
                <SelectField label="Default Source Type" value={defaultsForm.source_type} onChange={(v) => setDefaultsForm({ ...defaultsForm, source_type: v })} options={SRC_TYPES} testid="def-source-type" />
                <Field label="Default Vendor / Source" value={defaultsForm.source_name} onChange={(v) => setDefaultsForm({ ...defaultsForm, source_name: v })} placeholder="e.g. INA Solar" testid="def-source-name" />
                <SelectField label="Default Reference Type" value={defaultsForm.reference_type} onChange={(v) => setDefaultsForm({ ...defaultsForm, reference_type: v })} options={REF_TYPES} testid="def-ref-type" />
                <Field label="Default Challan Prefix" value={defaultsForm.reference_number} onChange={(v) => setDefaultsForm({ ...defaultsForm, reference_number: digitsOnly(v) })} placeholder="(numeric start, e.g. 1001)" testid="def-ref-prefix" inputMode="numeric" pattern="[0-9]*" />
                <SelectField label="Default Unit" value={defaultsForm.unit} onChange={(v) => setDefaultsForm({ ...defaultsForm, unit: v })} options={UNIT_OPTIONS} testid="def-unit" />
                <Field label="Default Date" type="date" value={defaultsForm.date} onChange={(v) => setDefaultsForm({ ...defaultsForm, date: v })} testid="def-date" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setDefaultsOpen(false)}>Cancel</Button>
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={saveDefaults} data-testid="save-inward-defaults"><Save className="w-3.5 h-3.5 mr-1.5" /> Save Defaults</Button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="inward-form">
            <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} testid="in-date" />
            <SelectField label="Reference Type" value={form.reference_type} onChange={(v) => setForm({ ...form, reference_type: v })} options={REF_TYPES} testid="in-ref-type" />
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Challan No.</label>
              <div className="mt-1.5 flex gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.reference_number}
                  onChange={(e) => setForm({ ...form, reference_number: digitsOnly(e.target.value) })}
                  placeholder="00001"
                  className="flex-1 h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 tabular-nums"
                  data-testid="in-challan"
                />
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={suggestNextChallan} title="Auto-suggest next challan" data-testid="in-challan-suggest"><Wand2 className="w-4 h-4 text-indigo-600" /></Button>
              </div>
            </div>
            <Field label="Bill Number" value={form.bill_number} onChange={(v) => setForm({ ...form, bill_number: digitsOnly(v) })} placeholder="00001" testid="in-bill" inputMode="numeric" pattern="[0-9]*" />

            <SelectField label="Source Type" value={form.source_type} onChange={(v) => setForm({ ...form, source_type: v, client_id: "", client_name: "", source_name: "" })} options={SRC_TYPES} testid="in-src-type" />
            {form.source_type === "Return From Client" ? (
              <div className="md:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Searchable Client <span className="text-red-500 ml-0.5">*</span></label>
                <input
                  type="text"
                  value={form.client_name || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const c = clients.find((x) => x.full_name.toUpperCase() === val.toUpperCase());
                    if (c) {
                      setForm({ ...form, client_id: c.id, client_name: c.full_name, source_name: c.full_name });
                    } else {
                      setForm({ ...form, client_name: val, client_id: "", source_name: val });
                    }
                  }}
                  placeholder="Type to search onboarding clients…"
                  className="flex-1 mt-1.5 h-10 px-3 py-2 w-full text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  list="inward-client-list"
                  data-testid="in-client-search"
                />
                <datalist id="inward-client-list">
                  {clients.map((c) => <option key={c.id} value={c.full_name} />)}
                </datalist>
                {!form.client_id && form.client_name && (
                  <div className="text-[10px] text-red-500 mt-1">Please select an existing onboarding client from the list</div>
                )}
              </div>
            ) : (
              <div className="md:col-span-2">
                <Field label="Vendor / Source Name" value={form.source_name} onChange={(v) => setForm({ ...form, source_name: v })} placeholder="Supplier company name" testid="in-src-name" required />
              </div>
            )}

            <div className="md:col-span-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Product Name<span className="text-red-500 ml-0.5">*</span></label>
              <div className="mt-1.5">
                <ProductAutocompleteInput
                  value={form.product}
                  onChange={(v) => {
                    let pName = "";
                    let sizeVal = form.size || "";
                    let unitVal = form.unit || "Nos";
                    let rateVal = form.rate || "";
                    let isHighValue = false;
                    let isSerialRequired = false;

                    if (typeof v === "object" && v !== null) {
                      pName = (v.name || "").toUpperCase();
                      sizeVal = v.size || "";
                      unitVal = v.unit || "Nos";
                      rateVal = (v.rate !== undefined && v.rate !== null) ? String(v.rate) : "";
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
                        rateVal = (matched.rate !== undefined && matched.rate !== null) ? String(matched.rate) : "";
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
                      rate: rateVal,
                      high_value_asset: isHighValue,
                      high_value_goods: isHighValue,
                      serial_number_required: isSerialRequired
                    }));
                  }}
                  products={products}
                  placeholder="e.g. WAAREE PANEL 540W"
                  testid="in-product"
                  required
                />
              </div>
            </div>
            <Field label="Size / Spec" value={form.size} onChange={(v) => setForm({ ...form, size: v })} placeholder="e.g. 540W Mono PERC" testid="in-size" />
            <div className="grid grid-cols-2 gap-2">
              <Field
                label="Quantity"
                type="number"
                value={form.quantity}
                onChange={(v) => {
                  const qty = Math.floor(Number(v) || 0);
                  setForm(prev => {
                    const currentSerials = prev.serial_numbers || [];
                    const updatedSerials = Array(qty).fill("").map((_, idx) => currentSerials[idx] || "");
                    return { ...prev, quantity: v, serial_numbers: updatedSerials };
                  });
                }}
                required
                testid="in-qty"
              />
              <SelectField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNIT_OPTIONS} testid="in-unit" />
            </div>

            {/* High Value Asset Checkbox & Inside Sub-option */}
            <div className="md:col-span-3 lg:col-span-4 flex flex-col gap-2 py-1">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.high_value_asset || false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm(prev => ({
                      ...prev,
                      high_value_asset: checked,
                      serial_number_required: checked ? prev.serial_number_required : false
                    }));
                  }}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                />
                High Value Asset
              </label>

              {/* Sub-option inside High Value Asset (Default OFF) */}
              {form.high_value_asset && (
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
                      data-testid="in-serial-number-toggle"
                    />
                    Serial No. (ON / OFF)
                  </label>
                </div>
              )}
            </div>

            {/* Serial Numbers Generation Section (Only shown when High Value Asset AND Serial No. ON) */}
            {form.high_value_asset && form.serial_number_required && (
              <div className="md:col-span-3 lg:col-span-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Serial Numbers Tracking</div>
                    <div className="text-[11px] text-slate-500">Provide exactly {Math.floor(Number(form.quantity) || 0)} serial numbers.</div>
                  </div>
                  <div className="w-full sm:w-auto">
                    <textarea
                      placeholder="Paste all serial numbers here (separated by comma, space or newline) to auto-fill..."
                      rows={2}
                      onChange={(e) => {
                        const text = e.target.value;
                        const list = text.split(/[\n,\t\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                        const qty = Math.floor(Number(form.quantity) || 0);
                        const updated = Array(qty).fill("").map((_, i) => list[i] || (form.serial_numbers?.[i] || ""));
                        setForm(prev => ({ ...prev, serial_numbers: updated }));
                      }}
                      className="w-full sm:w-80 text-xs p-2 rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-1">
                  {Array.from({ length: Math.floor(Number(form.quantity) || 0) }).map((_, i) => (
                    <div key={i} className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-600">Serial No. {i + 1}</label>
                      <input
                        type="text"
                        placeholder={`Serial No. ${i + 1}`}
                        value={form.serial_numbers?.[i] || ""}
                        onChange={(e) => {
                          const updated = [...(form.serial_numbers || [])];
                          updated[i] = e.target.value.toUpperCase();
                          setForm(prev => ({ ...prev, serial_numbers: updated }));
                        }}
                        className="flex-1 h-9 px-3 py-1.5 w-full text-xs rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <TextareaField label="Remarks" value={form.remarks} onChange={(v) => setForm({ ...form, remarks: v })} testid="in-remarks" full />

            {/* Attachment */}
            <div className="md:col-span-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachment</div>
              <input type="file" ref={fileRef} className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="in-attach-input" />
              {form.attachment_filename ? (
                <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-xs">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <a href={fileUrl(form.attachment_file_id)} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{form.attachment_filename}</a>
                  <button type="button" onClick={() => setForm({ ...form, attachment_file_id: "", attachment_filename: "" })} className="text-slate-400 hover:text-red-600">×</button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="mt-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="in-attach-btn">
                  <Paperclip className="w-3.5 h-3.5 mr-1.5" /> {uploading ? "Uploading…" : "Attach challan / bill"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-100">
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy || (!editing && !canCreate) || (editing && !canEdit)} data-testid="save-inward-btn">
              <Save className="w-4 h-4 mr-1.5" /> {editing ? "Update Inward" : "Save Inward"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy} data-testid="reset-inward-btn">
              <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
            </Button>
            <div className="flex-1" />
            {canCreate && (
              <Button variant="outline" className="border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                onClick={() => setManualOpen(true)}
                data-testid="manual-import-inward-btn"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" /> Manual Bulk Import
              </Button>
            )}          </div>
        </CardContent>
      </Card>

      {/* Recent entries */}
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Recent Inward Entries</div>
            <Badge variant="outline" className="text-[10px]">{filtered.length} / {entries.length}</Badge>
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm" data-testid="inward-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Vendor</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Challan / Bill</th>
                  <th className="px-4 py-2.5 text-left font-semibold">By</th>
                  <th className="px-4 py-2.5 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No inward entries yet</td></tr>
                ) : filtered.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/60" data-testid={`inward-row-${e.id}`}>
                    <td className="px-4 py-2.5 text-xs text-slate-700 tabular-nums">{dayjs(e.date).format("DD MMM YYYY")}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-slate-900 text-xs">{e.product}</div>
                      {e.size && <div className="text-[10px] text-slate-400 mt-0.5">{e.size}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{e.quantity} <span className="text-[10px] text-slate-500 font-normal">{e.unit || "Nos"}</span></td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-medium text-slate-700">{e.source_name || "—"}</div>
                      <div className="text-[10px] text-slate-400">{e.source_type}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-mono text-slate-700">{e.reference_number || "—"}</div>
                      {e.bill_number && <div className="font-mono text-[10px] text-slate-400">Bill {e.bill_number}</div>}
                      {e.attachment_file_id && (
                        <a href={fileUrl(e.attachment_file_id)} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline inline-flex items-center gap-1">
                          {(e.attachment_filename || "").match(/\.(png|jpe?g|webp)$/i) ? <FileImage className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                          attachment
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-slate-500">
                      {e.created_by_name}
                      {e.source !== "manual" && <Badge variant="outline" className="ml-1 text-[9px] bg-indigo-50 text-indigo-700 border-indigo-200">{e.source}</Badge>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(e)} data-testid={`edit-inward-${e.id}`}><Pencil className="w-3.5 h-3.5" /></Button>}
                      {canDelete && <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDel(e)} data-testid={`del-inward-${e.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ManualBulkImport open={manualOpen} onOpenChange={setManualOpen} mode="inward" products={products} onImported={() => { load(); onChanged?.(); }} />

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete inward entry?"
        description={confirmDel ? `${confirmDel.product} × ${confirmDel.quantity} ${confirmDel.unit || "Nos"} from ${confirmDel.source_name || "—"}. This cannot be undone.` : ""}
        onConfirm={doDelete}
      />
    </div>
  );
}
