import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import dayjs from "dayjs";
import {
  ArrowLeft, Megaphone, Send, Paperclip, X, Loader2, ImageIcon, FileText,
  CheckCircle2, UserPlus, Wrench, ListChecks, AlertTriangle, History,
} from "lucide-react";

const COMPLAINT_STATUSES = ["Open", "Assigned", "In Progress", "Waiting", "Resolved", "Closed"];
const STATUS_STYLES = {
  Open: "bg-slate-100 text-slate-700 border-slate-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Waiting: "bg-amber-50 text-amber-700 border-amber-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-slate-100 text-slate-500 border-slate-200",
};
const PRIORITY_BAR = {
  Low: "bg-slate-400", Medium: "bg-blue-500", High: "bg-orange-500", Urgent: "bg-red-500",
};
const ESC_BADGE = {
  yellow: { cls: "bg-amber-100 text-amber-800 border-amber-300", label: "Aging > 24h" },
  red: { cls: "bg-red-100 text-red-800 border-red-300", label: "Overdue > 48h" },
};

export default function ComplaintDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || user?.role === "Supervisor";

  const [complaint, setComplaint] = useState(null);
  const [comments, setComments] = useState([]);
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState([]);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [converting, setConverting] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [c, cm, au] = await Promise.all([
        api.get(`/complaints/${id}`),
        api.get(`/complaints/${id}/comments`),
        api.get(`/complaints/${id}/audit`),
      ]);
      setComplaint(c.data); setComments(cm.data || []); setAudit(au.data || []);
    } catch (e) { toast.error(formatApiError(e)); nav("/complaints"); }
  }, [id, nav]);
  useEffect(() => { reload(); api.get("/complaints/lookup/assignable-users").then((r) => setUsers(r.data || [])).catch(() => {}); }, [id, reload]);

  if (!complaint) return <div className="text-slate-500 text-sm">Loading…</div>;

  const esc = complaint.escalation && complaint.escalation !== "none" ? ESC_BADGE[complaint.escalation] : null;
  const canAssign = isAdmin;
  const canConvertToTask = isAdmin && complaint.client_id && complaint.assigned_to && !complaint.converted_task_id;

  const setStatus = async (next) => {
    if (next === "Resolved") { setResolveOpen(true); return; }
    try {
      const { data } = await api.patch(`/complaints/${id}`, { status: next });
      setComplaint(data); reload();
      toast.success(`Status: ${next}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const convertToTask = async () => {
    if (converting) return;
    setConverting(true);
    try {
      const { data } = await api.post(`/complaints/${id}/convert-to-task`);
      toast.success(`Task created · ${data.task.task_type}`);
      reload();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => nav("/complaints")} className="text-slate-600">
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      {/* Header card */}
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-1.5 h-16 rounded-full ${PRIORITY_BAR[complaint.priority] || "bg-slate-300"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="font-mono text-xs text-slate-500">#{complaint.complaint_no}</span>
                <Badge variant="outline" className={`${STATUS_STYLES[complaint.status] || ""} text-[10px]`} data-testid="cmp-status-badge">{complaint.status}</Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px]">{complaint.category}</Badge>
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px]">{complaint.priority}</Badge>
                {esc && <Badge variant="outline" className={`${esc.cls} text-[10px]`}>{esc.label}</Badge>}
                {complaint.converted_task_id && <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">Converted to Task</Badge>}
              </div>
              <h1 className="text-xl font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>{complaint.title}</h1>
              <div className="text-xs text-slate-500 mt-1">
                Raised by <span className="font-medium text-slate-700">{complaint.raised_by_name}</span>
                {complaint.client_name && <> · for <span className="font-medium text-slate-700">{complaint.client_name}</span></>}
                <> · {dayjs(complaint.created_at).format("MMM D, YYYY h:mm A")}</>
              </div>
            </div>
          </div>

          {/* Quick action row */}
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
            <Select value={complaint.status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-44 text-sm" data-testid="cmp-status-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPLAINT_STATUSES.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {canAssign && (
              <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)} data-testid="cmp-reassign-btn">
                <UserPlus className="w-4 h-4 mr-1.5" /> {complaint.assigned_to_name ? "Re-assign" : "Assign"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" onClick={() => setResolveOpen(true)} data-testid="cmp-resolve-btn" disabled={complaint.status === "Closed"}>
              <CheckCircle2 className="w-4 h-4 mr-1.5" /> Mark Resolved
            </Button>
            {canConvertToTask && (
              <Button variant="outline" size="sm" className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100" onClick={convertToTask} disabled={converting} data-testid="cmp-convert-task-btn">
                <Wrench className="w-4 h-4 mr-1.5" /> {converting ? "Converting..." : "Convert to Task"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Description + attachments */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Description</div>
              <div className="text-sm text-slate-800 whitespace-pre-wrap">{complaint.description || <span className="italic text-slate-400">No description provided.</span>}</div>
              {!!(complaint.attachments || []).length && (
                <div className="mt-4 space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Attachments</div>
                  {complaint.attachments.map((a, i) => (
                    <AttachmentRow key={i} a={a} />
                  ))}
                </div>
              )}
              {complaint.status === "Resolved" && complaint.resolution_note && (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-1.5 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolution Note
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap">{complaint.resolution_note}</div>
                  {!!(complaint.resolution_attachments || []).length && (
                    <div className="mt-2 space-y-1.5">{complaint.resolution_attachments.map((a, i) => <AttachmentRow key={i} a={a} />)}</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs: Comments + Audit */}
          <Card className="border-slate-200">
            <Tabs defaultValue="comments">
              <div className="px-5 pt-4">
                <TabsList className="bg-slate-100">
                  <TabsTrigger value="comments" data-testid="tab-comments"><ListChecks className="w-3.5 h-3.5 mr-1.5" /> Discussion ({comments.length})</TabsTrigger>
                  <TabsTrigger value="audit" data-testid="tab-audit"><History className="w-3.5 h-3.5 mr-1.5" /> Audit Log ({audit.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="comments" className="p-5">
                <CommentThread complaintId={id} comments={comments} onAdded={reload} />
              </TabsContent>
              <TabsContent value="audit" className="p-0">
                <div className="divide-y divide-slate-100" data-testid="audit-log">
                  {audit.length === 0 && <div className="p-6 text-center text-sm text-slate-400">No activity yet.</div>}
                  {audit.map((a) => (
                    <div key={a.id} className="p-3 flex items-start gap-3 text-xs" data-testid={`audit-row-${a.id}`}>
                      <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] font-semibold">
                        {(a.user_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-slate-800">{a.user_name} <span className="font-normal text-slate-500">· {a.action}</span></div>
                        {a.details && <div className="text-slate-600 mt-0.5">{a.details}</div>}
                        <div className="text-slate-400 mt-0.5">{dayjs(a.created_at).format("MMM D, YYYY h:mm A")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>

        {/* Right rail — metadata */}
        <div className="space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-5 space-y-3 text-sm">
              <Meta label="Status" value={<Badge variant="outline" className={`${STATUS_STYLES[complaint.status] || ""} text-[10px]`}>{complaint.status}</Badge>} />
              <Meta label="Priority" value={complaint.priority} />
              <Meta label="Category" value={complaint.category} />
              <Meta label="Send To Target" value={complaint.send_to_target} />
              <Meta label="Assigned To" value={complaint.assigned_to_name || <span className="italic text-slate-400">Unassigned</span>} />
              <Meta label="Raised By" value={complaint.raised_by_name} />
              <Meta label="Client" value={complaint.client_name ? <Link to={`/client-data/${complaint.client_id}`} className="text-blue-600 hover:underline">{complaint.client_name}</Link> : "—"} />
              <Meta label="Project" value={complaint.project_id || "—"} />
              <Meta label="Created" value={dayjs(complaint.created_at).format("MMM D, YYYY h:mm A")} />
              {complaint.resolved_at && <Meta label="Resolved" value={dayjs(complaint.resolved_at).format("MMM D, YYYY h:mm A")} />}
              {complaint.converted_task_id && (
                <Meta label="Linked Task" value={<Link to="/tasks" className="text-blue-600 hover:underline">Open Task Portal</Link>} />
              )}
            </CardContent>
          </Card>

          {esc && (
            <Card className="border-amber-200 bg-amber-50/60">
              <CardContent className="p-3 flex items-center gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <div>
                  <div className="font-semibold text-amber-900">{esc.label}</div>
                  <div className="text-amber-800 mt-0.5">This complaint has been open for a long time. Take action or escalate.</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ResolveDialog open={resolveOpen} onClose={() => setResolveOpen(false)} complaintId={id} onResolved={(c) => { setResolveOpen(false); setComplaint(c); reload(); }} />
      <AssignDialog open={assignOpen} onClose={() => setAssignOpen(false)} complaintId={id} users={users} current={complaint.assigned_to} onAssigned={(c) => { setAssignOpen(false); setComplaint(c); reload(); }} />
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xs text-slate-800 text-right max-w-[60%] truncate">{value}</div>
    </div>
  );
}

function AttachmentRow({ a }) {
  const isImg = (a.filename || "").match(/\.(png|jpe?g|webp|gif)$/i);
  return (
    <a href={fileUrl(a.file_id)} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-50 text-xs">
      {isImg ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-slate-500" />}
      <span className="flex-1 truncate text-slate-700">{a.filename || "attachment"}</span>
    </a>
  );
}

function CommentThread({ complaintId, comments, onAdded }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "complaint-comment");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachments((a) => [...a, { file_id: data.id, filename: data.original_filename || file.name }]);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const send = async () => {
    if (!text.trim()) { toast.error("Type a comment"); return; }
    setBusy(true);
    try {
      await api.post(`/complaints/${complaintId}/comments`, { text, attachments });
      setText(""); setAttachments([]); onAdded?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="comment-thread">
      <div className="space-y-3">
        {comments.length === 0 && <div className="text-sm text-slate-400 text-center py-4">No comments yet. Start the discussion below.</div>}
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-3" data-testid={`comment-${c.id}`}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
              {(c.user_name || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-medium text-slate-900">{c.user_name}</span>
                {c.user_role && <Badge variant="outline" className="text-[10px] bg-slate-50">{c.user_role}</Badge>}
                <span className="text-[11px] text-slate-400">{dayjs(c.created_at).fromNow()}</span>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">{c.text}</div>
              {!!(c.attachments || []).length && (
                <div className="mt-2 space-y-1.5">
                  {c.attachments.map((a, i) => <AttachmentRow key={i} a={a} />)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-slate-100">
        <Textarea rows={2} placeholder="Add a comment…" value={text} onChange={(e) => setText(e.target.value)} className="text-sm" data-testid="comment-input" />
        <div className="mt-2 space-y-1.5">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span className="flex-1 truncate">{a.filename}</span>
              <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="comment-attach">
            {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />} Attach
          </Button>
          <div className="flex-1" />
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={send} disabled={busy} data-testid="comment-send">
            <Send className="w-3.5 h-3.5 mr-1.5" /> {busy ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ResolveDialog({ open, onClose, complaintId, onResolved }) {
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { if (!open) { setNote(""); setAttachments([]); } }, [open]);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "complaint-resolution");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAttachments((a) => [...a, { file_id: data.id, filename: data.original_filename || file.name }]);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const submit = async () => {
    if (!note.trim()) { toast.error("Resolution note is required"); return; }
    setBusy(true);
    try {
      const { data } = await api.patch(`/complaints/${complaintId}`, { status: "Resolved", resolution_note: note, resolution_attachments: attachments });
      toast.success("Complaint resolved");
      onResolved?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="resolve-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>Mark as Resolved</DialogTitle>
          <DialogDescription className="text-xs">A short note explaining how the issue was resolved is mandatory. Photo/file optional.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resolution Note <span className="text-red-500">*</span></Label>
            <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replaced inverter MPPT board; system is generating normally." className="mt-1.5" data-testid="resolve-note" />
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachments (optional)</Label>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])} accept="image/*,.pdf" />
            <div className="mt-1.5 space-y-1.5">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-xs">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span className="flex-1 truncate">{a.filename}</span>
                  <button onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="resolve-attach">
                {uploading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5 mr-1.5" />} Add file
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submit} disabled={busy} data-testid="resolve-submit">
            <CheckCircle2 className="w-4 h-4 mr-1.5" /> {busy ? "Resolving…" : "Mark Resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({ open, onClose, complaintId, users, current, onAssigned }) {
  const [pick, setPick] = useState(current || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPick(current || ""); }, [open, current]);

  const submit = async () => {
    if (!pick) { toast.error("Pick a team member"); return; }
    setBusy(true);
    try {
      const { data } = await api.patch(`/complaints/${complaintId}`, { assigned_to: pick });
      toast.success(`Assigned to ${data.assigned_to_name}`);
      onAssigned?.(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="assign-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>{current ? "Re-assign Complaint" : "Assign Complaint"}</DialogTitle>
          <DialogDescription className="text-xs">Pick the specific team member who should own this complaint.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Team Member</Label>
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger className="mt-1.5" data-testid="assign-select"><SelectValue placeholder="Pick person…" /></SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · <span className="text-slate-500">{u.role}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy} data-testid="assign-submit">
            <UserPlus className="w-4 h-4 mr-1.5" /> {busy ? "Saving…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
