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
import { Plus, Trash2, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import { ProductAutocompleteInput } from "@/components/Inventory/_shared";

const newId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const EMPTY_ROW = () => ({ id: newId(), product_id: "", product: "", size: "", unit: "Nos", quantity: "", rate: "", gst: "18", isCustomGst: false, serial_numbers: "", discount: "0" });

const formatMoney = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNumber = (value) => {
  const num = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

const amountInWords = (amount) => {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const convert = (num) => {
    if (num < 20) return words[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ` ${words[num % 10]}` : "");
    if (num < 1000) return `${words[Math.floor(num / 100)]} hundred${num % 100 ? ` ${convert(num % 100)}` : ""}`;
    if (num < 100000) return `${convert(Math.floor(num / 1000))} thousand${num % 1000 ? ` ${convert(num % 1000)}` : ""}`;
    return `${convert(Math.floor(num / 100000))} lakh${num % 100000 ? ` ${convert(num % 100000)}` : ""}`;
  };
  const integerPart = Math.floor(amount);
  const paise = Math.round((amount - integerPart) * 100);
  let result = `${convert(integerPart)} rupees`;
  if (paise > 0) {
    result += ` and ${convert(paise)} paise`;
  }
  return result.charAt(0).toUpperCase() + result.slice(1) + " only";
};

const taxableValue = (row) => {
  const qty = parseNumber(row.quantity);
  const rate = parseNumber(row.rate);
  const discount = parseNumber(row.discount);
  return Math.max(0, qty * rate - discount);
};

const gstAmounts = (row, isInterState, applyGstGlobal) => {
  if (!applyGstGlobal) return { cgst: 0, sgst: 0, igst: 0 };
  const taxVal = taxableValue(row);
  const gstRate = parseNumber(row.gst);
  const totalGst = taxVal * gstRate / 100;
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: totalGst };
  } else {
    return { cgst: totalGst / 2, sgst: totalGst / 2, igst: 0 };
  }
};

const rowAmount = (row, isInterState, applyGstGlobal) => {
  const tax = gstAmounts(row, isInterState, applyGstGlobal);
  return taxableValue(row) + tax.cgst + tax.sgst + tax.igst;
};

export default function TaxInvoice() {
  const [clientSource, setClientSource] = useState("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientForm, setClientForm] = useState({ full_name: "", address: "", gst_number: "", mobile: "", email: "", site_address: "" });
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${dayjs().format("YYMMDD-HHmm")}`);
  const [invoiceDate, setInvoiceDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [applyGst, setApplyGst] = useState(true);
  const [showOwner, setShowOwner] = useState(() => {
    const saved = localStorage.getItem("solarix_show_owner");
    return saved === null ? true : saved === "true";
  });
  const [customTitle, setCustomTitle] = useState(() => {
    return localStorage.getItem("solarix_custom_invoice_title") || "Tax Invoice";
  });

  const handleShowOwnerChange = (val) => {
    setShowOwner(val);
    localStorage.setItem("solarix_show_owner", String(val));
  };

  const handleCustomTitleChange = (val) => {
    setCustomTitle(val);
    localStorage.setItem("solarix_custom_invoice_title", val);
  };
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState([EMPTY_ROW()]);
  const [notes, setNotes] = useState("Payment due within 30 days.");
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("tax_invoice");
  const deleteDocMutation = useDeleteSalesDocument("tax_invoice");

  const handleDeleteHistory = async (fileId) => {
    if (!window.confirm("Delete Document?\n\nThis action will permanently delete the document and its PDF.\n\nThis action cannot be undone.")) {
      return;
    }
    deleteDocMutation.mutate(fileId);
  };

  // — React Query: served from shared cache, no network call if already loaded —
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
        mobile: client.mobile || "",
        email: client.email || "",
        site_address: client.address || "",
      });
      if (client.state) {
        setPlaceOfSupply(client.state);
      }
    }
  }, [clientSource, selectedClientId, clients]);

  useEffect(() => {
    if (clientSource !== "existing" || !selectedClientId) {
      setItems([EMPTY_ROW()]);
      return;
    }
    const loadLedger = async () => {
      try {
        const { data } = await api.get(`/inventory/ledger/${selectedClientId}`);
        if (data && data.items && data.items.length > 0) {
          const ledgerItems = data.items.filter(row => row.current_balance > 0);
          if (ledgerItems.length > 0) {
            const hvKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"];
            const sortedLedgerItems = [...ledgerItems].sort((a, b) => {
              const aName = (a.product || "").toUpperCase();
              const bName = (b.product || "").toUpperCase();
              const aMatched = products.find(p => p.name.toUpperCase() === aName);
              const bMatched = products.find(p => p.name.toUpperCase() === bName);
              const aIsHV = (aMatched?.high_value_goods) || hvKeywords.some(kw => aName.includes(kw));
              const bIsHV = (bMatched?.high_value_goods) || hvKeywords.some(kw => bName.includes(kw));
              if (aIsHV && !bIsHV) return -1;
              if (!aIsHV && bIsHV) return 1;
              return aName.localeCompare(bName);
            });
            const mapped = sortedLedgerItems.map((row) => {
              const p = products.find((prod) => prod.name.toUpperCase() === row.product.toUpperCase());
              return {
                id: newId(),
                product_id: p ? p.id : "",
                product: row.product,
                size: row.size || (p ? p.size : ""),
                unit: row.unit || (p ? p.unit : "Nos"),
                quantity: String(row.current_balance),
                rate: p && p.rate !== undefined && p.rate !== null ? String(p.rate) : "",
                gst: "18",
                isCustomGst: false,
                serial_numbers: "",
                discount: "0"
              };
            });
            setItems(mapped);
          } else {
            setItems([EMPTY_ROW()]);
          }
        } else {
          setItems([EMPTY_ROW()]);
        }
      } catch (err) {
        toast.error("Failed to load client ledger: " + formatApiError(err));
        setItems([EMPTY_ROW()]);
      }
    };
    loadLedger();
  }, [clientSource, selectedClientId, products]);

  const isInterState = useMemo(() => {
    if (!company?.state || !placeOfSupply) return false;
    return company.state.trim().toUpperCase() !== placeOfSupply.trim().toUpperCase();
  }, [company, placeOfSupply]);

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

  const addRow = () => setItems((prev) => [...prev, EMPTY_ROW()]);
  const removeRow = (rowId) => setItems((prev) => prev.filter((row) => row.id !== rowId));

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, row) => sum + taxableValue(row), 0);
    const gstTotal = items.reduce((sum, row) => {
      const tax = gstAmounts(row, isInterState, applyGst);
      return sum + tax.cgst + tax.sgst + tax.igst;
    }, 0);
    const grandTotal = subtotal + gstTotal;
    return { subtotal, gstTotal, grandTotal };
  }, [items, isInterState, applyGst]);

  const saveInvoice = async () => {
    if (busy) return;
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    if (items.length === 0 || items.every(r => !r.product?.trim())) { toast.error("Add at least one invoice item"); return; }
    setBusy(true);
    try {
      const docData = {
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        place_of_supply: placeOfSupply,
        apply_gst: applyGst,
        prepared_by: preparedBy,
        show_owner: showOwner,
        custom_title: customTitle,
        notes,
        items: items.map((row) => {
          const tax = gstAmounts(row, isInterState, applyGst);
          return {
            product: row.product,
            size: row.size,
            unit: row.unit,
            quantity: parseNumber(row.quantity),
            rate: parseNumber(row.rate),
            discount: parseNumber(row.discount),
            gst: applyGst ? parseNumber(row.gst) : 0,
            taxable_value: taxableValue(row),
            cgst: tax.cgst,
            sgst: tax.sgst,
            igst: tax.igst,
            serial_numbers: row.serial_numbers || "",
            amount: rowAmount(row, isInterState, applyGst),
          };
        }),
      };
      const payload = { doc_type: "tax_invoice", doc_data: docData };
      const url = selectedClientId ? `/clients/${selectedClientId}/generate-document` : "/documents/generate";
      if (selectedClientId === "") delete payload.client_id;
      if (clientSource === "manual" || !selectedClientId) payload.doc_data.client = clientForm;
      const { data } = await api.post(url, payload);
      const files = data.files || [{ id: data.id, filename: data.filename, label: data.label }];
      setGeneratedFiles(files);
      toast.success("Tax Invoice generated successfully");
      fetchHistory();
      if (files[0]) window.open(fileUrl(files[0].id), "_blank");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Tax Invoice</h1>
          <p className="text-sm text-slate-500 mt-1">Create GST-compliant invoices using client and product master data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveInvoice} disabled={busy}>
            {busy ? "Generating…" : "Generate Invoice"}
          </Button>
          {generatedFiles.length > 0 && (
            <Button variant="outline" onClick={() => window.open(fileUrl(generatedFiles[0].id), "_blank")}>Open PDF</Button>
          )}
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Buyer Details</div>
            <div className="grid gap-3">
              <Select value={clientSource} onValueChange={setClientSource}>
                <SelectTrigger><SelectValue placeholder="Client source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Existing Client</SelectItem>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                </SelectContent>
              </Select>
              {clientSource === "existing" && (
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger><SelectValue placeholder="Select existing client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              <Input value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} placeholder="Buyer name" />
              <Textarea value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} rows={3} placeholder="Address" />
              <Input value={clientForm.gst_number} onChange={(e) => setClientForm({ ...clientForm, gst_number: e.target.value })} placeholder="GSTIN" />
              <Input value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} placeholder="Mobile" />
              <Input value={clientForm.email} onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })} placeholder="Email" />
              <Input value={clientForm.site_address} onChange={(e) => setClientForm({ ...clientForm, site_address: e.target.value })} placeholder="Site Address" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Invoice Settings & Details</div>
            <div className="grid gap-3">
              <div>
                <Label>Document Title</Label>
                <Input value={customTitle} onChange={(e) => handleCustomTitleChange(e.target.value)} placeholder="Document Title" data-testid="custom-title-input" />
              </div>
              <div>
                <Label>Invoice Number</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Invoice Number" />
              </div>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
              <Input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="Place of Supply (State)" />
              <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Prepared By" />
              
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="apply-gst-toggle"
                    checked={applyGst}
                    onChange={(e) => setApplyGst(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <Label htmlFor="apply-gst-toggle" className="text-sm font-medium text-slate-700 cursor-pointer">Apply GST</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-owner-toggle"
                    checked={showOwner}
                    onChange={(e) => handleShowOwnerChange(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    data-testid="show-owner-checkbox"
                  />
                  <Label htmlFor="show-owner-toggle" className="text-sm font-medium text-slate-700 cursor-pointer">Show Owner Name</Label>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Item Table</div>
            <Button variant="outline" size="sm" className="border-slate-300 text-slate-700" onClick={addRow}><Plus className="w-4 h-4 mr-2" /> Add Item</Button>
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
                  <th className="px-3 py-3 border border-slate-200">Taxable Value</th>
                  {applyGst && (
                    <>
                      <th className="px-3 py-3 border border-slate-200">CGST</th>
                      <th className="px-3 py-3 border border-slate-200">SGST</th>
                      <th className="px-3 py-3 border border-slate-200">IGST</th>
                    </>
                  )}
                  <th className="px-3 py-3 border border-slate-200">Amount</th>
                  <th className="px-3 py-3 border border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const tax = gstAmounts(row, isInterState, applyGst);
                  return (
                    <tr key={row.id} className="border-b border-slate-200">
                      <td className="px-3 py-2 border border-slate-200 min-w-[200px]">
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
                      <td className="px-3 py-2 border border-slate-200 w-24"><Input type="number" value={row.quantity} onChange={(e) => handleRowChange(row.id, "quantity", e.target.value)} /></td>
                      <td className="px-3 py-2 border border-slate-200"><Input type="number" value={row.rate} onChange={(e) => handleRowChange(row.id, "rate", e.target.value)} /></td>
                      <td className="px-3 py-2 border border-slate-200">{formatMoney(taxableValue(row))}</td>
                      {applyGst && (
                        <>
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
                          <td className="px-3 py-2 border border-slate-200 text-xs text-slate-500 tabular-nums">{formatMoney(tax.cgst)}</td>
                          <td className="px-3 py-2 border border-slate-200 text-xs text-slate-500 tabular-nums">{formatMoney(tax.sgst)}</td>
                          <td className="px-3 py-2 border border-slate-200 text-xs text-slate-500 tabular-nums">{formatMoney(tax.igst)}</td>
                        </>
                      )}
                      <td className="px-3 py-2 border border-slate-200 font-semibold tabular-nums">{formatMoney(rowAmount(row, isInterState, applyGst))}</td>
                      <td className="px-3 py-2 border border-slate-200">
                        <button type="button" onClick={() => removeRow(row.id)} className="text-rose-600 hover:text-rose-800"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_240px]">
            <div>
              <Label>Amount in Words</Label>
              <Textarea value={amountInWords(totals.grandTotal)} readOnly rows={3} />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>₹ {formatMoney(totals.subtotal)}</span></div>
              {applyGst && <div className="flex justify-between"><span>GST Total</span><span>₹ {formatMoney(totals.gstTotal)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Grand Total</span><span>₹ {formatMoney(totals.grandTotal)}</span></div>
            </div>
          </div>
          <div>
            <Label>Terms & Conditions</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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
