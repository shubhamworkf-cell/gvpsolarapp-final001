import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Upload, Clipboard, ShieldCheck, Plus, Trash2, X } from "lucide-react";
import { fetchProductsDeduplicated, getCachedProducts } from "@/lib/productCache";
import { toast } from "sonner";

const REF_TYPES = ["Challan Number", "Bill Number", "Invoice Number", "GRN Number"];
const UNIT_OPTIONS = ["Nos", "Pair", "Mtr", "Set", "Box", "Pcs", "Kg", "Ltr", "Roll"];

const parseCsvLine = (line) => {
  const row = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  row.push(current.trim());
  return row;
};

const detectDelimiter = (lines) => {
  if (lines.every((line) => line.includes("\t"))) return "\t";
  if (lines.every((line) => line.includes("|"))) return "|";
  if (lines.every((line) => line.includes(";"))) return ";";
  const commaCount = lines[0].split(",").length;
  if (commaCount > 1 && lines.every((line) => line.split(",").length === commaCount)) return ",";
  if (/\s{2,}/.test(lines[0])) return /\s{2,}/;
  return /\s+/;
};

const splitLine = (line, delimiter) => {
  if (delimiter === ",") return parseCsvLine(line);
  return line.split(delimiter).map((cell) => cell.trim());
};

const normalizeHeader = (text) => String(text || "").trim().toLowerCase();

const inferFieldMap = (headerRow) => {
  const map = {};
  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (/product|item|description/.test(name)) map.product = index;
    else if (/size|spec/.test(name)) map.size = index;
    else if (/brand|make/.test(name)) map.brand = index;
    else if (/qty|quantity/.test(name)) map.quantity = index;
    else if (/unit/.test(name)) map.unit = index;
    else if (/vendor|supplier|source/.test(name)) map.vendor = index;
    else if (/bill|invoice|challan|ref/.test(name)) map.bill_number = index;
    else if (/serial|sn/.test(name)) map.serial_numbers = index;
    else if (/date/.test(name)) map.date = index;
    else if (/remarks|note/.test(name)) map.remarks = index;
  });

  const fallback = ["product", "size", "brand", "quantity", "unit", "vendor", "bill_number", "serial_numbers", "date", "remarks"];
  fallback.forEach((field, index) => {
    if (map[field] === undefined) map[field] = index;
  });
  return map;
};

const parseArraysToRows = (arrays) => {
  const cleanArrays = arrays
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  if (!cleanArrays.length) return [];

  const header = cleanArrays[0];
  const isHeader = header.some(cell => /product|item|size|qty|unit|vendor|brand|serial|bill/i.test(cell));
  const fieldMap = inferFieldMap(header);
  const body = cleanArrays.slice(isHeader ? 1 : 0);

  return body.map((row, index) => {
    const get = (field) => {
      const idx = fieldMap[field];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };

    const rawSerials = get("serial_numbers");
    const serialList = rawSerials ? rawSerials.split(/[,;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean) : [];

    return {
      _id: index,
      _selected: true,
      product: get("product").toUpperCase(),
      size: get("size"),
      brand: get("brand"),
      quantity: get("quantity") !== "" ? (Number(get("quantity").replace(/,/g, "")) || 0) : "",
      unit: get("unit") || "Nos",
      vendor: get("vendor"),
      bill_number: get("bill_number"),
      date: get("date"),
      serial_number_required: serialList.length > 0,
      serial_text: serialList.join(", "),
      serial_numbers: serialList,
      remarks: get("remarks"),
    };
  }).filter((row) => row.product || row.quantity || row.size);
};

const buildCsvArrays = (text) => {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines);
  return lines.map((line) => splitLine(line, delimiter));
};

export default function HighValueBulkImport({ open, onOpenChange, onImported, products = [] }) {
  const [step, setStep] = useState("input");
  const [inputMode, setInputMode] = useState("text");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState("");
  const [processing, setProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [productsList, setProductsList] = useState(products || []);
  const fileInputRef = useRef(null);

  const [globalDefaults, setGlobalDefaults] = useState({
    date: new Date().toISOString().split("T")[0],
    vendor: "",
    bill_number: "",
    reference_type: "Challan Number",
    remarks: "",
  });

  useEffect(() => {
    if (!open) return;
    setStep("input");
    setInputMode("text");
    setRawText("");
    setFile(null);
    setFileName("");
    setRows([]);
    setErrors("");
    setProcessing(false);
    setImportProgress(0);
    setGlobalDefaults({
      date: new Date().toISOString().split("T")[0],
      vendor: "",
      bill_number: "",
      reference_type: "Challan Number",
      remarks: "",
    });

    if (!products || products.length === 0) {
      const cached = getCachedProducts();
      if (cached && cached.length > 0) setProductsList(cached);
      fetchProductsDeduplicated().then((list) => setProductsList(list || [])).catch(() => {});
    } else {
      setProductsList(products);
    }
  }, [open, products]);

  const loadRowsFromText = async (text) => {
    const arrays = buildCsvArrays(text);
    return parseArraysToRows(arrays);
  };

  const loadRowsFromFile = async (selected) => {
    const ext = (selected.name || "").split(".").pop().toLowerCase();
    if (["csv", "txt"].includes(ext)) {
      const text = await selected.text();
      return loadRowsFromText(text);
    }
    if (["xls", "xlsx"].includes(ext)) {
      const data = await selected.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const arrays = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
      return parseArraysToRows(arrays);
    }
    throw new Error("Unsupported file format. Use CSV, XLS, or XLSX.");
  };

  const handleParse = async () => {
    setProcessing(true);
    setErrors("");
    try {
      let parsed = [];
      if (inputMode === "file") {
        if (!file) throw new Error("Select a CSV or Excel file first.");
        parsed = await loadRowsFromFile(file);
      } else {
        if (!rawText.trim()) throw new Error("Paste tabular text into the editor first.");
        parsed = await loadRowsFromText(rawText);
      }
      if (!parsed.length) throw new Error("No rows could be parsed from the input.");
      setRows(parsed.map((row, index) => ({ ...row, _id: index, _selected: true })));
      setStep("defaults");
    } catch (err) {
      setErrors(err?.message || "Unable to parse the input.");
    } finally {
      setProcessing(false);
    }
  };

  const handleReviewTransition = () => {
    setRows((prevRows) => {
      return prevRows.map((row) => ({
        ...row,
        date: row.date || globalDefaults.date || "",
        vendor: row.vendor || globalDefaults.vendor || "",
        bill_number: row.bill_number || globalDefaults.bill_number || "",
        reference_type: globalDefaults.reference_type || "Challan Number",
        remarks: row.remarks || globalDefaults.remarks || "",
        high_value_goods: true,
        high_value_asset: true,
      }));
    });
    setStep("review");
  };

  const updateCell = (rowIndex, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      let row = { ...next[rowIndex] };
      if (field === "product") {
        row.product = String(value).toUpperCase();
      } else if (field === "serial_text") {
        row.serial_text = value;
        const parsedSerials = String(value || "")
          .split(/[,;\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
        row.serial_numbers = parsedSerials;
      } else {
        row[field] = value;
      }
      next[rowIndex] = row;
      return next;
    });
  };

  const toggleSelectRow = (index) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _selected: !next[index]._selected };
      return next;
    });
  };

  const deleteRow = (index) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index).map((row, idx) => ({ ...row, _id: idx })));
  };

  const addBlankRow = () => {
    setRows((prev) => [
      ...prev,
      {
        _id: prev.length,
        _selected: true,
        product: "",
        size: "",
        brand: "",
        quantity: 1,
        unit: "Nos",
        vendor: globalDefaults.vendor || "",
        bill_number: globalDefaults.bill_number || "",
        date: globalDefaults.date || new Date().toISOString().split("T")[0],
        serial_number_required: false,
        serial_text: "",
        serial_numbers: [],
        remarks: globalDefaults.remarks || "",
        high_value_goods: true,
        high_value_asset: true,
      },
    ]);
  };

  // Validation functions
  const getRowErrors = (row, allSelectedRows) => {
    const errs = [];
    if (!row.product?.trim()) errs.push("Product required");
    // TEMPORARY RELAXATION strictly for High Value Manual Import:
    // 1. Size is NOT mandatory (can be blank).
    // 2. Quantity allows 0 (qty >= 0).
    const qty = Number(row.quantity);
    if (isNaN(qty) || qty < 0) errs.push("Quantity >= 0 required");

    if (row.serial_number_required) {
      const serials = (row.serial_numbers || []).map(s => s.toUpperCase());
      if (serials.length === 0) {
        errs.push("Serial numbers required");
      } else if (Math.floor(qty) !== serials.length) {
        errs.push(`Qty is ${qty}, but ${serials.length} serials entered`);
      }

      // Check duplicates within row
      const rowUnique = new Set(serials);
      if (rowUnique.size !== serials.length) {
        errs.push("Duplicate serials within row");
      }

      // Check duplicates across batch
      allSelectedRows.forEach((otherRow) => {
        if (otherRow._id !== row._id && otherRow.serial_number_required) {
          const otherSerials = (otherRow.serial_numbers || []).map(s => s.toUpperCase());
          const hasOverlap = serials.some(s => otherSerials.includes(s));
          if (hasOverlap && !errs.includes("Duplicate serial across batch")) {
            errs.push("Duplicate serial across batch");
          }
        }
      });
    }

    return errs;
  };

  const selectedRows = rows.filter((row) => row._selected);

  const getBatchValidationSummary = () => {
    let invalidCount = 0;
    selectedRows.forEach((row) => {
      if (getRowErrors(row, selectedRows).length > 0) invalidCount += 1;
    });
    return invalidCount;
  };

  const invalidRowsCount = getBatchValidationSummary();

  const handleFinalImport = async () => {
    const validRows = selectedRows.filter((r) => getRowErrors(r, selectedRows).length === 0);
    if (!validRows.length) {
      toast.error("Select at least one valid row to import.");
      return;
    }

    if (invalidRowsCount > 0) {
      toast.error(`Please fix the ${invalidRowsCount} invalid row(s) before importing.`);
      return;
    }

    setStep("importing");
    setImportProgress(0);

    const CHUNK_SIZE = 25;
    const totalRows = validRows.length;
    let importedCount = 0;

    try {
      const payloadRows = validRows.map((r) => ({
        product: (r.product || "").toUpperCase().trim(),
        size: (r.size || "").trim(),
        brand: (r.brand || r.vendor || "").trim(),
        source_name: (r.vendor || r.source_name || "").trim(),
        source_type: "Supplier",
        quantity: Number(r.quantity),
        unit: r.unit || "Nos",
        bill_number: r.bill_number || "",
        reference_number: r.bill_number || "",
        reference_type: r.reference_type || globalDefaults.reference_type || "Challan Number",
        date: r.date || globalDefaults.date || new Date().toISOString().split("T")[0],
        serial_number_required: Boolean(r.serial_number_required),
        serial_numbers: r.serial_numbers || [],
        remarks: r.remarks || "",
        high_value_goods: true,
        high_value_asset: true,
      }));

      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        const chunk = payloadRows.slice(i, i + CHUNK_SIZE);
        await api.post(
          "/inventory/bulk-inward-high-value",
          {
            rows: chunk,
            global_defaults: globalDefaults,
            source: "high-value-manual-import",
          },
          { timeout: 120000 }
        );
        importedCount += chunk.length;
        setImportProgress(Math.round((importedCount / totalRows) * 100));
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      setImportProgress(100);
      toast.success(`Successfully imported ${payloadRows.length} High Value Goods!`);
      setStep("done");
      onImported?.();
    } catch (err) {
      toast.error("High Value Import failed: " + formatApiError(err));
      setStep("review");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[95vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-row items-center justify-between shrink-0 bg-amber-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900">High Value Manual Import — Inward</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Bulk import High Value Goods into History, Product Master, Balance Sheet, and High Value Tracking.
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className={`px-2.5 py-1 rounded-full font-semibold ${step === "input" ? "bg-amber-600 text-white" : "bg-slate-100"}`}>1. Data Input</div>
            <div className={`px-2.5 py-1 rounded-full font-semibold ${step === "defaults" ? "bg-amber-600 text-white" : "bg-slate-100"}`}>2. Defaults</div>
            <div className={`px-2.5 py-1 rounded-full font-semibold ${step === "review" ? "bg-amber-600 text-white" : "bg-slate-100"}`}>3. Review & Validate</div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70">
          {step === "input" && (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Choose Input Method</div>
                      <p className="text-xs text-slate-500 mt-1">Paste tabular high-value rows or upload an Excel / CSV file.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant={inputMode === "text" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("text")}>Paste Text</Button>
                      <Button variant={inputMode === "file" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("file")}>Upload File</Button>
                    </div>
                  </div>

                  {inputMode === "text" ? (
                    <div className="mt-5">
                      <Label className="text-[11px] uppercase tracking-wider text-slate-500">Tabular High Value Input</Label>
                      <Textarea
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        rows={12}
                        className="mt-2 font-mono text-xs"
                        placeholder={`Product, Size, Brand, Quantity, Unit, Vendor, Bill Number, Serial Numbers\nWAAREE 540W PANEL, 540W, WAAREE, 2, Nos, INA Solar, 1001, SN-001 SN-002\nGROWATT 10KW INVERTER, 10KW, GROWATT, 1, Nos, Growatt India, 1002, GW-88901`}
                      />
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <Upload className="mx-auto mb-3 w-10 h-10 text-amber-500" />
                        <div className="text-sm font-semibold text-slate-900">Upload CSV or Excel file</div>
                        <p className="text-xs text-slate-500 mt-1">Supported formats: .csv, .xls, .xlsx</p>
                        <Button className="mt-4 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => fileInputRef.current?.click()}>Select File</Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xls,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const selected = e.target.files?.[0];
                            if (selected) {
                              setFile(selected);
                              setFileName(selected.name);
                            }
                          }}
                        />
                      </div>

                      {fileName && (
                        <div className="rounded-3xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4 text-sm">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-5 h-5 text-amber-600" />
                            <div>
                              <div className="font-semibold text-slate-800">{fileName}</div>
                              <div className="text-[11px] text-slate-500">File selected & ready</div>
                            </div>
                          </div>
                          <button type="button" onClick={() => { setFile(null); setFileName(""); }} className="text-slate-400 hover:text-red-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6 text-slate-700">
                  <div className="flex items-center gap-2 font-semibold text-amber-900 text-sm mb-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600" /> High Value Automatic Flagging
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Every item imported via this screen will be automatically flagged as <strong>High Value Goods = TRUE</strong>.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-xs text-amber-900 list-disc list-inside">
                    <li>Updates History & Inward Entries</li>
                    <li>Updates Product Master with High Value Flag</li>
                    <li>Updates Stock Balance & Balance Sheet</li>
                    <li>Generates High Value Asset records for tracking</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {step === "defaults" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <div className="text-base font-semibold text-slate-900 mb-4">Batch Default Values</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input type="date" value={globalDefaults.date} onChange={(e) => setGlobalDefaults({ ...globalDefaults, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Vendor / Source Name</Label>
                    <Input value={globalDefaults.vendor} onChange={(e) => setGlobalDefaults({ ...globalDefaults, vendor: e.target.value })} placeholder="e.g. INA Solar / Growatt India" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bill / Reference Number</Label>
                    <Input value={globalDefaults.bill_number} onChange={(e) => setGlobalDefaults({ ...globalDefaults, bill_number: e.target.value })} placeholder="e.g. INV-2026-001" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reference Type</Label>
                    <Select value={globalDefaults.reference_type} onValueChange={(v) => setGlobalDefaults({ ...globalDefaults, reference_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REF_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 md:col-span-2 space-y-1.5">
                    <Label>Batch Remarks</Label>
                    <Textarea value={globalDefaults.remarks} onChange={(e) => setGlobalDefaults({ ...globalDefaults, remarks: e.target.value })} rows={3} placeholder="Batch notes..." />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (() => {
            return (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={addBlankRow} className="text-amber-700 border-amber-300 hover:bg-amber-50">
                      <Plus className="w-4 h-4 mr-1" /> Add High Value Row
                    </Button>
                    <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
                      {selectedRows.length} Rows Selected
                    </Badge>
                  </div>
                  {invalidRowsCount > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      {invalidRowsCount} Invalid / Duplicate Rows
                    </Badge>
                  )}
                </div>

                <div className="overflow-x-auto bg-white border rounded-3xl shadow-sm">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2 w-8">☑</th>
                        <th className="px-3 py-2">Product *</th>
                        <th className="px-3 py-2">Size / Spec</th>
                        <th className="px-3 py-2">Brand / Make</th>
                        <th className="px-3 py-2 w-20">Qty</th>
                        <th className="px-3 py-2 w-24">Unit</th>
                        <th className="px-3 py-2">Vendor</th>
                        <th className="px-3 py-2">Bill No.</th>
                        <th className="px-3 py-2">Serial Numbers</th>
                        <th className="px-3 py-2 w-28">Date</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">No rows to review.</td></tr>
                      ) : (
                        rows.map((row, idx) => {
                          const rowErrs = getRowErrors(row, selectedRows);
                          const hasErr = rowErrs.length > 0;
                          return (
                            <tr key={row._id} className={`border-t border-slate-100 ${hasErr ? "bg-red-50/40" : ""}`}>
                              <td className="px-3 py-2 align-top">
                                <input type="checkbox" checked={row._selected} onChange={() => toggleSelectRow(idx)} className="mt-2 accent-amber-600 w-4 h-4" />
                              </td>
                              <td className="px-3 py-2 align-top min-w-[180px]">
                                <Input value={row.product} onChange={(e) => updateCell(idx, "product", e.target.value)} className="h-8 text-xs font-semibold uppercase" placeholder="e.g. WAAREE 540W PANEL" />
                                {hasErr && rowErrs.includes("Product required") && <div className="text-[10px] text-red-600 mt-0.5">Product required</div>}
                              </td>
                              <td className="px-3 py-2 align-top min-w-[140px]">
                                <Input value={row.size} onChange={(e) => updateCell(idx, "size", e.target.value)} className="h-8 text-xs" placeholder="e.g. 540W (Optional)" />
                              </td>
                              <td className="px-3 py-2 align-top min-w-[130px]">
                                <Input value={row.brand} onChange={(e) => updateCell(idx, "brand", e.target.value)} className="h-8 text-xs" placeholder="e.g. Waaree" />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Input type="number" min="0" value={row.quantity} onChange={(e) => updateCell(idx, "quantity", e.target.value)} className="h-8 text-xs w-20" />
                                {hasErr && rowErrs.includes("Quantity >= 0 required") && <div className="text-[10px] text-red-600 mt-0.5">Qty &gt;= 0 required</div>}
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Select value={row.unit} onValueChange={(v) => updateCell(idx, "unit", v)}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>{UNIT_OPTIONS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2 align-top min-w-[130px]">
                                <Input value={row.vendor} onChange={(e) => updateCell(idx, "vendor", e.target.value)} className="h-8 text-xs" placeholder="Vendor name" />
                              </td>
                              <td className="px-3 py-2 align-top min-w-[120px]">
                                <Input value={row.bill_number} onChange={(e) => updateCell(idx, "bill_number", e.target.value)} className="h-8 text-xs" placeholder="Bill No." />
                              </td>
                              <td className="px-3 py-2 align-top min-w-[200px]">
                                <div className="flex flex-col gap-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={row.serial_number_required}
                                      onChange={(e) => updateCell(idx, "serial_number_required", e.target.checked)}
                                      className="w-3.5 h-3.5 accent-amber-600"
                                    />
                                    Enable Serial Numbers
                                  </label>
                                  {row.serial_number_required && (
                                    <Input
                                      value={row.serial_text}
                                      onChange={(e) => updateCell(idx, "serial_text", e.target.value)}
                                      className="h-8 text-xs font-mono"
                                      placeholder="SN-001, SN-002..."
                                    />
                                  )}
                                  {hasErr && rowErrs.filter(e => e.includes("Serial") || e.includes("serials") || e.includes("Duplicate")).map(e => (
                                    <div key={e} className="text-[10px] text-red-600 font-medium">{e}</div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Input type="date" value={row.date} onChange={(e) => updateCell(idx, "date", e.target.value)} className="h-8 text-xs" />
                              </td>
                              <td className="px-3 py-2 align-top">
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => deleteRow(idx)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between shrink-0 bg-white">
          {step === "input" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleParse} disabled={processing}>
                {processing ? "Parsing Data..." : "Continue to Defaults →"}
              </Button>
            </>
          )}

          {step === "defaults" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")}>← Back to Input</Button>
              <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleReviewTransition}>
                Continue to Review & Validate →
              </Button>
            </>
          )}

          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("defaults")}>← Back to Defaults</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                onClick={handleFinalImport}
                disabled={processing || selectedRows.length === 0 || invalidRowsCount > 0}
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                Import {selectedRows.length} High Value Rows
              </Button>
            </>
          )}

          {step === "done" && (
            <div className="w-full flex items-center justify-between">
              <div className="text-sm font-semibold text-emerald-600 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                High Value Import Completed Successfully!
              </div>
              <Button className="bg-slate-900 text-white" onClick={() => onOpenChange(false)}>
                Done & Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
