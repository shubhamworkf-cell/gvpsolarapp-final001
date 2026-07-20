import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { FileSpreadsheet, Upload, Clipboard, CheckCircle2, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";

const MODE_CONFIG = {
  inward: {
    title: "Manual Bulk Import — Inward Inventory",
    subtitle: "Upload CSV/Excel or paste tabular text, then review and import inward stock rows manually.",
    bulkEndpoint: "/inventory/bulk-inward",
    extraFields: ["bill_number"],
  },
  outward: {
    title: "Manual Bulk Import — Outward Dispatch",
    subtitle: "Upload CSV/Excel or paste tabular text, then review and import outward dispatch rows manually.",
    bulkEndpoint: "/inventory/bulk-outward",
    extraFields: ["client_name", "project_name", "outward_challan_no", "status"],
  },
};

const REF_TYPES = ["Challan Number", "Invoice Number", "Book Number", "GRN Number", "Transport Number"];
const SRC_TYPES = ["Supplier", "Vendor", "Client Return", "Other"];
const UNIT_OPTIONS = ["Nos", "Pair", "Mtr", "Set", "Box", "Pcs", "Kg", "Ltr", "Roll"];
const STATUS_OPTIONS = ["Dispatched", "Pending", "Cancelled"];

const stripNumeric = (value) => String(value ?? "").replace(/\D+/g, "");
const isNumeric = (value) => {
  if (value === undefined || value === null) return false;
  const cleaned = String(value).replace(/,/g, "").trim();
  return cleaned !== "" && !Number.isNaN(Number(cleaned));
};

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
  if (typeof delimiter === "string") return line.split(delimiter).map((cell) => cell.trim());
  return line.split(delimiter).map((cell) => cell.trim());
};

const normalizeHeader = (text) => String(text || "").trim().toLowerCase();
const hasHeaderRow = (row) => row.some((cell) => {
  const text = normalizeHeader(cell);
  return /product|item|description|size|spec|qty|quantity|unit|vendor|supplier|source|client|project|challan|invoice|bill|remarks|status|date/.test(text);
});

const inferFieldMap = (headerRow, mode) => {
  const map = {};
  headerRow.forEach((cell, index) => {
    const name = normalizeHeader(cell);
    if (/product|item|description/.test(name)) map.product = index;
    else if (/size|spec/.test(name)) map.size = index;
    else if (/qty|quantity/.test(name)) map.quantity = index;
    else if (/unit/.test(name)) map.unit = index;
    else if (/vendor|supplier|source name|source/.test(name)) map.source_name = index;
    else if (/source.*type|type/.test(name)) map.source_type = index;
    else if (/client/.test(name)) map.client_name = index;
    else if (/project/.test(name)) map.project_name = index;
    else if (/outward.*challan|delivery.*challan|challan.*no|challan no/.test(name)) map.outward_challan_no = index;
    else if (/reference.*number|ref.*number|ref no|reference/.test(name)) map.reference_number = index;
    else if (/bill.*number|invoice.*number|bill no|invoice no/.test(name)) map.bill_number = index;
    else if (/remarks|note/.test(name)) map.remarks = index;
    else if (/status/.test(name)) map.status = index;
    else if (/date/.test(name)) map.date = index;
  });

  const fallback = mode === "outward"
    ? ["product", "size", "quantity", "unit", "client_name", "project_name", "outward_challan_no", "remarks"]
    : ["product", "size", "quantity", "unit", "source_name", "reference_number", "bill_number", "remarks"];

  fallback.forEach((field, index) => {
    if (map[field] === undefined) map[field] = index;
  });
  return map;
};

const findClient = (identifier, clientsList = []) => {
  if (!identifier) return null;
  const clean = String(identifier).trim().toLowerCase();
  // 1. Match by full_name
  let matched = clientsList.find(c => String(c.full_name || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  // 2. Match by sol_id (internal ID)
  matched = clientsList.find(c => String(c.sol_id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  // 3. Match by id (UUID)
  matched = clientsList.find(c => String(c.id || "").trim().toLowerCase() === clean);
  if (matched) return matched;
  return null;
};

const parseArraysToRows = (arrays, mode = "inward", clients = []) => {
  const cleanArrays = arrays
    .map((row) => row.map((cell) => String(cell ?? "").trim()))
    .filter((row) => row.some((cell) => cell !== ""));
  if (!cleanArrays.length) return [];

  const header = cleanArrays[0];
  const useHeader = hasHeaderRow(header);
  const fieldMap = inferFieldMap(header, mode);
  const body = cleanArrays.slice(useHeader ? 1 : 0);

  return body.map((row, index) => {
    const get = (field) => {
      const idx = fieldMap[field];
      return idx !== undefined ? String(row[idx] ?? "").trim() : "";
    };
    return {
      _id: index,
      _selected: true,
      product: get("product").toUpperCase(),
      size: get("size"),
      quantity: Number(get("quantity").replace(/,/g, "")) || 0,
      unit: get("unit") || "Nos",
      source_type: "",
      source_name: "",
      reference_number: "",
      reference_type: "Challan Number",
      bill_number: "",
      client_id: "",
      client_name: "",
      project_name: "",
      project_id: "",
      outward_challan_no: "",
      status: "",
      remarks: "",
      date: "",
    };
  }).filter((row) => row.product || row.quantity);
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

const getBlankRow = (mode) => ({
  _id: Date.now(),
  _selected: true,
  product: "",
  size: "",
  quantity: 1,
  unit: "Nos",
  source_type: "Supplier",
  source_name: "",
  reference_number: "",
  reference_type: "Challan Number",
  bill_number: "",
  client_id: "",
  client_name: "",
  project_name: "",
  outward_challan_no: "",
  status: "Dispatched",
  remarks: "",
  date: "",
});

const getRefHeaderLabel = (refType) => {
  if (!refType) return "Challan Number";
  const lower = refType.toLowerCase();
  if (lower.includes("challan")) return "Challan Number";
  if (lower.includes("bill")) return "Bill Number";
  if (lower.includes("invoice")) return "Invoice Number";
  if (lower.includes("grn")) return "GRN Number";
  return refType;
};

const getRowReferenceValue = (row, refType, mode) => {
  if (mode === "inward") {
    if (refType === "Bill Number") {
      return row.bill_number || "";
    } else {
      return row.reference_number || "";
    }
  } else {
    return row.outward_challan_no || row.reference_number || "";
  }
};

export default function ManualBulkImport({ open, onOpenChange, onImported, mode = "inward", products = [] }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.inward;
  const [step, setStep] = useState("input");
  const [inputMode, setInputMode] = useState("text");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState("");
  const [processing, setProcessing] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [importProgress, setImportProgress] = useState(0);
  const [cancelImport, setCancelImport] = useState(false);
  const cancelImportRef = useRef(false);
  const [clients, setClients] = useState([]);
  const [productsList, setProductsList] = useState(products || []);
  const [globalDefaults, setGlobalDefaults] = useState({
    date: new Date().toISOString().split("T")[0],
    reference_type: "Challan Number",
    reference_number: "",
    source_type: "Supplier",
    source_name: "",
    client_id: "",
    client_name: "",
    project_id: "",
    project_name: "",
    remarks: "",
    status: "Dispatched",
  });
  const fileInputRef = useRef(null);

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
    setPreviewPage(1);
    setImportProgress(0);
    setCancelImport(false);
    cancelImportRef.current = false;
    setGlobalDefaults((prev) => ({
      ...prev,
      date: new Date().toISOString().split("T")[0],
      reference_type: "Challan Number",
      source_type: "Supplier",
      status: "Dispatched",
    }));

    api.get("/clients").then((r) => setClients(r.data || [])).catch(() => {});
    if (!products || products.length === 0) {
      api.get("/inventory/products").then((r) => setProductsList(r.data || [])).catch(() => {});
    } else {
      setProductsList(products);
    }
  }, [open, products]);

  const matchProduct = (name) => {
    if (!name) return "empty";
    const clean = name.toUpperCase().trim();
    if (productsList.find((p) => p.name.toUpperCase().trim() === clean)) return "matched";
    if (productsList.find((p) => p.name.toUpperCase().trim().includes(clean))) return "fuzzy";
    return "new";
  };

  const loadRowsFromText = async (text) => {
    const arrays = buildCsvArrays(text);
    return parseArraysToRows(arrays, mode, clients);
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
      return parseArraysToRows(arrays, mode, clients);
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

  const updateCell = (rowIndex, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      let row = { ...next[rowIndex] };
      if (field === "reference_value") {
        const cleanVal = stripNumeric(value);
        const refType = row.reference_type || globalDefaults.reference_type || "Challan Number";
        if (mode === "inward") {
          if (refType === "Bill Number") {
            row.bill_number = cleanVal;
            row.reference_number = cleanVal;
          } else {
            row.reference_number = cleanVal;
            row.bill_number = "";
          }
        } else {
          row.outward_challan_no = cleanVal;
          row.reference_number = cleanVal;
        }
      } else {
        row[field] = field === "product" ? String(value).toUpperCase() : value;
        if (field === "client_name") {
          const matched = findClient(value, clients);
          row.client_name = matched ? matched.full_name : value;
          row.client_id = matched ? matched.id : "";
          row.project_name = matched ? (matched.project_name || matched.full_name) : row.project_name;
          row.project_id = matched ? matched.id : "";
        }
      }
      next[rowIndex] = row;
      return next;
    });
  };

  const handleReviewTransition = () => {
    setRows((prevRows) => {
      return prevRows.map((row) => {
        let client_name = globalDefaults.client_name || "";
        let client_id = globalDefaults.client_id || "";
        if (client_name && !client_id) {
          const matched = findClient(client_name, clients);
          if (matched) {
            client_id = matched.id;
            client_name = matched.full_name;
          }
        }
        
        const reference_type = globalDefaults.reference_type || "Challan Number";
        const ref_number_val = stripNumeric(globalDefaults.reference_number || "");
        
        let reference_number = "";
        let bill_number = "";
        let outward_challan_no = "";
        
        if (mode === "inward") {
          if (reference_type === "Bill Number") {
            bill_number = ref_number_val;
            reference_number = ref_number_val;
          } else {
            reference_number = ref_number_val;
            bill_number = "";
          }
        } else {
          outward_challan_no = ref_number_val;
          reference_number = ref_number_val;
        }
        
        let source_type = globalDefaults.source_type || "Supplier";
        if (source_type === "Client Return") {
          source_type = "Return From Client";
        }
        
        const source_name = globalDefaults.source_name || "";
        
        const project_name = globalDefaults.project_name || "";
        const project_id = globalDefaults.project_id || client_id || "";
        
        return {
          ...row,
          date: globalDefaults.date || "",
          client_name,
          client_id,
          project_name,
          project_id,
          reference_type,
          reference_number,
          bill_number,
          outward_challan_no,
          source_type,
          source_name,
          remarks: globalDefaults.remarks || "",
          status: globalDefaults.status || "Dispatched",
        };
      });
    });
    setStep("review");
  };

  const toggleSelectRow = (index) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], _selected: !next[index]._selected };
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = rows.every((row) => row._selected);
    setRows((prev) => prev.map((row) => ({ ...row, _selected: !allSelected })));
  };

  const deleteRow = (index) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index).map((row, idx) => ({ ...row, _id: idx })));
  };

  const deleteSelectedRows = () => {
    setRows((prev) => prev.filter((row) => !row._selected).map((row, idx) => ({ ...row, _id: idx })));
  };

  const addBlankRow = () => {
    setRows((prev) => [...prev, { ...getBlankRow(mode), _id: prev.length }]);
  };

  const isRowValid = (row) => {
    if (!row.product?.trim()) return false;
    if (Number(row.quantity) <= 0) return false;
    if (mode === "outward" && !row.client_name?.trim() && !row.client_id) return false;
    return true;
  };

  const selectedRows = rows.filter((row) => row._selected);
  const invalidRowsCount = selectedRows.filter((row) => !isRowValid(row)).length;

  const handleFinalImport = async () => {
    const validRows = selectedRows.filter(isRowValid);
    if (!validRows.length) {
      toast.error("Select at least one valid row to import.");
      return;
    }
    setStep("importing");
    setImportProgress(0);
    setCancelImport(false);
    cancelImportRef.current = false;

    const CHUNK_SIZE = 500;
    const totalRows = validRows.length;
    let importedCount = 0;

    try {
      for (let i = 0; i < totalRows; i += CHUNK_SIZE) {
        if (cancelImportRef.current) {
          toast.warning("Import cancelled by user.");
          break;
        }
        const chunk = validRows.slice(i, i + CHUNK_SIZE);
        await api.post(cfg.bulkEndpoint, {
          rows: chunk,
          global_defaults: globalDefaults,
          source: "manual-bulk-import",
        });
        importedCount += chunk.length;
        setImportProgress(Math.round((importedCount / totalRows) * 100));
        // Yield to the browser main thread to keep UI responsive
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (!cancelImportRef.current) {
        toast.success("Manual bulk import completed.");
        setStep("done");
        onImported?.();
      } else {
        setStep("review");
      }
    } catch (err) {
      toast.error("Import failed: " + formatApiError(err));
      setStep("review");
    } finally {
      setProcessing(false);
    }
  };

  const handleFileSelection = (selected) => {
    setFile(selected);
    setFileName(selected?.name || "");
  };

  const handleClearFile = () => {
    setFile(null);
    setFileName("");
  };

  const productOptions = productsList.map((item) => item.name).filter(Boolean);
  const clientOptions = clients.map((client) => client.full_name).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl w-full h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-slate-200 flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-lg font-bold">{cfg.title}</DialogTitle>
            <DialogDescription className="text-xs text-slate-500 mt-0.5">{cfg.subtitle}</DialogDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className={`px-2 py-0.5 rounded-full font-semibold ${step === "input" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>1. Import</div>
            <div className={`px-2 py-0.5 rounded-full font-semibold ${step === "defaults" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>2. Defaults</div>
            <div className={`px-2 py-0.5 rounded-full font-semibold ${step === "review" ? "bg-slate-900 text-white" : "bg-slate-100"}`}>3. Review</div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/70">
          {step === "input" && (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-3xl border shadow-sm">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Choose input method</div>
                      <p className="text-xs text-slate-500 mt-1">Paste structured rows or upload a file with your data.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant={inputMode === "text" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("text")}>Paste Text</Button>
                      <Button variant={inputMode === "file" ? "secondary" : "outline"} size="sm" onClick={() => setInputMode("file")}>Upload File</Button>
                    </div>
                  </div>

                  {inputMode === "text" ? (
                    <div className="mt-5">
                      <Label htmlFor="manual-import-text" className="text-[11px] uppercase tracking-wider text-slate-500">Tabular text input</Label>
                      <Textarea
                        id="manual-import-text"
                        value={rawText}
                        onChange={(e) => setRawText(e.target.value)}
                        rows={12}
                        className="mt-2 font-mono text-xs"
                        placeholder="Paste rows with columns like Product, Size, Qty, Unit, Vendor, Client, Challan, Remarks..."
                      />
                    </div>
                  ) : (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                        <Upload className="mx-auto mb-3 w-10 h-10 text-slate-400" />
                        <div className="text-sm font-semibold text-slate-900">Upload CSV or Excel file</div>
                        <p className="text-xs text-slate-500 mt-1">Supported: .csv, .xls, .xlsx</p>
                        <Button className="mt-4" onClick={() => fileInputRef.current?.click()}>Select File</Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xls,.xlsx"
                          className="hidden"
                          onChange={(e) => {
                            const selected = e.target.files?.[0];
                            if (selected) handleFileSelection(selected);
                          }}
                        />
                      </div>

                      {fileName && (
                        <div className="rounded-3xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-4 text-sm text-slate-700">
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                            <div>
                              <div className="font-semibold">{fileName}</div>
                              <div className="text-[11px] text-slate-500">Ready to parse</div>
                            </div>
                          </div>
                          <button type="button" onClick={handleClearFile} className="text-slate-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white p-6 rounded-3xl border shadow-sm">
                  <div className="flex items-center gap-3 text-slate-700">
                    <Clipboard className="w-5 h-5 text-slate-500" />
                    <div>
                      <div className="text-sm font-semibold">Formatting tips</div>
                      <p className="text-xs text-slate-500">Headers are optional; columns may be comma-, tab-, or pipe-delimited.</p>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-2 text-xs text-slate-500 list-disc list-inside">
                    <li>Use headers like Product, Size, Qty, Unit, Client, Vendor, Challan, Remarks.</li>
                    <li>If no header row is provided, the parser uses a sensible default column order.</li>
                    <li>You can edit any row after parsing before importing.</li>
                  </ul>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-slate-700">
                  <div className="text-sm font-semibold">Example data</div>
                  <div className="mt-3 text-[11px] font-mono leading-6 text-slate-500 whitespace-pre-wrap">
                    Product,Size,Qty,Unit,Vendor,Challan Number,Remarks{"\n"}
                    WAAREE PANEL 540W,540W,10,Nos,ABC Supplier,12345,In stock{"\n"}
                    BOS CABLE 4SQ,4SQ,25,Mtr,XYZ Cables,12346,Delivery pending
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
                  <div className="text-sm font-semibold">Product & client suggestions</div>
                  <p className="text-xs text-slate-500 mt-2">Parsed product names can be matched against your existing product master, and client names are suggested from your saved clients.</p>
                </div>
              </div>
            </div>
          )}

          {step === "defaults" && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white p-6 rounded-3xl border shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={globalDefaults.date} onChange={(e) => setGlobalDefaults({ ...globalDefaults, date: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Reference Number</Label><Input value={globalDefaults.reference_number} onChange={(e) => setGlobalDefaults({ ...globalDefaults, reference_number: e.target.value })} /></div>
                  <div className="space-y-1.5">
                    <Label>Reference Type</Label>
                    <Select value={globalDefaults.reference_type} onValueChange={(value) => setGlobalDefaults({ ...globalDefaults, reference_type: value })}>
                      <SelectTrigger><SelectValue placeholder="Select reference type" /></SelectTrigger>
                      <SelectContent>
                        {REF_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {mode === "inward" && (
                    <div className="space-y-1.5">
                      <Label>Source Type</Label>
                      <Select value={globalDefaults.source_type} onValueChange={(value) => {
                        const nextDefaults = { ...globalDefaults, source_type: value };
                        if (value === "Return From Client") {
                          nextDefaults.source_name = "";
                        }
                        setGlobalDefaults(nextDefaults);
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select source type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Supplier">Supplier</SelectItem>
                          <SelectItem value="Vendor">Vendor</SelectItem>
                          <SelectItem value="Return From Client">Client Return</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {mode === "inward" && globalDefaults.source_type !== "Return From Client" && (
                    <div className="space-y-1.5"><Label>Vendor / Source Name</Label><Input value={globalDefaults.source_name} onChange={(e) => setGlobalDefaults({ ...globalDefaults, source_name: e.target.value })} /></div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Client Name</Label>
                    <Input
                      list="manual-client-list"
                      value={globalDefaults.client_name}
                      onChange={(e) => {
                        const val = e.target.value;
                        const matched = findClient(val, clients);
                        setGlobalDefaults({
                          ...globalDefaults,
                          client_name: matched ? matched.full_name : val,
                          client_id: matched ? matched.id : "",
                          project_name: matched ? (matched.sol_id || matched.full_name) : globalDefaults.project_name,
                          project_id: matched ? matched.id : ""
                        });
                      }}
                      placeholder="Search and select client"
                    />
                  </div>
                  {(mode === "outward" || globalDefaults.source_type === "Return From Client") && (
                    <div className="space-y-1.5"><Label>Project / Site Name</Label><Input value={globalDefaults.project_name} onChange={(e) => setGlobalDefaults({ ...globalDefaults, project_name: e.target.value })} /></div>
                  )}
                  {mode === "outward" && (
                    <div className="space-y-1.5">
                      <Label>Status</Label>
                      <Select value={globalDefaults.status} onValueChange={(value) => setGlobalDefaults({ ...globalDefaults, status: value })}>
                        <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <datalist id="manual-client-list">{clientOptions.map((name) => <option key={name} value={name} />)}</datalist>
                  <div className="col-span-1 lg:col-span-2 space-y-1.5"><Label>Remarks</Label><Textarea value={globalDefaults.remarks} onChange={(e) => setGlobalDefaults({ ...globalDefaults, remarks: e.target.value })} rows={3} /></div>
                </div>
              </div>
            </div>
          )}

          {step === "review" && (() => {
            const itemsPerPage = 50;
            const totalPages = Math.ceil(rows.length / itemsPerPage);
            const startIdx = (previewPage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const visibleRows = rows.slice(startIdx, endIdx);

            return (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={toggleSelectAll}>Toggle Select All</Button>
                    <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50" onClick={deleteSelectedRows}>Delete Selected</Button>
                    <Button variant="outline" size="sm" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={addBlankRow}><PlusIcon className="w-4 h-4 mr-1" /> Add Row</Button>
                  </div>
                  {invalidRowsCount > 0 && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{invalidRowsCount} Invalid Rows</Badge>}
                </div>

                <div className="overflow-x-auto bg-white border rounded-3xl">
                  <table className="min-w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2 w-8">☑</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Size</th>
                        <th className="px-3 py-2">Qty</th>
                        <th className="px-3 py-2">Unit</th>
                        {mode === "inward" ? (globalDefaults.source_type === "Return From Client" ? <th className="px-3 py-2">Client</th> : <th className="px-3 py-2">Vendor</th>) : <th className="px-3 py-2">Client</th>}
                        {(mode === "outward" || (mode === "inward" && globalDefaults.source_type === "Return From Client")) && <th className="px-3 py-2">Project</th>}
                        <th className="px-3 py-2">{getRefHeaderLabel(globalDefaults.reference_type)}</th>
                        <th className="px-3 py-2">Remarks</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">No rows to review yet.</td></tr>
                      ) : (
                        visibleRows.map((row) => {
                          const originalIndex = rows.findIndex((r) => r._id === row._id);
                          if (originalIndex === -1) return null;
                          const status = matchProduct(row.product);
                          const rowErrors = [];
                          if (!row.product?.trim()) rowErrors.push("Product required");
                          if (!row.quantity || Number(row.quantity) <= 0) rowErrors.push("Qty > 0 required");
                          if (mode === "outward" && !row.client_name?.trim() && !row.client_id) rowErrors.push("Client required");
                          
                          return (
                            <tr key={row._id} className={`${!row._selected ? "opacity-60" : ""} border-t border-slate-100`}> 
                              <td className="px-3 py-2.5 align-top"><input type="checkbox" checked={row._selected} onChange={() => toggleSelectRow(originalIndex)} className="mt-2.5 accent-blue-600 w-4 h-4" /></td>
                              <td className="px-3 py-2.5 align-top min-w-[200px]">
                                <Textarea value={row.product} onChange={(e) => updateCell(originalIndex, "product", e.target.value)} rows={2} className="text-xs bg-white border border-slate-200 rounded p-1 w-full text-slate-800" list="manual-product-list" />
                                <datalist id="manual-product-list">{productOptions.map((name) => <option key={name} value={name} />)}</datalist>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                  <span className={`font-semibold ${status === "matched" ? "text-emerald-600" : status === "fuzzy" ? "text-amber-600" : "text-blue-600"}`}>
                                    {status === "matched" ? "Matched" : status === "fuzzy" ? "Partial" : "New"}
                                  </span>
                                  {rowErrors.map((err) => (
                                    <span key={err} className="text-red-600 font-semibold bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md">{err}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 align-top"><Input value={row.size || ""} onChange={(e) => updateCell(originalIndex, "size", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                              <td className="px-3 py-2.5 align-top"><Input type="number" value={row.quantity || ""} onChange={(e) => updateCell(originalIndex, "quantity", Number(e.target.value) || 0)} className="text-xs h-8 bg-white border-slate-200 w-20" /></td>
                              <td className="px-3 py-2.5 align-top">
                                <Select value={row.unit || "Nos"} onValueChange={(value) => updateCell(originalIndex, "unit", value)}>
                                  <SelectTrigger className="h-8 text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                                  <SelectContent>{UNIT_OPTIONS.map((unit) => <SelectItem key={unit} value={unit}>{unit}</SelectItem>)}</SelectContent>
                                </Select>
                              </td>
                              {mode === "inward" ? (
                                globalDefaults.source_type === "Return From Client" ? (
                                  <td className="px-3 py-2.5 align-top"><Input list="manual-client-list" value={row.client_name || ""} onChange={(e) => updateCell(originalIndex, "client_name", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                                ) : (
                                  <td className="px-3 py-2.5 align-top"><Input value={row.source_name || ""} onChange={(e) => updateCell(originalIndex, "source_name", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                                )
                              ) : (
                                <td className="px-3 py-2.5 align-top"><Input list="manual-client-list" value={row.client_name || ""} onChange={(e) => updateCell(originalIndex, "client_name", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                              )}
                              {(mode === "outward" || (mode === "inward" && globalDefaults.source_type === "Return From Client")) && (
                                <td className="px-3 py-2.5 align-top"><Input value={row.project_name || ""} onChange={(e) => updateCell(originalIndex, "project_name", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                              )}
                              <td className="px-3 py-2.5 align-top">
                                <Input
                                  value={getRowReferenceValue(row, globalDefaults.reference_type, mode)}
                                  onChange={(e) => updateCell(originalIndex, "reference_value", e.target.value)}
                                  className="text-xs h-8 bg-white border-slate-200 font-mono"
                                />
                              </td>
                              <td className="px-3 py-2.5 align-top"><Input value={row.remarks || ""} onChange={(e) => updateCell(originalIndex, "remarks", e.target.value)} className="text-xs h-8 bg-white border-slate-200" /></td>
                              <td className="px-3 py-2.5 align-top">
                                <Select value={row.status || "Dispatched"} onValueChange={(value) => updateCell(originalIndex, "status", value)}>
                                  <SelectTrigger className="h-8 text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                                  <SelectContent>{STATUS_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2.5 align-top text-center"><button type="button" onClick={() => deleteRow(originalIndex)} className="text-slate-400 hover:text-red-600 mt-2"><X className="w-4 h-4" /></button></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {rows.length > itemsPerPage && (
                  <div className="flex items-center justify-between mt-4 bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
                    <div className="text-xs text-slate-500 font-medium">
                      Showing {startIdx + 1}–{Math.min(endIdx, rows.length)} of {rows.length} rows
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.max(1, p - 1))} disabled={previewPage <= 1}>Previous</Button>
                      <span className="text-xs font-semibold text-slate-700">Page {previewPage} of {totalPages}</span>
                      <Button variant="outline" size="sm" onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))} disabled={previewPage >= totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {step === "importing" && (
            <div className="py-20 flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
              <Upload className="animate-spin w-12 h-12 text-blue-600" />
              <div className="w-full text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">Importing rows: {importProgress}%</p>
                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden shadow-inner">
                  <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${importProgress}%` }}></div>
                </div>
              </div>
              <Button variant="destructive" size="sm" className="rounded-xl px-6" onClick={() => { cancelImportRef.current = true; setCancelImport(true); }}>Cancel Import</Button>
            </div>
          )}

          {step === "done" && (
            <div className="py-16 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <h3 className="text-lg font-bold">Import Completed</h3>
              <p className="text-xs text-slate-500">Your manual bulk rows were saved successfully.</p>
            </div>
          )}

          {errors && step !== "done" && (
            <div className="mt-4 rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors}</div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t flex flex-wrap gap-2 justify-end shrink-0">
          {step === "input" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleParse} disabled={processing}>{processing ? "Parsing…" : "Parse rows"}</Button>
            </>
          )}
          {step === "defaults" && (
            <>
              <Button variant="outline" onClick={() => setStep("input")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button>
              <Button onClick={handleReviewTransition}>Review rows</Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={() => setStep("defaults")}><ArrowLeft className="w-4 h-4 mr-1.5" /> Back</Button>
              <Button onClick={handleFinalImport} disabled={processing || selectedRows.length === 0 || invalidRowsCount > 0}>{processing ? "Importing…" : `Import ${selectedRows.length} rows`}</Button>
            </>
          )}
          {step === "done" && (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlusIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5v14M5 12h14" /></svg>;
}
