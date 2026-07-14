import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Sparkles, Pencil, Trash2, Tag, ArrowLeft, Save, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";

const DOC_TYPES = ["Annexure", "WCR", "SLDR", "Net Metering Agreement", "Vendor Agreement", "Quotation", "Other"];

const docTypeColor = (t) => {
  const map = {
    "Annexure": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "WCR": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "SLDR": "bg-amber-50 text-amber-700 border-amber-200",
    "Vendor Agreement": "bg-rose-50 text-rose-700 border-rose-200",
    "Net Metering Agreement": "bg-sky-50 text-sky-700 border-sky-200",
    "Quotation": "bg-violet-50 text-violet-700 border-violet-200",
  };
  return map[t] || "bg-slate-50 text-slate-700 border-slate-200";
};

export default function DocumentTemplates() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null); // template object being edited
  const fileRef = useRef(null);
  const [uploadForm, setUploadForm] = useState({ name: "", doc_type: "Annexure" });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);

  const { data: templates = [] } = useQuery({
    queryKey: queryKeys.templates.list(),
    queryFn: async () => {
      const { data } = await api.get("/document-templates");
      return data || [];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const { data: variablesData } = useQuery({
    queryKey: ["template-variables"],
    queryFn: async () => {
      const { data } = await api.get("/document-templates/variables");
      return data?.variables || [];
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const variables = variablesData || [];

  const invalidateTemplates = () => queryClient.invalidateQueries({ queryKey: queryKeys.templates.list() });

  const pickFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".docx")) { toast.error("Only .docx files are supported"); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    const base = f.name.replace(/\.docx$/i, "");
    setPendingFile(f);
    setUploadForm({ name: base, doc_type: guessType(base) });
    setUploadOpen(true);
  };

  const guessType = (n) => {
    const s = n.toLowerCase();
    if (s.includes("annex")) return "Annexure";
    if (s.includes("wcr")) return "WCR";
    if (s.includes("sldr") || s.includes("sld")) return "SLDR";
    if (s.includes("net meter") || s.includes("net-meter")) return "Net Metering Agreement";
    if (s.includes("vendor") || s.includes("agreement")) return "Vendor Agreement";
    if (s.includes("quot")) return "Quotation";
    return "Other";
  };

  const doUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      fd.append("name", uploadForm.name);
      fd.append("doc_type", uploadForm.doc_type);
      const { data } = await api.post("/document-templates", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Uploaded — ${data.placeholders.length} placeholders detected`);
      setUploadOpen(false);
      setPendingFile(null);
      invalidateTemplates();
      setEditing(data); // open mapping editor immediately
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const removeTemplate = async (id) => {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try { await api.delete(`/document-templates/${id}`); toast.success("Deleted"); invalidateTemplates(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  if (editing) {
    return <MappingEditor template={editing} variables={variables} onBack={() => { setEditing(null); invalidateTemplates(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Document Templates</h1>
          <p className="text-sm text-slate-500 mt-1">Upload your standard <code className="text-xs px-1.5 py-0.5 bg-slate-100 rounded">.docx</code> templates — GVP SOLAR ENERGY APP auto-detects <code className="text-xs px-1.5 py-0.5 bg-slate-100 rounded">{"{{placeholders}}"}</code> and maps them to client/project fields for one-click generation.</p>
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".docx" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} data-testid="template-file-input" />
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => fileRef.current?.click()} data-testid="upload-template-btn">
            <Upload className="w-4 h-4 mr-1.5" /> Upload Template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-4">
              <FileText className="w-7 h-7" />
            </div>
            <div className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>No templates yet</div>
            <div className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Upload your Annexure, WCR, SLDR, Vendor Agreement etc. as <code className="text-xs px-1 bg-slate-100 rounded">.docx</code> — anywhere you have a blank field, write <code className="text-xs px-1 bg-slate-100 rounded">{"{{ field name }}"}</code> (e.g. <code className="text-xs px-1 bg-slate-100 rounded">{"{{ client full name }}"}</code>) and GVP SOLAR ENERGY APP will fill it from the client record.
            </div>
            <Button className="mt-5 bg-blue-600 hover:bg-blue-700" onClick={() => fileRef.current?.click()}>
              <Upload className="w-4 h-4 mr-1.5" /> Upload your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="templates-grid">
          {templates.map((t) => {
            const mapped = Object.values(t.mapping || {}).filter(Boolean).length;
            const total = (t.placeholders || []).length;
            const pct = total ? Math.round((mapped / total) * 100) : 0;
            return (
              <Card key={t.id} className="border-slate-200 card-lift" data-testid={`template-card-${t.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate" style={{ fontFamily: "Outfit" }}>{t.name}</div>
                      <div className="text-xs text-slate-500 truncate">{t.filename}</div>
                    </div>
                    <Badge variant="outline" className={docTypeColor(t.doc_type)}>{t.doc_type}</Badge>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between text-slate-600">
                      <span><Tag className="w-3 h-3 inline mr-1" />{total} placeholders</span>
                      <span className={pct === 100 ? "text-emerald-700 font-semibold" : pct > 50 ? "text-amber-700 font-semibold" : "text-red-700 font-semibold"}>
                        {mapped}/{total} mapped
                      </span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded overflow-hidden">
                      <div className={`h-full transition-all ${pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[11px] text-slate-400">Uploaded {dayjs(t.created_at).format("MMM D, YYYY")} · by {t.created_by_name}</div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(t)} data-testid={`edit-template-${t.id}`}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit Mapping
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-red-600" onClick={() => removeTemplate(t.id)} data-testid={`delete-template-${t.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Name your template</DialogTitle>
            <DialogDescription className="text-xs">Give it a clear label your team will recognise. We&apos;ll auto-detect placeholders next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Template Name</Label>
              <Input className="mt-1.5" value={uploadForm.name} onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })} data-testid="upload-name" />
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Type</Label>
              <Select value={uploadForm.doc_type} onValueChange={(v) => setUploadForm({ ...uploadForm, doc_type: v })}>
                <SelectTrigger className="mt-1.5" data-testid="upload-type"><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="text-xs text-slate-500 px-3 py-2 bg-slate-50 rounded-lg">
              <FileText className="w-3.5 h-3.5 inline mr-1.5" /> {pendingFile?.name} · {(pendingFile?.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={doUpload} disabled={uploading || !uploadForm.name.trim()} data-testid="confirm-upload">
              {uploading ? "Uploading…" : <><Sparkles className="w-4 h-4 mr-1.5" /> Upload & Extract</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------- Mapping editor -----------------
function MappingEditor({ template, variables, onBack }) {
  const [t, setT] = useState(template);
  const [saving, setSaving] = useState(false);

  const updateMapping = (ph, varKey) => {
    setT({ ...t, mapping: { ...(t.mapping || {}), [ph]: varKey } });
  };
  const renameTemplate = (name) => setT({ ...t, name });
  const changeType = (doc_type) => setT({ ...t, doc_type });

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/document-templates/${t.id}`, { name: t.name, doc_type: t.doc_type, mapping: t.mapping });
      setT(data);
      toast.success("Mapping saved");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const mappedCount = Object.values(t.mapping || {}).filter(Boolean).length;
  const total = (t.placeholders || []).length;

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="w-4 h-4" /> Back to Templates</button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <Input
              value={t.name}
              onChange={(e) => renameTemplate(e.target.value)}
              className="text-2xl font-semibold border-none px-0 h-auto py-1 focus-visible:ring-0 max-w-md"
              style={{ fontFamily: "Outfit" }}
              data-testid="editor-name-input"
            />
            <Select value={t.doc_type} onValueChange={changeType}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{DOC_TYPES.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="text-xs text-slate-500">
            {t.filename} · {total} placeholders · <span className={mappedCount === total ? "text-emerald-700 font-semibold" : "text-amber-700 font-semibold"}>{mappedCount}/{total} mapped</span>
          </div>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="save-mapping-btn">
          <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save Mapping"}
        </Button>
      </div>

      <Card className="border-slate-200">
        <div className="p-4 border-b border-slate-200 flex items-center gap-2 text-xs text-slate-600">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          Each placeholder found in your template needs to be linked to a system field. We pre-filled the obvious ones — review and tweak as needed.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="mapping-table">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-2.5 text-left font-semibold w-1/3">Placeholder in template</th>
                <th className="px-4 py-2.5 text-left font-semibold">Maps to</th>
                <th className="px-4 py-2.5 text-center font-semibold w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {(t.placeholders || []).map((ph) => {
                const cur = (t.mapping || {})[ph] || "";
                return (
                  <tr key={ph} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 align-middle">
                      <code className="text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded font-mono">{`{{ ${ph} }}`}</code>
                    </td>
                    <td className="px-4 py-2.5 align-middle">
                      <Select value={cur || "__none__"} onValueChange={(v) => updateMapping(ph, v === "__none__" ? "" : v)}>
                        <SelectTrigger className="h-9 text-sm max-w-md" data-testid={`mapping-select-${ph.replace(/\s+/g, "_")}`}>
                          <SelectValue placeholder="— Select a system field —" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px]">
                          <SelectItem value="__none__" className="italic text-slate-500">— Leave blank (manual at generation) —</SelectItem>
                          {variables.map((v) => (
                            <SelectItem key={v.key} value={v.key}>
                              <div className="flex items-center gap-2">
                                <span>{v.label}</span>
                                <span className="text-[10px] text-slate-400 uppercase">· {v.source}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {cur ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200"><CheckCircle2 className="w-3 h-3 mr-1" />Mapped</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="w-3 h-3 mr-1" />Manual</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
