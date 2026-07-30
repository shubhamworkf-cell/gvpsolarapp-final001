import React, { useEffect, useMemo, useState, useRef } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useClientList, useCompany } from "@/hooks/useClients";
import { useSalesDocuments, useDeleteSalesDocument } from "@/hooks/useSalesDocuments";
import { useProductList, useOutwardList } from "@/hooks/useInventory";
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
const EMPTY_ROW = () => ({ id: newId(), product_id: "", product: "", size: "", unit: "Nos", dispatch_qty: "", rate: "", serial_numbers: "" });
const formatMoney = (value) => {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const parseNumber = (value) => {
  const num = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isNaN(num) ? 0 : num;
};

export default function DeliveryBill() {
  const [clientSource, setClientSource] = useState("existing");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientForm, setClientForm] = useState({ full_name: "", address: "", mobile: "", site_address: "", gst_number: "", project: "" });
  const [challanNumber, setChallanNumber] = useState(`DC-${dayjs().format("YYMMDD-HHmm")}`);
  const [selectedChallans, setSelectedChallans] = useState([]);
  const [challanDropdownOpen, setChallanDropdownOpen] = useState(false);
  const [challanSearch, setChallanSearch] = useState("");
  const challanContainerRef = useRef(null);
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [preparedBy, setPreparedBy] = useState("");
  const [items, setItems] = useState([EMPTY_ROW()]);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("Goods received in good condition. Subject to local jurisdiction.");
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [showRate, setShowRate] = useState(true);
  const [showAmount, setShowAmount] = useState(true);
  const [showOwner, setShowOwner] = useState(() => {
    const saved = localStorage.getItem("solarix_show_owner");
    return saved === null ? true : saved === "true";
  });

  const handleShowOwnerChange = (val) => {
    setShowOwner(val);
    localStorage.setItem("solarix_show_owner", String(val));
  };

  const { data: history = [], isLoading: loadingHistory, refetch: fetchHistory } = useSalesDocuments("delivery_bill");
  const deleteDocMutation = useDeleteSalesDocument("delivery_bill");

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
  const { data: outwardEntriesData } = useOutwardList();
  const outwardEntries = useMemo(() => outwardEntriesData || [], [outwardEntriesData]);
  const { data: companyData } = useCompany();
  const company = companyData || null;

  const clientChallans = useMemo(() => {
    let entries = outwardEntries;
    if (clientSource === "existing" && selectedClientId) {
      entries = outwardEntries.filter(e => e.client_id === selectedClientId);
    }
    const map = new Map();
    entries.forEach((entry) => {
      const ch = entry.outward_challan_no || entry.reference_number;
      if (ch && !map.has(ch)) {
        map.set(ch, {
          challan_no: ch,
          client_name: entry.client_name || "",
          client_id: entry.client_id || "",
          project_name: entry.project_name || "",
          project_id: entry.project_id || "",
          date: entry.date || entry.created_at || "",
          entries: [],
        });
      }
      if (ch) {
        map.get(ch).entries.push(entry);
      }
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [outwardEntries, clientSource, selectedClientId]);

  const filteredChallans = useMemo(() => {
    const q = (challanSearch || "").toLowerCase();
    return clientChallans.filter(c => 
      c.challan_no.toLowerCase().includes(q) || 
      c.client_name.toLowerCase().includes(q)
    );
  }, [clientChallans, challanSearch]);

  const handleToggleChallan = (challanNo) => {
    setSelectedChallans((prev) => {
      const isSelected = prev.includes(challanNo);
      const next = isSelected ? prev.filter((x) => x !== challanNo) : [...prev, challanNo];

      if (!isSelected && prev.length === 0) {
        const challanObj = clientChallans.find(c => c.challan_no === challanNo);
        if (challanObj) {
          const firstEntry = challanObj.entries[0];
          const client = clients.find(c => c.id === challanObj.client_id);

          const updatedClientForm = {
            full_name: client?.full_name || firstEntry?.client_name || "",
            address: client ? [client.address, client.city, client.state, client.pincode].filter(Boolean).join(", ") : "",
            mobile: client?.mobile || "",
            gst_number: client?.gst_number || "",
            site_address: client?.address || "",
            project: firstEntry?.project_name || client?.project_name || ""
          };
          setClientForm(updatedClientForm);

          if (challanObj.client_id && clients.some(c => c.id === challanObj.client_id)) {
            setClientSource("existing");
            setSelectedClientId(challanObj.client_id);
          } else {
            setClientSource("manual");
            setSelectedClientId("");
          }
        }
      }
      return next;
    });
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (challanContainerRef.current && !challanContainerRef.current.contains(event.target)) {
        setChallanDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        mobile: client.mobile || "",
        site_address: client.address || "",
        gst_number: client.gst_number || "",
        project: client.project_name || "",
      });
    }
  }, [clientSource, selectedClientId, clients]);

  useEffect(() => {
    if (selectedChallans.length > 0) {
      const matchingEntries = outwardEntries.filter((entry) => {
        const ch = entry.outward_challan_no || entry.reference_number;
        return ch && selectedChallans.includes(ch);
      });

      if (matchingEntries.length > 0) {
        const mergedMap = new Map();
        matchingEntries.forEach((entry) => {
          const key = `${entry.product.toUpperCase()}::${(entry.size || "").toUpperCase()}::${(entry.unit || "Nos").toUpperCase()}`;
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              product: entry.product,
              size: entry.size || "",
              unit: entry.unit || "Nos",
              quantity: 0,
              serial_numbers: [],
              rate: entry.rate,
            });
          }
          const item = mergedMap.get(key);
          item.quantity += entry.quantity || 0;
          if (entry.serial_numbers) {
            item.serial_numbers.push(...entry.serial_numbers);
          }
        });

        const mapped = Array.from(mergedMap.values()).map((row) => {
          const p = products.find((prod) => prod.name.toUpperCase() === row.product.toUpperCase());
          return {
            id: newId(),
            product_id: p ? p.id : "",
            product: row.product,
            size: row.size,
            unit: row.unit,
            dispatch_qty: String(row.quantity),
            rate: row.rate !== undefined && row.rate !== null ? String(row.rate) : (p && p.rate !== undefined && p.rate !== null ? String(p.rate) : ""),
            serial_numbers: row.serial_numbers.join(", ")
          };
        });
        setItems(mapped);
      } else {
        setItems([EMPTY_ROW()]);
      }
      return;
    }

    if (clientSource === "existing" && selectedClientId) {
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
                  dispatch_qty: String(row.current_balance),
                  rate: p && p.rate !== undefined && p.rate !== null ? String(p.rate) : "",
                  serial_numbers: ""
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
    } else {
      setItems([EMPTY_ROW()]);
    }
  }, [clientSource, selectedClientId, selectedChallans, outwardEntries, products]);

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

  const rowAmount = (row) => parseNumber(row.dispatch_qty) * parseNumber(row.rate);
  const totals = useMemo(() => ({
    total: items.reduce((sum, row) => sum + rowAmount(row), 0),
  }), [items]);

  const saveBill = async () => {
    if (busy) return;
    if (!challanNumber.trim()) { toast.error("Delivery Challan number is required"); return; }
    if (items.length === 0 || items.every((row) => !row.product?.trim())) { toast.error("Add at least one delivery row"); return; }
    setBusy(true);
    try {
      const docData = {
        challan_number: challanNumber,
        date,
        prepared_by: preparedBy,
        show_owner: showOwner,
        notes,
        terms,
        show_rate: showRate,
        show_amount: showAmount,
        client: clientSource === "manual" ? clientForm : undefined,
        items: items.map((row) => ({
          product: row.product,
          size: row.size,
          unit: row.unit,
          dispatch_qty: parseNumber(row.dispatch_qty),
          rate: parseNumber(row.rate),
          serial_numbers: row.serial_numbers || "",
          amount: rowAmount(row),
        })),
        total_amount: totals.total,
      };
      const payload = { doc_type: "delivery_bill", doc_data: docData };
      const url = selectedClientId ? `/clients/${selectedClientId}/generate-document` : "/documents/generate";
      if (selectedClientId === "") delete payload.client_id;
      if (clientSource === "manual" || !selectedClientId) payload.doc_data.client = clientForm;
      const { data } = await api.post(url, payload);
      const files = data.files || [{ id: data.id, filename: data.filename, label: data.label }];
      setGeneratedFiles(files);
      toast.success("Delivery Bill generated successfully");
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
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Delivery Bill</h1>
          <p className="text-sm text-slate-500 mt-1">Create delivery challans from client and inventory data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={saveBill} disabled={busy}>
            {busy ? "Generating…" : "Generate Bill"}
          </Button>
          {generatedFiles.length > 0 && (
            <Button variant="outline" onClick={() => window.open(fileUrl(generatedFiles[0].id), "_blank")}>Open PDF</Button>
          )}
        </div>
      </div>

      <Card className="border-slate-200">
        <CardContent className="p-5 grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Client Details</div>
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
                  <SelectContent>{clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.full_name}</SelectItem>))}</SelectContent>
                </Select>
              )}
              {/* Select Outward Challan Number (Multi-Select Popover) */}
              <div className="relative" ref={challanContainerRef}>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Select Outward Challan Number</Label>
                <div className="relative mt-1">
                  <button
                    type="button"
                    onClick={() => setChallanDropdownOpen(!challanDropdownOpen)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 text-left"
                    data-testid="select-outward-challan"
                  >
                    <span className="truncate text-slate-700">
                      {selectedChallans.length === 0
                        ? "Select Challan Numbers..."
                        : `Selected (${selectedChallans.length})`}
                    </span>
                    <span className="text-slate-500 font-normal">▼</span>
                  </button>
                  
                  {challanDropdownOpen && (
                    <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                      <div className="p-1">
                        <Input
                          placeholder="Search challan..."
                          value={challanSearch}
                          onChange={(e) => setChallanSearch(e.target.value)}
                          className="h-8 text-xs mb-1"
                        />
                      </div>
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {filteredChallans.length === 0 ? (
                          <div className="p-2 text-xs text-slate-400 italic text-center">No challans found</div>
                        ) : (
                          filteredChallans.map((c) => {
                            const isChecked = selectedChallans.includes(c.challan_no);
                            return (
                              <label
                                key={c.challan_no}
                                className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleChallan(c.challan_no)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 accent-blue-600"
                                />
                                <div className="truncate">
                                  <span className="font-semibold text-slate-900">{c.challan_no}</span>
                                  {c.client_name && <span className="text-slate-500 ml-1">({c.client_name})</span>}
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Render Selected Challan Badges */}
                {selectedChallans.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedChallans.map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"
                      >
                        {ch}
                        <button
                          type="button"
                          onClick={() => handleToggleChallan(ch)}
                          className="text-blue-500 hover:text-blue-700 font-bold ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setSelectedChallans([]); setChallanSearch(""); }}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold hover:underline ml-1"
                    >
                      Clear All
                    </button>
                  </div>
                )}
              </div>
              <Input value={clientForm.full_name} onChange={(e) => setClientForm({ ...clientForm, full_name: e.target.value })} placeholder="Client name" />
              <Textarea value={clientForm.address} onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })} rows={3} placeholder="Address" />
              <Input value={clientForm.mobile} onChange={(e) => setClientForm({ ...clientForm, mobile: e.target.value })} placeholder="Mobile" />
              <Input value={clientForm.site_address} onChange={(e) => setClientForm({ ...clientForm, site_address: e.target.value })} placeholder="Site Address" />
              <Input value={clientForm.gst_number || ""} onChange={(e) => setClientForm({ ...clientForm, gst_number: e.target.value })} placeholder="GSTIN" />
              <Input value={clientForm.project || ""} onChange={(e) => setClientForm({ ...clientForm, project: e.target.value })} placeholder="Project" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-semibold text-slate-900">Bill Details & Settings</div>
            <div className="grid gap-3">
              <Input value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} placeholder="Delivery Challan No" />
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Input value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} placeholder="Prepared By" />
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showRate}
                    onChange={(e) => setShowRate(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                  />
                  Show Rate
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showAmount}
                    onChange={(e) => setShowAmount(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                  />
                  Show Amount
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none mt-1">
                <input
                  type="checkbox"
                  checked={showOwner}
                  onChange={(e) => handleShowOwnerChange(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 accent-blue-600"
                  data-testid="show-owner-checkbox"
                />
                Show Owner Name
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-900">Item Table</div>
            <Button variant="outline" size="sm" className="border-slate-300 text-slate-700" onClick={addRow}>
              <Plus className="w-4 h-4 mr-2" /> Add Item
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-separate border-spacing-0">
              <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 border border-slate-200 w-1/3">Product</th>
                  <th className="px-3 py-3 border border-slate-200">Size</th>
                  <th className="px-3 py-3 border border-slate-200">Unit</th>
                  <th className="px-3 py-3 border border-slate-200 w-24">Dispatch Qty</th>
                  {showRate && <th className="px-3 py-3 border border-slate-200 w-24">Rate</th>}
                  {showAmount && <th className="px-3 py-3 border border-slate-200 font-semibold">Amount</th>}
                  <th className="px-3 py-3 border border-slate-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
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
                    <td className="px-3 py-2 border border-slate-200">
                      <Input value={row.size} onChange={(e) => handleRowChange(row.id, "size", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 border border-slate-200">
                      <Input value={row.unit} onChange={(e) => handleRowChange(row.id, "unit", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 border border-slate-200 w-24">
                      <Input type="number" value={row.dispatch_qty} onChange={(e) => handleRowChange(row.id, "dispatch_qty", e.target.value)} className="h-8" />
                    </td>
                    {showRate && (
                      <td className="px-3 py-2 border border-slate-200 w-24">
                        <Input type="number" value={row.rate} onChange={(e) => handleRowChange(row.id, "rate", e.target.value)} className="h-8" />
                      </td>
                    )}
                    {showAmount && (
                      <td className="px-3 py-2 border border-slate-200 font-semibold tabular-nums">{formatMoney(rowAmount(row))}</td>
                    )}
                    <td className="px-3 py-2 border border-slate-200">
                      <button type="button" onClick={() => removeRow(row.id)} className="text-rose-600 hover:text-rose-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_240px]">
            <div className="space-y-4">
              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Terms & Conditions</Label>
                <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={2} />
              </div>
            </div>
            {showAmount && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm flex flex-col justify-center">
                <div className="flex justify-between font-semibold text-base"><span>Total Amount</span><span>₹ {formatMoney(totals.total)}</span></div>
              </div>
            )}
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
