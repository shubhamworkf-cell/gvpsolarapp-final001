import React, { useState, useRef, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

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

export function ProductAutocompleteInput({ value, onChange, products, placeholder, className, testid, required }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { highValueProducts, otherProducts } = useMemo(() => {
    const hvKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "METER", "BATTERY"];
    const hv = [];
    const other = [];
    
    const sortedProducts = [...(products || [])].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    
    sortedProducts.forEach(p => {
      const nameUpper = (p.name || "").toUpperCase();
      const isHV = p.high_value_goods || hvKeywords.some(kw => nameUpper.includes(kw));
      if (isHV) {
        hv.push(p);
      } else {
        other.push(p);
      }
    });
    
    return { highValueProducts: hv, otherProducts: other };
  }, [products]);

  const filteredHighValue = useMemo(() => {
    if (!search) return highValueProducts;
    return highValueProducts.filter(p => (p.name || "").toUpperCase().includes(search.toUpperCase()));
  }, [highValueProducts, search]);

  const filteredOther = useMemo(() => {
    if (!search) return otherProducts;
    return otherProducts.filter(p => (p.name || "").toUpperCase().includes(search.toUpperCase()));
  }, [otherProducts, search]);

  const handleInputChange = (val) => {
    setSearch(val);
    onChange(val);
  };

  const handleSelect = (p) => {
    onChange(p);
    setSearch("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { setOpen(true); setSearch(value || ""); }}
        placeholder={placeholder}
        className={className}
        data-testid={testid}
        required={required}
      />
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto text-xs py-1.5 text-left">
          <div className="px-2.5 py-1 text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-slate-50">
            HIGH VALUE GOODS
          </div>
          {filteredHighValue.length === 0 ? (
            <div className="px-4 py-1.5 text-slate-400 italic">No high value goods found</div>
          ) : (
            filteredHighValue.map((p) => (
              <button
                key={p.id || p.name}
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

          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
            OTHER PRODUCTS (A-Z)
          </div>
          {filteredOther.length === 0 ? (
            <div className="px-4 py-1.5 text-slate-400 italic">No other products found</div>
          ) : (
            filteredOther.map((p) => (
              <button
                key={p.id || p.name}
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
