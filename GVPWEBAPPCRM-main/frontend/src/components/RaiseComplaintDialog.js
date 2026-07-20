import React, { useEffect, useRef, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Paperclip, X, Loader2, Image as ImageIcon, FileText } from "lucide-react";

export const COMPLAINT_CATEGORIES = [
  "Installation Issue", "Material Issue", "Customer Complaint", "Document Issue",
  "Inverter Issue", "Service Issue", "Payment Issue", "Team Issue", "Other",
];
export const COMPLAINT_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
export const SEND_TO_TARGETS = [
  "Admin", "Installer Team", "Document Team", "Supervisor", "Inventory Team", "Specific User",
];

/**
 * RaiseComplaintDialog — used from Complaint Center "+ New Complaint" and from
 * Client Data Detail's "Raise Complaint" button (lockedClient locks the client field).
 */
export default function RaiseComplaintDialog({ open, onOpenChange, onCreated, lockedClient = null }) {
  const [form, setForm] = useState(() => emptyForm(lockedClient));
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(lockedClient));
    setAttachments([]);
    Promise.all([
      lockedClient ? Promise.resolve({ data: [lockedClient] }) : api.get("/clients").catch(() => ({ data: [] })),
      api.get("/complaints/lookup/assignable-users").catch(() => ({ data: [] })),
    ]).then(([c, u]) => {
      setClients(c.data || []);
      setUsers(u.data || []);
    });
  }, [open, lockedClient]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "complaint");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachments((a) => [...a, { file_id: data.id, filename: data.original_filename || file.name, content_type: data.content_type || file.type || "" }]);
      toast.success("Attachment added");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (form.send_to_target === "Specific User" && !form.assigned_to) {
      toast.error("Pick the specific team member you want to assign this to"); return;
    }
    setBusy(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        priority: form.priority,
        description: form.description,
        client_id: form.client_id || "",
        project_id: form.project_id || "",
        send_to_target: form.send_to_target,
        assigned_to: form.send_to_target === "Specific User" ? form.assigned_to : "",
        attachments,
      };
      const { data } = await api.post("/complaints", payload);
      toast.success(`Complaint #${data.complaint_no} raised`);
      onCreated?.(data);
      onOpenChange(false);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="raise-complaint-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white flex items-center justify-center shadow-sm">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle style={{ fontFamily: "Outfit" }}>Raise a Complaint</DialogTitle>
              <DialogDescription className="text-xs">
                Issues, delays, material/installation/document problems — log them here. Admin reviews and assigns the right person.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-3">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Complaint Title <span className="text-red-500">*</span></Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Short summary of the issue" className="mt-1.5" data-testid="cmp-title" />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger className="mt-1.5" data-testid="cmp-category"><SelectValue /></SelectTrigger>
                <SelectContent>{COMPLAINT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger className="mt-1.5" data-testid="cmp-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{COMPLAINT_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Client (optional)</Label>
              {lockedClient ? (
                <Input
                  value={lockedClient.full_name || ""}
                  readOnly
                  disabled
                  className="mt-1.5 bg-slate-50 text-slate-700 cursor-not-allowed"
                  data-testid="cmp-client"
                />
              ) : (
                <Select value={form.client_id || "__none__"} onValueChange={(v) => set("client_id", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1.5" data-testid="cmp-client"><SelectValue placeholder="No client" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="__none__" className="italic text-slate-500">— No client —</SelectItem>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Project / Label (optional)</Label>
              <Input value={form.project_id} onChange={(e) => set("project_id", e.target.value)} placeholder="Project tag e.g. site-12" className="mt-1.5" data-testid="cmp-project" />
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Description</Label>
            <Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Describe the problem in detail — what happened, where, when, what you need." className="mt-1.5" data-testid="cmp-description" />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Send To <span className="text-red-500">*</span></div>
            <Select value={form.send_to_target} onValueChange={(v) => set("send_to_target", v)}>
              <SelectTrigger className="bg-white" data-testid="cmp-send-to"><SelectValue /></SelectTrigger>
              <SelectContent>{SEND_TO_TARGETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
            {form.send_to_target === "Specific User" ? (
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pick Team Member</Label>
                <Select value={form.assigned_to || "__none__"} onValueChange={(v) => set("assigned_to", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1.5 bg-white" data-testid="cmp-assignee"><SelectValue placeholder="Choose person" /></SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="__none__" className="italic text-slate-500">— None —</SelectItem>
                    {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · <span className="text-slate-500">{u.role}</span></SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="text-[11px] text-amber-800">
                Admin will review and assign a specific person from this team. You and the admin team will be notified instantly.
              </div>
            )}
          </div>

          {/* Attachments */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachments</Label>
            <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.xls,.xlsx,.csv,.doc,.docx" onChange={(e) => upload(e.target.files?.[0])} data-testid="cmp-attach-input" />
            <div className="mt-1.5 space-y-2">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 text-xs" data-testid={`cmp-attach-row-${i}`}>
                  {(a.filename || "").match(/\.(png|jpe?g|webp|gif)$/i) ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-slate-500" />}
                  <a href={fileUrl(a.file_id)} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">{a.filename}</a>
                  <button type="button" onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" type="button" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="cmp-attach-btn">
                {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />}
                {uploading ? "Uploading…" : "Add photo / file"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={submit} disabled={busy} data-testid="cmp-submit">
            <Megaphone className="w-4 h-4 mr-1.5" /> {busy ? "Raising…" : "Raise Complaint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function emptyForm(lockedClient) {
  return {
    title: "", category: "Installation Issue", priority: "Medium", description: "",
    client_id: lockedClient?.id || "", project_id: "",
    send_to_target: "Admin", assigned_to: "",
  };
}
