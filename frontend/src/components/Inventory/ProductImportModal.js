import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import api, { formatApiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, FileText, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_OPTIONS, UNIT_OPTIONS } from "./_shared";

export default function ProductImportModal({ open, onOpenChange, initialType = "pdf", existingProducts = [], onChanged }) {
  const [step, setStep] = useState("select");
  const [fileType, setFileType] = useState(initialType);
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("select");
      setFileType(initialType);
      setFile(null);
      setRows([]);
      setLoading(false);
      setSaving(false);
    }
  }, [open, initialType]);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

  const processFile = async () => {
    if (!file) {
      toast.error("Please select a file to import.");
      return;
    }
    setLoading(true);
    try {
      let parsed = [];
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "pdf" || fileType === "pdf") {
        const formData = new FormData();
        formData.append("file", file);
        const res = await api.post("/inventory/products/parse-pdf", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        parsed = res.data?.rows || [];
      } else if (["xls", "xlsx", "csv", "txt"].includes(ext)) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(worksheet);

        parsed = rawJson.map((row) => ({
          name: row["Product Name"] || row["Name"] || row["name"] || row["Product"] || "",
          category: row["Category"] || row["category"] || "Solar Panel",
          brand: row["Brand"] || row["brand"] || row["Make"] || "",
          size: row["Size"] || row["size"] || row["Specification"] || "",
          unit: row["Unit"] || row["unit"] || "Nos",
          hsn: row["HSN"] || row["hsn"] || "",
          gst: row["GST"] || row["gst"] || "",
          min_stock: Number(row["Min Stock"] || row["min_stock"] || 0),
          high_value_goods: Boolean(row["High Value Goods"] || row["high_value_goods"]),
        })).filter((r) => r.name?.trim());
      }

      if (!parsed.length) {
        toast.error("No product records could be parsed from the file.");
        setLoading(false);
        return;
      }

      const existingNames = new Set(existingProducts.map((p) => (p.name || "").toUpperCase().trim()));

      const annotated = parsed.map((r, i) => ({
        ...r,
        _id: i,
        _selected: true,
        _duplicate: existingNames.has((r.name || "").toUpperCase().trim()),
      }));

      setRows(annotated);
      setStep("preview");
    } catch (err) {
      toast.error(formatApiError(err) || "Failed to parse file.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const toggleSelect = (index) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _selected: !next[index]._selected };
      return next;
    });
  };

  const deleteRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImportSave = async () => {
    const selected = rows.filter((r) => r._selected && r.name?.trim());
    if (!selected.length) {
      toast.error("Select at least one valid product row to import.");
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    for (const r of selected) {
      try {
        await api.post("/inventory/products", {
          name: r.name,
          category: r.category || "Solar Panel",
          brand: r.brand || "",
          size: r.size || "",
          unit: r.unit || "Nos",
          hsn: r.hsn || "",
          gst: r.gst || "",
          min_stock: Number(r.min_stock) || 0,
          high_value_goods: Boolean(r.high_value_goods),
        });
        successCount++;
      } catch (err) {
        failCount++;
      }
    }

    setSaving(false);
    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} product(s) into Product Master.`);
      onChanged?.();
      onOpenChange(false);
    } else {
      toast.error(`Failed to import ${failCount} product(s). Please check duplicates or inputs.`);
    }
  };

  const acceptAccepts = fileType === "pdf" ? ".pdf" : fileType === "excel" ? ".xls,.xlsx" : ".csv,.txt";
  const selectedCount = rows.filter((r) => r._selected).length;
  const duplicateCount = rows.filter((r) => r._duplicate).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full flex flex-col p-0 max-h-[90vh]">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            {fileType === "pdf" ? <FileText className="w-5 h-5 text-red-600" /> : <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
            Import Products into Product Master ({fileType.toUpperCase()})
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Upload a {fileType.toUpperCase()} file to extract product records, preview items, check duplicates, and import into inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
          {step === "select" && (
            <div className="space-y-6 max-w-lg mx-auto py-6">
              <div className="flex gap-2 justify-center">
                {["pdf", "excel", "csv"].map((t) => (
                  <Button
                    key={t}
                    variant={fileType === t ? "default" : "outline"}
                    size="sm"
                    className="capitalize text-xs font-semibold"
                    onClick={() => { setFileType(t); setFile(null); }}
                  >
                    {t} Import
                  </Button>
                ))}
              </div>

              <div className="border-2 border-dashed border-slate-300 bg-white rounded-xl p-8 text-center space-y-4 hover:border-blue-500 transition-colors">
                <Upload className="w-10 h-10 text-slate-400 mx-auto" />
                <div>
                  <p className="text-sm font-semibold text-slate-700">Choose a {fileType.toUpperCase()} file to upload</p>
                  <p className="text-xs text-slate-400 mt-1">Accepts {acceptAccepts}</p>
                </div>
                <Input type="file" accept={acceptAccepts} onChange={handleFileChange} className="hidden" id="product-file-input" />
                <label htmlFor="product-file-input">
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    Browse File
                  </Button>
                </label>
                {file && (
                  <div className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                    Selected: {file.name}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 text-xs">
                <div className="flex gap-4">
                  <span>Total Parsed: <strong>{rows.length}</strong></span>
                  <span>Selected: <strong>{selectedCount}</strong></span>
                  {duplicateCount > 0 && <span className="text-amber-600 font-semibold">Existing Duplicates: {duplicateCount}</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep("select")} className="text-xs text-slate-500">
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Re-upload File
                </Button>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white max-h-[50vh]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 uppercase font-semibold">
                    <tr>
                      <th className="p-2.5 w-8">Sel</th>
                      <th className="p-2.5 min-w-[160px]">Product Name</th>
                      <th className="p-2.5 min-w-[120px]">Category</th>
                      <th className="p-2.5 min-w-[100px]">Brand</th>
                      <th className="p-2.5 min-w-[100px]">Size</th>
                      <th className="p-2.5 min-w-[80px]">Unit</th>
                      <th className="p-2.5 w-20">Min Stock</th>
                      <th className="p-2.5 w-12">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, idx) => (
                      <tr key={idx} className={r._duplicate ? "bg-amber-50/50" : r._selected ? "bg-white" : "bg-slate-50 opacity-60"}>
                        <td className="p-2.5">
                          <input type="checkbox" checked={r._selected} onChange={() => toggleSelect(idx)} className="rounded text-blue-600" />
                        </td>
                        <td className="p-2.5 font-medium">
                          <Input value={r.name} onChange={(e) => updateRow(idx, "name", e.target.value)} className="h-7 text-xs" />
                          {r._duplicate && <Badge variant="outline" className="mt-1 bg-amber-100 text-amber-800 border-amber-300 text-[10px]">Already Exists</Badge>}
                        </td>
                        <td className="p-2.5">
                          <select value={r.category} onChange={(e) => updateRow(idx, "category", e.target.value)} className="h-7 text-xs border rounded w-full px-1">
                            {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <Input value={r.brand} onChange={(e) => updateRow(idx, "brand", e.target.value)} className="h-7 text-xs" />
                        </td>
                        <td className="p-2.5">
                          <Input value={r.size} onChange={(e) => updateRow(idx, "size", e.target.value)} className="h-7 text-xs" />
                        </td>
                        <td className="p-2.5">
                          <select value={r.unit} onChange={(e) => updateRow(idx, "unit", e.target.value)} className="h-7 text-xs border rounded w-full px-1">
                            {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                          </select>
                        </td>
                        <td className="p-2.5">
                          <Input type="number" value={r.min_stock} onChange={(e) => updateRow(idx, "min_stock", e.target.value)} className="h-7 text-xs w-16" />
                        </td>
                        <td className="p-2.5">
                          <Button variant="ghost" size="icon" onClick={() => deleteRow(idx)} className="h-7 w-7 text-red-500 hover:bg-red-50">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-200 flex justify-between shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === "select" && (
            <Button onClick={processFile} disabled={loading || !file} className="bg-blue-600 hover:bg-blue-700">
              {loading ? "Parsing File…" : "Parse & Preview"}
            </Button>
          )}
          {step === "preview" && (
            <Button onClick={handleImportSave} disabled={saving || selectedCount === 0} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Importing…" : `Import ${selectedCount} Products`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
