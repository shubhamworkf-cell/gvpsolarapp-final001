import React, { useEffect, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ShieldCheck } from "lucide-react";

import { useEmployeeList, useInvalidateTeam } from "@/hooks/useTeam";

const ROLES = ["Installer", "Supervisor", "Sales Executive", "Inventory Manager", "Documentation Executive", "Service", "Admin"];
const PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "clients", label: "Clients" },
  { key: "documents", label: "Documents" },
  { key: "project_execution", label: "Project Execution" },
  { key: "task_portal", label: "Task Portal" },
  { key: "data_management", label: "Data Management" },
  { key: "client_data", label: "Client Data" },
  { key: "reports", label: "Reports" },
  { key: "sales_documents", label: "Sales Documents" },
  { key: "settings", label: "Settings" },
  { key: "team", label: "Team & Access" },
];
const PERMS = ["view", "create", "edit", "delete", "approve"];

const emptyPerms = () => PAGES.reduce((acc, p) => ({ ...acc, [p.key]: PERMS.reduce((a, k) => ({ ...a, [k]: false }), {}) }), {});

export default function Team() {
  const { data: list = [], isLoading } = useEmployeeList();
  const invalidateTeam = useInvalidateTeam();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", password: "", role: "Installer", status: "Active", permissions: emptyPerms() });
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: "", mobile: "", email: "", password: "", role: "Installer", status: "Active", permissions: defaultPermsForRole("Installer") });
    setOpen(true);
  };

  const openEdit = (e) => {
    setEditingId(e.id);
    setForm({ name: e.name, mobile: e.mobile, email: e.email, password: "", role: e.role, status: e.status, permissions: e.permissions || emptyPerms() });
    setOpen(true);
  };

  const togglePerm = (page, perm) => {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [page]: { ...f.permissions[page], [perm]: !f.permissions[page]?.[perm] } } }));
  };

  const onRoleChange = (role) => setForm((f) => ({ ...f, role, permissions: defaultPermsForRole(role) }));

  const submit = async () => {
    setSaving(true);
    try {
      if (editingId) {
        const payload = { ...form };
        if (!payload.password) delete payload.password;
        await api.put(`/employees/${editingId}`, payload);
        toast.success("Employee updated");
      } else {
        if (!form.password) { toast.error("Password is required"); setSaving(false); return; }
        await api.post("/employees", form);
        toast.success("Employee added");
      }
      setOpen(false);
      invalidateTeam();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this employee?")) return;
    try {
      await api.delete(`/employees/${id}`);
      toast.success("Employee removed");
      invalidateTeam();
    }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Team & Access Control</h1>
          <p className="text-sm text-slate-500 mt-1">Add employees and configure page-level permissions.</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700" data-testid="add-employee-btn"><Plus className="w-4 h-4 mr-1.5" /> Add Employee</Button>
      </div>

      <Card className="border-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">Employee</th>
                <th className="text-left px-4 py-3 font-semibold">Employee ID</th>
                <th className="text-left px-4 py-3 font-semibold">Email</th>
                <th className="text-left px-4 py-3 font-semibold">Mobile</th>
                <th className="text-left px-4 py-3 font-semibold">Role</th>
                <th className="text-left px-4 py-3 font-semibold">Status</th>
                <th className="text-right px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No employees yet. Click "Add Employee" to get started.</td></tr>}
              {list.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{e.name}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 font-mono text-xs">{e.employee_id}</td>
                  <td className="px-4 py-3 text-slate-700">{e.email}</td>
                  <td className="px-4 py-3 text-slate-700">{e.mobile}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{e.role}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className={e.status === "Active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}>{e.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          <div className="grid md:grid-cols-2 gap-4 mt-2">
            <F label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="emp-name" /></F>
            <F label="Mobile *"><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} data-testid="emp-mobile" /></F>
            <F label="Email *"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="emp-email" /></F>
            <F label={editingId ? "Password (leave empty to keep)" : "Password *"}><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="emp-password" /></F>
            <F label="Role">
              <Select value={form.role} onValueChange={onRoleChange}>
                <SelectTrigger data-testid="emp-role"><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Status">
              <div className="flex items-center gap-3 h-10">
                <Switch checked={form.status === "Active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "Active" : "Inactive" })} />
                <span className="text-sm">{form.status}</span>
              </div>
            </F>
          </div>

          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <div className="font-semibold text-slate-900">Page Access Permissions</div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden" data-testid="role-permissions-matrix">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Page</th>
                    {PERMS.map((p) => <th key={p} className="px-4 py-2 font-semibold capitalize text-center">{p}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PAGES.map((p) => (
                    <tr key={p.key} className="border-t border-slate-100">
                      <td className="px-4 py-2 text-slate-700 font-medium">{p.label}</td>
                      {PERMS.map((perm) => (
                        <td key={perm} className="px-4 py-2 text-center">
                          <Checkbox checked={!!form.permissions?.[p.key]?.[perm]} onCheckedChange={() => togglePerm(p.key, perm)} data-testid={`perm-${p.key}-${perm}`} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving} className="bg-blue-600 hover:bg-blue-700" data-testid="save-employee-btn">{saving ? "Saving…" : "Save Employee"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const F = ({ label, children }) => (
  <div>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <div className="mt-1.5">{children}</div>
  </div>
);

function defaultPermsForRole(role) {
  const base = emptyPerms();
  if (role === "Admin") return PAGES.reduce((a, p) => ({ ...a, [p.key]: PERMS.reduce((ax, k) => ({ ...ax, [k]: true }), {}) }), {});
  const grant = (page, perms) => { base[page] = PERMS.reduce((a, k) => ({ ...a, [k]: perms.includes(k) }), {}); };
  if (role === "Installer") { grant("task_portal", ["view", "edit"]); grant("clients", ["view"]); }
  if (role === "Supervisor") ["dashboard", "clients", "task_portal", "project_execution"].forEach((p) => grant(p, ["view", "create", "edit", "approve"]));
  if (role === "Sales Executive") ["dashboard", "clients"].forEach((p) => grant(p, ["view", "create", "edit"]));
  if (role === "Inventory Manager") ["data_management", "reports"].forEach((p) => grant(p, ["view", "create", "edit"]));
  if (role === "Documentation Executive") ["documents", "clients"].forEach((p) => grant(p, ["view", "create", "edit"]));
  if (role === "Service") { /* base empty perms */ }
  return base;
}
