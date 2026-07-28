import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { getCachedProducts, fetchProductsDeduplicated, getCachedSearchProducts, fetchSearchProducts } from "@/lib/productCache";

export const UNIT_OPTIONS = ["Nos", "Pair", "Mtr", "Set", "Box", "Pcs", "Kg", "Ltr", "Roll"];
export const CATEGORY_OPTIONS = ["Solar Panel", "Inverter", "Battery", "BoS", "Cable", "Structure", "MC4 / Connector", "Earthing", "Net Meter", "Tools", "Other"];
export const REF_TYPES = ["Challan Number", "Invoice Number", "Book Number", "GRN Number", "Transport Number"];
export const OUTWARD_REF_TYPES = ["Challan Number", "Book Number", "Other"];
export const SRC_TYPES = ["Supplier", "Vendor", "Return From Client", "Manual Entry"];

// Strip all non-digit characters — used for Challan/Bill/Ref number inputs (Sprint 8)
export const digitsOnly = (v) => String(v ?? "").replace(/\D+/g, "");

export function Field({ label, value, onChange, type = "text", placeholder, full, testid, required, ...rest }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5"
        data-testid={testid}
        {...rest}
      />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, testid, allowEmpty = false, full, placeholder }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Select value={value || (allowEmpty ? "__none__" : "")} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
        <SelectTrigger className="mt-1.5" data-testid={testid}>
          <SelectValue placeholder={placeholder || "Select…"} />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {allowEmpty && <SelectItem value="__none__" className="italic text-slate-500">— None —</SelectItem>}
          {options.map((o) => typeof o === "string"
            ? <SelectItem key={o} value={o}>{o}</SelectItem>
            : <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function TextareaField({ label, value, onChange, rows = 2, testid, full }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} rows={rows} className="mt-1.5" data-testid={testid} />
    </div>
  );
}

export function ConfirmDialog({ open, onOpenChange, title = "Are you sure?", description, confirmLabel = "Delete", onConfirm, danger = true, disabled }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" data-testid="confirm-dialog">
        <DialogHeader>
          <div className={`w-10 h-10 rounded-full ${danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"} flex items-center justify-center mb-2`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="confirm-cancel" disabled={disabled}>Cancel</Button>
          <Button className={danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"} onClick={onConfirm} data-testid="confirm-yes" disabled={disabled}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const today = () => new Date().toISOString().slice(0, 10);

export function applyDefaults(target, defaults, alwaysKeep = []) {
  const out = { ...target };
  Object.keys(defaults || {}).forEach((k) => {
    if (alwaysKeep.includes(k) || !out[k]) out[k] = defaults[k];
  });
  return out;
}

export function ProductAutocompleteInput({ value, onChange, products, placeholder, className, testid, required, inputRef }) {
  const [open, setOpen] = useState(false);
  // `inputVal` is the raw typed text — updates synchronously so input feels instant
  const [inputVal, setInputVal] = useState("");
  // `debouncedSearch` drives the filter computation — updated 150ms after typing stops
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  // ── Product list source ──────────────────────────────────────────────────
  // Priority: passed `products` prop → slim search cache → full cache
  // On first open, trigger background fetch of slim search list if not cached.
  const [slimProducts, setSlimProducts] = useState(() => {
    if (products && products.length > 0) return products;
    return getCachedSearchProducts() || getCachedProducts() || [];
  });

  useEffect(() => {
    // Keep slimProducts in sync if caller passes a `products` prop
    if (products && products.length > 0) {
      setSlimProducts(products);
      return;
    }
    // Otherwise load from slim search cache (fast endpoint)
    const cached = getCachedSearchProducts();
    if (cached && cached.length > 0) {
      setSlimProducts(cached);
    } else {
      // Background fetch — does NOT block rendering
      fetchSearchProducts().then(list => {
        if (list && list.length > 0) setSlimProducts(list);
      }).catch(() => {
        // Fallback to full cache
        const full = getCachedProducts();
        if (full && full.length > 0) setSlimProducts(full);
      });
    }
  }, [products]);

  // ── Click-outside close ──────────────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Pre-index: builds searchKey once when slimProducts changes ───────────
  const { highValueProducts, otherProducts } = useMemo(() => {
    const hvKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"];
    const hv = [];
    const other = [];

    for (const p of slimProducts) {
      const nameUpper = (p.name || "").toUpperCase();
      const rawSize = (p.size || "").toUpperCase();
      const cleanSize = rawSize.replace(/\s*[xX×*]\s*/g, "*");
      const _searchKey = `${nameUpper} ${cleanSize} ${rawSize}`;
      const item = { ...p, _searchKey };

      const isHV = p.high_value_goods || hvKeywords.some(kw => nameUpper.includes(kw));
      if (isHV) hv.push(item);
      else other.push(item);
    }
    return { highValueProducts: hv, otherProducts: other };
  }, [slimProducts]);

  // ── Debounced search: typing updates inputVal instantly, filter runs 150ms later ──
  const handleInputChange = useCallback((val) => {
    setInputVal(val);
    onChange(val);  // notify parent immediately (value display)
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 150);
  }, [onChange]);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // ── Fast token-based filter ──────────────────────────────────────────────
  const filterList = useCallback((list, query) => {
    if (!query) return list;
    const cleanSearch = query.toUpperCase().replace(/\s*[xX×*]\s*/g, "*");
    const tokens = cleanSearch.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return list;
    return list.filter(p => tokens.every(token => p._searchKey.includes(token)));
  }, []);

  const filteredHighValue = useMemo(
    () => filterList(highValueProducts, debouncedSearch),
    [highValueProducts, debouncedSearch, filterList]
  );
  const filteredOther = useMemo(
    () => filterList(otherProducts, debouncedSearch),
    [otherProducts, debouncedSearch, filterList]
  );

  // DOM slicing: max 50 HV + 100 other to prevent browser freeze
  const displayedHighValue = useMemo(() => filteredHighValue.slice(0, 50), [filteredHighValue]);
  const displayedOther = useMemo(() => filteredOther.slice(0, 100), [filteredOther]);

  const handleSelect = useCallback((p) => {
    onChange(p);
    setInputVal("");
    setDebouncedSearch("");
    setOpen(false);
  }, [onChange]);

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => {
          setOpen(true);
          const v = value || "";
          setInputVal(v);
          // Start filter immediately on focus without waiting for debounce
          setDebouncedSearch(v);
        }}
        placeholder={placeholder}
        className={className}
        data-testid={testid}
        required={required}
        ref={inputRef}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto text-xs py-1.5 text-left">
          <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-slate-50 flex items-center justify-between">
            <span>HIGH VALUE GOODS</span>
            {filteredHighValue.length > 50 && <span className="text-[9px] text-slate-400 font-normal">Showing 50 of {filteredHighValue.length}</span>}
          </div>
          {displayedHighValue.length === 0 ? (
            <div className="px-4 py-1.5 text-slate-400 italic">No high value goods found</div>
          ) : (
            displayedHighValue.map((p) => (
              <button
                key={p.id || `${p.name}-${p.size}`}
                type="button"
                className="w-full text-left px-4 py-1.5 hover:bg-slate-100 font-semibold text-slate-800 transition-colors"
                onClick={() => handleSelect(p)}
              >
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  {p.size && <span className="text-[10px] text-slate-400 font-normal mt-0.5">{p.size}</span>}
                </div>
              </button>
            ))
          )}

          <div className="border-t border-slate-100 my-1"></div>

          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 flex items-center justify-between">
            <span>OTHER PRODUCTS (A-Z)</span>
            {filteredOther.length > 100 && <span className="text-[9px] text-slate-400 font-normal">Showing 100 of {filteredOther.length}</span>}
          </div>
          {displayedOther.length === 0 ? (
            <div className="px-4 py-1.5 text-slate-400 italic">No other products found</div>
          ) : (
            displayedOther.map((p) => (
              <button
                key={p.id || `${p.name}-${p.size}`}
                type="button"
                className="w-full text-left px-4 py-1.5 hover:bg-slate-100 text-slate-700 transition-colors"
                onClick={() => handleSelect(p)}
              >
                <div className="flex flex-col">
                  <span>{p.name}</span>
                  {p.size && <span className="text-[10px] text-slate-400 font-normal mt-0.5">{p.size}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
