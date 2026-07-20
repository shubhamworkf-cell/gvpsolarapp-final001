import React, { useEffect, useRef, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Save, Paperclip, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { toast } from "sonner";
import { Field, SelectField, TextareaField, UNIT_OPTIONS, REF_TYPES, SRC_TYPES, digitsOnly, ProductAutocompleteInput } from "./_shared";

const OUTWARD_STATUSES = ["Pending", "Dispatched", "Cancelled"];

export default function EditTransactionDialog({ transaction, onClose, onSaved, products }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [clients, setClients] = useState([]);

  useEffect(() => {
    if (transaction && transaction.type === "Inward") {
      api.get("/clients").then((r) => setClients(r.data || [])).catch(() => {});
    }
  }, [transaction]);

  useEffect(() => {
    if (!transaction) { setForm(null); return; }
    setForm({ ...transaction, date: (transaction.date || "").slice(0, 10) });
  }, [transaction]);

  if (!transaction || !form) return null;
  const isInward = transaction.type === "Inward";

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm({ ...form, attachment_file_id: data.id, attachment_filename: data.original_filename || file.name });
      toast.success("Attachment uploaded");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.product?.trim() || !form.quantity || Number(form.quantity) <= 0) {
      toast.error("Product and quantity are required"); return;
    }
    if (isInward && form.source_type === "Return From Client" && !form.client_id) {
      toast.error("Please select a valid onboarding client"); return;
    }
    setBusy(true);
    const url = isInward ? `/inventory/inward/${form.id}` : `/inventory/outward/${form.id}`;
    const payload = { ...form, quantity: Number(form.quantity) };
    try {
      await api.patch(url, payload);
      toast.success("Transaction updated");
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const upd = (patch) => setForm({ ...form, ...patch });

  return (
    <Dialog open={!!transaction} onOpenChange={(v) => !v && onClose?.()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="edit-txn-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isInward ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
              {isInward ? <ArrowDownToLine className="w-5 h-5" /> : <ArrowUpFromLine className="w-5 h-5" />}
            </div>
            <div>
              <DialogTitle style={{ fontFamily: "Outfit" }}>Edit {transaction.type} Transaction</DialogTitle>
              <DialogDescription className="text-xs">After saving, stock balance, history and dashboard counters update automatically.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-3 mt-2">
          <Field label="Date" type="date" value={form.date} onChange={(v) => upd({ date: v })} testid="et-date" />
          {isInward ? (
            <>
              <SelectField label="Reference Type" value={form.reference_type} onChange={(v) => upd({ reference_type: v })} options={REF_TYPES} testid="et-ref-type" />
              <Field label="Challan Number" value={form.reference_number} onChange={(v) => upd({ reference_number: digitsOnly(v) })} testid="et-challan" inputMode="numeric" pattern="[0-9]*" />
              <Field label="Bill Number" value={form.bill_number} onChange={(v) => upd({ bill_number: digitsOnly(v) })} testid="et-bill" inputMode="numeric" pattern="[0-9]*" />
              <SelectField label="Source Type" value={form.source_type} onChange={(v) => upd({ source_type: v, client_id: "", client_name: "", source_name: "" })} options={SRC_TYPES} testid="et-src-type" />
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
                        upd({ client_id: c.id, client_name: c.full_name, source_name: c.full_name });
                      } else {
                        upd({ client_name: val, client_id: "", source_name: val });
                      }
                    }}
                    placeholder="Type to search onboarding clients…"
                    className="flex-1 mt-1.5 h-10 px-3 py-2 w-full text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    list="et-client-list"
                  />
                  <datalist id="et-client-list">
                    {clients.map((c) => <option key={c.id} value={c.full_name} />)}
                  </datalist>
                  {!form.client_id && form.client_name && (
                    <div className="text-[10px] text-red-500 mt-1">Please select an existing onboarding client from the list</div>
                  )}
                </div>
              ) : (
                <Field label="Vendor / Source Name" value={form.source_name} onChange={(v) => upd({ source_name: v })} testid="et-source" />
              )}
            </>
          ) : (
            <>
              <Field label="Outward Challan No." value={form.outward_challan_no} onChange={(v) => upd({ outward_challan_no: digitsOnly(v) })} testid="et-out-challan" inputMode="numeric" pattern="[0-9]*" />
              <SelectField label="Status" value={form.status} onChange={(v) => upd({ status: v })} options={OUTWARD_STATUSES} testid="et-status" />
              <Field label="Client Name" value={form.client_name} onChange={(v) => upd({ client_name: v })} testid="et-client" />
              <Field label="Project" value={form.project_name} onChange={(v) => upd({ project_name: v })} testid="et-project" />
            </>
          )}

          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Product<span className="text-red-500 ml-0.5">*</span></label>
            <div className="mt-1.5">
              <ProductAutocompleteInput
                value={form.product}
                onChange={(v) => {
                  let pName = "";
                  let sizeVal = form.size || "";
                  let unitVal = form.unit || "Nos";
                  let rateVal = form.rate || "";
                  if (typeof v === "object" && v !== null) {
                    pName = (v.name || "").toUpperCase();
                    sizeVal = v.size || "";
                    unitVal = v.unit || "Nos";
                    rateVal = (v.rate !== undefined && v.rate !== null) ? String(v.rate) : "";
                  } else {
                    pName = v.toUpperCase();
                    const matched = products.find(p => p.name.toUpperCase() === pName);
                    if (matched) {
                      sizeVal = matched.size || "";
                      unitVal = matched.unit || "Nos";
                      rateVal = (matched.rate !== undefined && matched.rate !== null) ? String(matched.rate) : "";
                    }
                  }
                  upd({
                    product: pName,
                    size: sizeVal,
                    unit: unitVal,
                    rate: rateVal
                  });
                }}
                products={products}
                placeholder="Select or type product name..."
                testid="et-product"
                required
              />
            </div>
          </div>
          <Field label="Size / Spec" value={form.size} onChange={(v) => upd({ size: v })} testid="et-size" />
          <Field label="Quantity" type="number" value={form.quantity} onChange={(v) => upd({ quantity: v })} required testid="et-qty" />
          <SelectField label="Unit" value={form.unit} onChange={(v) => upd({ unit: v })} options={UNIT_OPTIONS} testid="et-unit" />

          <TextareaField label="Remarks" value={form.remarks} onChange={(v) => upd({ remarks: v })} testid="et-remarks" full />

          <div className="md:col-span-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachment</div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            {form.attachment_filename ? (
              <div className="mt-1.5 flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-xs">
                <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                <a href={fileUrl(form.attachment_file_id)} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{form.attachment_filename}</a>
                <button onClick={() => upd({ attachment_file_id: "", attachment_filename: "" })} className="text-slate-400 hover:text-red-600">×</button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="mt-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="et-attach">
                <Paperclip className="w-3.5 h-3.5 mr-1.5" /> {uploading ? "Uploading…" : "Attach file"}
              </Button>
            )}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={busy} data-testid="et-save"><Save className="w-4 h-4 mr-1.5" /> {busy ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
