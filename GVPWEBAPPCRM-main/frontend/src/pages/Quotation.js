import React, { useEffect, useMemo, useState, useCallback } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useClientList, useCompany } from "@/hooks/useClients";
import { useSalesDocuments, useDeleteSalesDocument } from "@/hooks/useSalesDocuments";
import { useProductList } from "@/hooks/useInventory";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Plus, Trash2, FileText, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { ProductAutocompleteInput } from "@/components/Inventory/_shared";

const newId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const EMPTY_ROW = () => ({ id: newId(), product_id: "", product: "", size: "", unit: "Nos", quantity: "", rate: "", discount: "", gst: "18", isCustomGst: false, serial_numbers: "", custom: {} });
const EMPTY_CUSTOM = () => ({ id: newId(), label: "", type: "text" });
const EMPTY_FORMULA = () => ({ id: newId(), label: "", base: "rate", operator: "+", value: "5", isPercent: true });

const BASE_FIELDS = [
  { value: "rate", label: "Rate" },
  { value: "quantity", label: "Quantity" },
  { value: "amount", label: "Amount" },
];

const formatMoney = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const clampNumber = (value) => {
  if (value === "" || value === undefined || value === null) return "";
  const cleaned = String(value).replace(/[^0-9.]/g, "");
  return cleaned;
};

export default function Quotation() {
  const [clientSource, setClientSource] = useState("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientForm, setClientForm] = useState({
    full_name: "",
    address: "",
    gst_number: "",
    consumer_number: "",
    mobile: "",
    email: "",
    project_capacity: "",
  });
  const [quoteNumber, setQuoteNumber] = useState(`Q-${dayjs().format("YYMMDD-HHmm")}`);
  const [quoteDate, setQuoteDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [validTill, setValidTill] = useState(dayjs().add(15, "day").format("YYYY-MM-DD"));
  const [preparedBy, setPreparedBy] = useState("");
  const [applyGst, setApplyGst] = useState(true);
  const [showOwner, setShowOwner] = useState(() => {
    const saved = localStorage.getItem("solarix_show_owner");
    return saved === null ? true : saved === "true";
  });
  const [productDetailsHeading, setProductDetailsHeading] = useState("Product Details");
  const [productDetails, setProductDetails] = useState("");

  const handleShowOwnerChange = (val) => {
    setShowOwner(val);
    localStorage.setItem("solarix_show_owner", String(val));
  };
  const [items, setItems] = useState([EMPTY_ROW()]);
  const [customColumns, setCustomColumns] = useState([]);
  const [formulaColumns, setFormulaColumns] = useState([]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Payment due within 15 days. Goods once supplied will not be taken back.");
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("quotation");
  const deleteDocMutation = useDeleteSalesDocument("quotation");

  const handleDeleteHistory = async (fileId) => {
    if (!window.confirm("Delete Document?\n\nThis action will permanently delete the document and its PDF.\n\nThis action cannot be undone.")) {
      return;
    }
    deleteDocMutation.mutate(fileId);
  };

  // — Use React Query hooks so data is served from cache on repeat visits —
  const { data: clientsData } = useClientList();
  const clients = useMemo(() => clientsData || [], [clientsData]);
  const { data: productsData } = useProductList();
  const products = useMemo(() => productsData || [], [productsData]);
  const { data: companyData } = useCompany();
  const company = companyData || null;

  // Sync preparedBy from company when it first loads — runs only when companyData changes.
  // IMPORTANT: preparedBy must NOT be in the deps array or setState → dep change → re-run = infinite loop.
  useEffect(() => {
    if (companyData?.owner_name) {
      setPreparedBy((prev) => prev || companyData.owner_name);
    }
  }, [companyData]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => {
    if (clientSource !== "existing") return;
    const client = clients.find((c) => c.id === selectedClientId);
    if (client) {
      setClientForm({
        full_name: client.full_name || "",
        address: [client.address, client.city, client.state, client.pincode].filter(Boolean).join(", "),
        gst_number: client.gst_number || "",
        consumer_number: client.consumer_number || "",
        mobile: client.mobile || "",
        email: client.email || "",
        project_capacity: client.system_kw ? `${client.system_kw} kW` : "",
      });
    }
  }, [clientSource, selectedClientId, clients]);



  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const handleRowChange = (rowId, key, value) => {
    setItems((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      let next = { ...row };
      if (key === "product") {
        if (typeof value === "object" && value !== null) {
          next.product = (value.name || "").toUpperCase();
          next.product_id = value.id;
          next.size = value.size || "";
          next.unit = value.unit || "Nos";
          next.rate = (value.rate !== undefined && value.rate !== null) ? String(value.rate) : "";
        } else {
          next.product = value;
          const matched = products.find((p) => p.name.toUpperCase() === value.toUpperCase());
          if (matched) {
            next.product_id = matched.id;
            next.size = matched.size || "";
            next.unit = matched.unit || "Nos";
            next.rate = (matched.rate !== undefined && matched.rate !== null) ? String(matched.rate) : "";
          } else {
            next.product_id = "";
          }
        }
      } else {
        next[key] = value;
      }
      return next;
    }));
  };

  const handleCustomFieldChange = (rowId, columnId, value) => {
    setItems((prev) => prev.map((row) => {
      if (row.id !== rowId) return row;
      return { ...row, custom: { ...row.custom, [columnId]: value } };
    }));
  };

  const addItem = () => setItems((prev) => [...prev, EMPTY_ROW()]);
  const removeItem = (rowId) => setItems((prev) => prev.filter((row) => row.id !== rowId));
  const addCustomColumn = () => setCustomColumns((prev) => [...prev, EMPTY_CUSTOM()]);
  const addFormulaColumn = () => setFormulaColumns((prev) => [...prev, EMPTY_FORMULA()]);

  const reorderColumn = (id, direction) => {
    setCustomColumns((prev) => {
      const index = prev.findIndex((col) => col.id === id);
      if (index === -1) return prev;
      const next = [...prev];
      const target = index + (direction === "up" ? -1 : 1);
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const reorderFormulaColumn = (id, direction) => {
    setFormulaColumns((prev) => {
      const index = prev.findIndex((col) => col.id === id);
      if (index === -1) return prev;
      const next = [...prev];
      const target = index + (direction === "up" ? -1 : 1);
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeCustomColumn = (id) => setCustomColumns((prev) => prev.filter((col) => col.id !== id));
  const removeFormulaColumn = (id) => setFormulaColumns((prev) => prev.filter((col) => col.id !== id));

  const parseNumber = useCallback((value) => {
    const num = Number(String(value).replace(/[^0-9.]/g, ""));
    return Number.isNaN(num) ? 0 : num;
  }, []);

  const computeItemAmount = useCallback((row, applyGstGlobal) => {
    const qty = parseNumber(row.quantity);
    const rate = parseNumber(row.rate);
    const discount = parseNumber(row.discount);
    const gst = applyGstGlobal ? parseNumber(row.gst) : 0;
    const taxable = Math.max(0, qty * rate - discount);
    const gstAmount = taxable * gst / 100;
    return Math.round((taxable + gstAmount) * 100) / 100;
  }, [parseNumber]);

  const computeFormulaValue = (row, formula, applyGstGlobal) => {
    const base = formula.base === "amount" ? computeItemAmount(row, applyGstGlobal) : parseNumber(row[formula.base]);
    const value = parseNumber(formula.value);
    if (formula.isPercent) {
      const delta = base * (value / 100);
      if (formula.operator === "+") return Math.round((base + delta) * 100) / 100;
      if (formula.operator === "-") return Math.round((base - delta) * 100) / 100;
      if (formula.operator === "*") return Math.round((base * delta) * 100) / 100;
      if (formula.operator === "/") return value === 0 ? 0 : Math.round((base / delta) * 100) / 100;
    }
    if (formula.operator === "+") return Math.round((base + value) * 100) / 100;
    if (formula.operator === "-") return Math.round((base - value) * 100) / 100;
    if (formula.operator === "*") return Math.round((base * value) * 100) / 100;
    if (formula.operator === "/") return value === 0 ? 0 : Math.round((base / value) * 100) / 100;
    return 0;
  };

  const totals = useMemo(() => {
    const total = items.reduce((sum, row) => sum + computeItemAmount(row, applyGst), 0);
    return { total };
  }, [items, applyGst, computeItemAmount]);

  const saveDocument = async () => {
    if (!quoteNumber.trim()) {
      toast.error("Quotation number is required");
      return;
    }
    if (items.length === 0 || items.every(r => !r.product?.trim())) {
      toast.error("Add at least one item");
      return;
    }
    setBusy(true);
    try {
      const docData = {
        quote_number: quoteNumber,
        quote_date: quoteDate,
        valid_till: validTill,
        prepared_by: preparedBy,
        show_owner: showOwner,
        apply_gst: applyGst,
        notes,
        terms,
        product_details_heading: productDetailsHeading,
        product_details: productDetails,
        client: clientSource === "manual" ? clientForm : undefined,
        items: items.map((row) => {
          const formulaValues = {};
          formulaColumns.forEach((col) => {
            formulaValues[col.id] = computeFormulaValue(row, col, applyGst);
          });
          return {
            product: row.product,
            size: row.size,
            unit: row.unit,
            quantity: parseNumber(row.quantity),
            rate: parseNumber(row.rate),
            discount: parseNumber(row.discount),
            gst: applyGst ? parseNumber(row.gst) : 0,
            amount: computeItemAmount(row, applyGst),
            serial_numbers: row.serial_numbers || "",
            custom: row.custom,
            formula: formulaValues,
          };
        }),
        custom_columns: customColumns.map((col) => ({ id: col.id, label: col.label })),
        formula_columns: formulaColumns.map((col) => ({ id: col.id, label: col.label, base: col.base, operator: col.operator, value: col.value, isPercent: col.isPercent })),
      };
      const payload = { doc_type: "quotation", doc_data: docData };
      const url = clientSource === "existing" && selectedClientId ? `/clients/${selectedClientId}/generate-document` : "/documents/generate";
      if (url === "/documents/generate") {
        payload.client_id = selectedClientId || undefined;
      }
      const { data } = await api.post(url, payload);
      const files = data.files || [{ id: data.id, filename: data.filename, label: data.label }];
      setGeneratedFiles(files);
      toast.success("Quotation generated successfully.");
      fetchHistory();
      if (files.length > 0) {
        window.open(fileUrl(files[0].id), "_blank");
      }
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Quotation</h1>
          <p className="text-sm text-slate-500 mt-1">Create a professional quotation using client data and product master.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveDocument} disabled={busy}>
            {busy ? "Generating…" : "Generate Quotation"}
          </Button>
          {generatedFiles.length > 0 && (
            <Button variant="outline" className="border-slate-300 text-slate-700" onClick={() => window.open(fileUrl(generatedFiles[0].id), "_blank")}>Open PDF</Button>
          )}
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">Quotation Settings & Details</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Quotation No</Label>
                  <Input value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} />
                </div>
                <div>
                  <Label>Quotation Date</Label>
                  <Input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} />
                </div>
                <div>
                  <Label>Valid Till</Label>
                  <Input type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
                </div>
                <div>
                  <Label>Prepared By</Label>
                  <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Your name or team" />
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-4 pt-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="apply-gst-quotation"
                    checked={applyGst}
                    onChange={(e) => setApplyGst(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <Label htmlFor="apply-gst-quotation" className="text-sm font-medium text-slate-700 cursor-pointer">Apply GST</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-owner-quotation"
                    checked={showOwner}
                    onChange={(e) => handleShowOwnerChange(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    data-testid="show-owner-checkbox"
                  />
                  <Label htmlFor="show-owner-quotation" className="text-sm font-medium text-slate-700 cursor-pointer">Show Owner Name</Label>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">Client Details</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Source</Label>
                  <Select value={clientSource} onValueChange={(value) => setClientSource(value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="existing">Existing Client</SelectItem>
                      <SelectItem value="manual">Manual Entry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {clientSource === "existing" ? (
                  <div>
                    <Label>Select Client</Label>
                    <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select existing client" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : <div />}
                <div>
                  <Label>Client Name</Label>
                  <Input value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} />
                </div>
                <div>
                  <Label>GST Number</Label>
                  <Input value={clientForm.gst_number} onChange={(e) => setClientForm({ ...clientForm, gst_number: e.target.value })} />
                </div>
                <div>
                  <Label>Consumer Number</Label>
                  <Input value={clientForm.consumer_number} onChange={(e) => setClientForm({ ...clientForm, consumer_number: e.target.value })} />
                </div>
                <div>
                  <Label>Mobile</Label>
                  <Input value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} />
                </div>
                <div>
                  <Label>Project Capacity</Label>
                  <Input value={clientForm.project_capacity} onChange={(e) => setClientForm({ ...clientForm, project_capacity: e.target.value })} placeholder="e.g. 5 kW" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Address</Label>
                  <Textarea value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} rows={2} />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Quotation Table</div>
            <Button variant="outline" size="sm" className="border-slate-300 text-slate-700" onClick={addItem}>
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-separate border-spacing-0">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 border border-slate-200 w-1/4">Product</th>
                  <th className="px-3 py-3 border border-slate-200">Size</th>
                  <th className="px-3 py-3 border border-slate-200">Unit</th>
                  <th className="px-3 py-3 border border-slate-200 w-24">Qty</th>
                  <th className="px-3 py-3 border border-slate-200">Rate</th>
                  <th className="px-3 py-3 border border-slate-200">Discount</th>
                  {applyGst && <th className="px-3 py-3 border border-slate-200">GST %</th>}
                  <th className="px-3 py-3 border border-slate-200">Amount</th>
                  {customColumns.map((col) => <th key={col.id} className="px-3 py-3 border border-slate-200">{col.label || "Custom"}</th>)}
                  {formulaColumns.map((col) => <th key={col.id} className="px-3 py-3 border border-slate-200">{col.label || "Formula"}</th>)}
                  <th className="px-3 py-3 border border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b border-slate-200">
                    <td className="px-3 py-2 align-top border border-slate-200 min-w-[200px]">
                      <ProductAutocompleteInput
                        value={row.product}
                        onChange={(v) => handleRowChange(row.id, "product", v)}
                        products={products}
                        placeholder="Type or select product..."
                        className="h-9"
                      />
                      
                      <input
                        type="text"
                        className="text-[10px] text-slate-500 mt-1 placeholder-slate-400 w-full border-b border-slate-100 hover:border-slate-300 focus:border-blue-500 outline-none p-0.5 bg-transparent"
                        placeholder="Enter serial numbers (comma separated)..."
                        value={row.serial_numbers || ""}
                        onChange={(e) => handleRowChange(row.id, "serial_numbers", e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 border border-slate-200"><Input value={row.size} onChange={(e) => handleRowChange(row.id, "size", e.target.value)} /></td>
                    <td className="px-3 py-2 border border-slate-200"><Input value={row.unit} onChange={(e) => handleRowChange(row.id, "unit", e.target.value)} /></td>
                    <td className="px-3 py-2 border border-slate-200 w-24"><Input type="number" value={row.quantity} onChange={(e) => handleRowChange(row.id, "quantity", clampNumber(e.target.value))} /></td>
                    <td className="px-3 py-2 border border-slate-200"><Input type="number" value={row.rate} onChange={(e) => handleRowChange(row.id, "rate", clampNumber(e.target.value))} /></td>
                    <td className="px-3 py-2 border border-slate-200"><Input type="number" value={row.discount} onChange={(e) => handleRowChange(row.id, "discount", clampNumber(e.target.value))} /></td>
                    {applyGst && (
                      <td className="px-3 py-2 border border-slate-200 min-w-[95px]">
                        {row.isCustomGst ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              className="w-12 h-8 text-xs p-1"
                              value={row.gst}
                              onChange={(e) => handleRowChange(row.id, "gst", e.target.value)}
                            />
                            <button
                              onClick={() => {
                                handleRowChange(row.id, "isCustomGst", false);
                                handleRowChange(row.id, "gst", "18");
                              }}
                              className="text-[9px] text-blue-600 hover:underline"
                            >
                              Reset
                            </button>
                          </div>
                        ) : (
                          <Select
                            value={row.gst}
                            onValueChange={(val) => {
                              if (val === "custom") {
                                handleRowChange(row.id, "isCustomGst", true);
                                handleRowChange(row.id, "gst", "");
                              } else {
                                handleRowChange(row.id, "gst", val);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8"><SelectValue placeholder="GST" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">0%</SelectItem>
                              <SelectItem value="5">5%</SelectItem>
                              <SelectItem value="12">12%</SelectItem>
                              <SelectItem value="18">18%</SelectItem>
                              <SelectItem value="28">28%</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 border border-slate-200 font-semibold tabular-nums">{formatMoney(computeItemAmount(row, applyGst))}</td>
                    {customColumns.map((col) => (
                      <td key={col.id} className="px-3 py-2 border border-slate-200">
                        <Input value={row.custom[col.id] || ""} onChange={(e) => handleCustomFieldChange(row.id, col.id, e.target.value)} />
                      </td>
                    ))}
                    {formulaColumns.map((col) => (
                      <td key={col.id} className="px-3 py-2 border border-slate-200 font-semibold tabular-nums">
                        {formatMoney(computeFormulaValue(row, col, applyGst))}
                      </td>
                    ))}
                    <td className="px-3 py-2 border border-slate-200">
                      <button type="button" onClick={() => removeItem(row.id)} className="text-rose-600 hover:text-rose-800" aria-label="Remove row">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_minmax(220px,280px)]">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">Custom Column Builder</div>
              <div className="grid gap-2">
                {customColumns.map((column) => (
                  <div key={column.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                    <Input value={column.label} onChange={(e) => setCustomColumns((prev) => prev.map((col) => col.id === column.id ? { ...col, label: e.target.value } : col))} placeholder="Column label" />
                    <button type="button" onClick={() => reorderColumn(column.id, "up")} className="px-2 py-2 rounded bg-slate-100 hover:bg-slate-200">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => removeCustomColumn(column.id)} className="px-2 py-2 rounded bg-slate-100 hover:bg-slate-200">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="border-slate-300 text-slate-700" onClick={addCustomColumn}>
                <Plus className="w-4 h-4 mr-2" /> Add Column
              </Button>
            </div>
            <div className="space-y-3">
              <div className="text-sm font-semibold text-slate-900">Formula Column Builder</div>
              <div className="grid gap-2">
                {formulaColumns.map((formula) => (
                  <div key={formula.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 bg-slate-50">
                    <Input value={formula.label} onChange={(e) => setFormulaColumns((prev) => prev.map((col) => col.id === formula.id ? { ...col, label: e.target.value } : col))} placeholder="Column label" />
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={formula.base} onValueChange={(value) => setFormulaColumns((prev) => prev.map((col) => col.id === formula.id ? { ...col, base: value } : col))}>
                        <SelectTrigger><SelectValue placeholder="Base" /></SelectTrigger>
                        <SelectContent>
                          {BASE_FIELDS.map((field) => (<SelectItem key={field.value} value={field.value}>{field.label}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <Select value={formula.operator} onValueChange={(value) => setFormulaColumns((prev) => prev.map((col) => col.id === formula.id ? { ...col, operator: value } : col))}>
                        <SelectTrigger><SelectValue placeholder="Op" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="+">+</SelectItem>
                          <SelectItem value="-">-</SelectItem>
                          <SelectItem value="*">*</SelectItem>
                          <SelectItem value="/">/</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input value={formula.value} onChange={(e) => setFormulaColumns((prev) => prev.map((col) => col.id === formula.id ? { ...col, value: clampNumber(e.target.value) } : col))} placeholder="Value" />
                      <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" checked={formula.isPercent} onChange={(e) => setFormulaColumns((prev) => prev.map((col) => col.id === formula.id ? { ...col, isPercent: e.target.checked } : col))} />
                        %
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => reorderFormulaColumn(formula.id, "up")} className="px-2 py-2 rounded bg-slate-100 hover:bg-slate-200">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => removeFormulaColumn(formula.id)} className="px-2 py-2 rounded bg-slate-100 hover:bg-slate-200">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="border-slate-300 text-slate-700" onClick={addFormulaColumn}>
                <Plus className="w-4 h-4 mr-2" /> Add Formula
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Terms & Conditions</Label>
              <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} />
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-2">
              <Input
                value={productDetailsHeading}
                onChange={(e) => setProductDetailsHeading(e.target.value)}
                placeholder="Product Details Heading"
                className="w-80 font-semibold text-sm text-slate-900 border-none bg-transparent hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-blue-500 p-1 h-8 rounded"
                data-testid="product-details-heading-input"
              />
            </div>
            <Textarea
              value={productDetails}
              onChange={(e) => setProductDetails(e.target.value)}
              placeholder="Enter product details (optional)..."
              rows={4}
              data-testid="product-details-content-textarea"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div>Total quotation amount</div>
            <div className="text-xl font-bold text-slate-950">₹ {formatMoney(totals.total)}</div>
          </div>
        </CardContent>
      </Card>

      {generatedFiles.length > 0 && (
        <Card className="border-slate-200">
          <CardContent className="p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3">Generated Files</div>
            <div className="grid gap-3 md:grid-cols-2">
              {generatedFiles.map((file) => (
                <div key={file.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{file.label}</div>
                    <div className="text-xs text-slate-500">{file.filename}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => window.open(fileUrl(file.id), "_blank")}>Open</Button>
                    <a href={fileUrl(file.id)} download>
                      <Button variant="outline" size="sm" className="border-slate-300 text-slate-700"><Download className="w-4 h-4" /></Button>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">Generated Documents</div>
          {loadingHistory ? (
            <div className="text-sm text-slate-500 py-4 text-center">Loading history...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">No generated documents yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Document Type</th>
                    <th className="text-left px-4 py-3 font-semibold">Document Number</th>
                    <th className="text-left px-4 py-3 font-semibold">Client Name</th>
                    <th className="text-left px-4 py-3 font-semibold">Generated Date & Time</th>
                    <th className="text-left px-4 py-3 font-semibold">Prepared By</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((doc) => (
                    <tr key={doc.id} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700 font-medium">{doc.doc_type === "quotation" ? "Quotation" : doc.doc_type === "tax_invoice" ? "Tax Invoice" : doc.doc_type === "delivery_bill" ? "Delivery Bill" : doc.doc_type}</td>
                      <td className="px-4 py-3 text-slate-700 font-mono text-xs">{doc.document_number}</td>
                      <td className="px-4 py-3 text-slate-700">{doc.client_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.created_at ? dayjs(doc.created_at).format("YYYY-MM-DD HH:mm") : "—"}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{doc.prepared_by || "—"}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-green-50 text-green-700 border border-green-200/65">
                          {doc.status || "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                        <Button variant="outline" size="sm" onClick={() => window.open(fileUrl(doc.id), "_blank")}>View</Button>
                        <a href={fileUrl(doc.id)} download={doc.filename} className="inline-block">
                          <Button variant="outline" size="sm" className="border-slate-300 text-slate-700">Download</Button>
                        </a>
                        <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={() => handleDeleteHistory(doc.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
