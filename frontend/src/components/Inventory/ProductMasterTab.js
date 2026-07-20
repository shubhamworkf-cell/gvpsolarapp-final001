import React, { useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Boxes } from "lucide-react";
import { toast } from "sonner";
import { Field, SelectField, ConfirmDialog, UNIT_OPTIONS, CATEGORY_OPTIONS } from "./_shared";
import ProductDrawer from "./ProductDrawer";

const STATUS_STYLES = {
  "Normal": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Low Stock": "bg-amber-50 text-amber-700 border-amber-200",
  "Out Of Stock": "bg-red-50 text-red-700 border-red-200",
};

const EMPTY = () => ({ name: "", size: "", category: "Solar Panel", unit: "Nos", min_stock: 0, rate: "", status: "Active", high_value_goods: false });

export default function ProductMasterTab({ products, onChanged, globalSearch }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY());
  const [editing, setEditing] = useState(null);
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const startAdd = () => { setEditing(null); setForm(EMPTY()); setOpen(true); };
  const startEdit = (p) => { setDrawerProduct(p); };

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Product name required"); return; }
    setBusy(true);
    try {
      const payload = { ...form, min_stock: Number(form.min_stock) || 0, rate: Number(form.rate) || 0 };
      if (editing) {
        await api.patch(`/inventory/products/${editing.id}`, payload);
        toast.success("Product updated");
      } else {
        await api.post("/inventory/products", payload);
        toast.success("Product added");
      }
      setOpen(false);
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDel) return;
    try {
      await api.delete(`/inventory/products/${confirmDel.id}`);
      toast.success("Product deleted");
      setConfirmDel(null);
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); setConfirmDel(null); }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filtered = useMemo(() => {
    if (!globalSearch) return products;
    const s = globalSearch.toLowerCase();
    return products.filter((p) =>
      p.name.toLowerCase().includes(s) ||
      (p.size || "").toLowerCase().includes(s) ||
      (p.category || "").toLowerCase().includes(s)
    );
  }, [products, globalSearch]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginated = useMemo(() => {
    return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filtered, currentPage, itemsPerPage]);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
            <div>
              <div className="text-base font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Product Master</div>
              <div className="text-xs text-slate-500">{filtered.length} of {products.length} products</div>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={startAdd} data-testid="add-product-btn">
              <Plus className="w-4 h-4 mr-1.5" /> Add Product
            </Button>
          </div>
          <div className="overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm" data-testid="products-table">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Size</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Category</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Unit</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Min Stock</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Rate</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Current Stock</th>
                  <th className="px-4 py-2.5 text-center font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-16 text-center">
                    <Boxes className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <div className="text-sm font-semibold text-slate-700">No products yet</div>
                    <div className="text-xs text-slate-500 mt-1">Add your first product or create an inward entry — products auto-register.</div>
                  </td></tr>
                ) : paginated.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/60" data-testid={`product-row-${p.id}`}>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {p.name}
                        {p.high_value_goods && (
                          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 text-[9px] uppercase px-1 py-0 scale-90">HV</Badge>
                        )}
                      </div>
                      {p.size && <div className="text-[10px] text-slate-400 mt-0.5">{p.size}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700">{p.size || "—"}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[10px]">{p.category || "Solar"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-center text-slate-600">{p.unit || "Nos"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-600">{p.min_stock || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-slate-600">₹ {p.rate || 0}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{p.balance}</td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[p.stock_status] || ""} text-[10px]`}>{p.stock_status}</Badge>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)} data-testid={`edit-product-${p.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => setConfirmDel(p)} data-testid={`del-product-${p.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2 bg-white">
              <div className="text-xs text-slate-500">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filtered.length)} of {filtered.length} products
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>{editing ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Product Name" value={form.name} onChange={(v) => setForm({ ...form, name: v.toUpperCase() })} placeholder="e.g. WAAREE PANEL 540W" testid="pm-name" full required />
            <Field label="Size / Spec" value={form.size} onChange={(v) => setForm({ ...form, size: v })} placeholder="e.g. 540W Mono PERC" testid="pm-size" full />
            <SelectField label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORY_OPTIONS} testid="pm-category" />
            <SelectField label="Unit" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} options={UNIT_OPTIONS} testid="pm-unit" />
            <Field label="Min Stock (alert level)" type="number" value={form.min_stock} onChange={(v) => setForm({ ...form, min_stock: v })} testid="pm-min" />
            <Field label="Rate / Unit Price" type="number" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} testid="pm-rate" />
            <SelectField label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["Active", "Inactive"]} testid="pm-status" />
            <div className="col-span-2 flex items-center gap-2 py-1">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.high_value_goods || false}
                  onChange={(e) => setForm({ ...form, high_value_goods: e.target.checked })}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                />
                High Value Goods (Requires serial tracking)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={busy} data-testid="save-product-btn">{busy ? "Saving…" : editing ? "Update" : "Add Product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={(v) => !v && setConfirmDel(null)}
        title="Delete product?"
        description={confirmDel ? `Remove "${confirmDel.name}" from the master. If any inward/outward entries reference it, the delete will be blocked.` : ""}
        onConfirm={doDelete}
      />

      <ProductDrawer
        product={drawerProduct}
        open={!!drawerProduct}
        onClose={() => setDrawerProduct(null)}
        onChanged={() => { onChanged?.(); }}
      />
    </div>
  );
}
