import React, { useEffect, useState } from "react";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, Download, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function TemplateGenerateDialog({ open, onOpenChange, clientId, onGenerated }) {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [rawOverrides, setRawOverrides] = useState({}); // placeholder string → value
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null); // { id, filename, label }

  useEffect(() => {
    if (!open) return;
    setSelectedId("");
    setPreview(null);
    setGenerated(null);
    setRawOverrides({});
    (async () => {
      try {
        const { data } = await api.get("/document-templates");
        setTemplates(data || []);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, [open]);

  const loadPreview = async (tplId, overridesArg) => {
    if (!tplId || !clientId) return;
    setLoading(true);
    try {
      const { data } = await api.post(`/document-templates/${tplId}/preview`, {
        client_id: clientId,
        raw_overrides: overridesArg ?? rawOverrides,
      });
      setPreview(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };

  const selectTemplate = (id) => {
    setSelectedId(id);
    setRawOverrides({});
    setGenerated(null);
    loadPreview(id, {});
  };

  const updateOverride = (placeholder, value) => {
    const next = { ...rawOverrides, [placeholder]: value };
    setRawOverrides(next);
    // refresh preview after small debounce
    clearTimeout(window.__solarix_preview_t);
    window.__solarix_preview_t = setTimeout(() => loadPreview(selectedId, next), 350);
  };

  const generate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    try {
      const response = await api.post(`/document-templates/${selectedId}/generate`, {
        client_id: clientId,
        raw_overrides: rawOverrides,
        save_to_client: true,
      }, {
        responseType: "blob",
      });

      const selectedTpl = templates.find((t) => t.id === selectedId);
      const label = selectedTpl?.name || selectedTpl?.doc_type || "Template";
      const filename = `${selectedTpl?.name || "document"}.docx`;
      const blob = new Blob([response.data], { type: response.headers["content-type"] || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const url = window.URL.createObjectURL(blob);

      // Trigger automatic browser download
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();

      setGenerated({ url, filename, label });
      toast.success(`${label} generated and downloaded`);
      onGenerated?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setGenerating(false); }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const missingCount = preview ? preview.missing_count : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 overflow-hidden" data-testid="generate-template-dialog">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center"><Wand2 className="w-5 h-5" /></div>
            <div className="flex-1">
              <DialogTitle style={{ fontFamily: "Outfit" }}>Generate Document</DialogTitle>
              <DialogDescription className="text-xs">Pick a template, review auto-filled fields, fill any blanks, then generate.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Step 1: pick template */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Template</Label>
            {templates.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No templates yet.{" "}
                <a href="/templates" className="text-blue-600 underline">Upload one →</a>
              </div>
            ) : (
              <div className="mt-2 grid md:grid-cols-2 gap-2" data-testid="template-picker">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t.id)}
                    className={`text-left rounded-lg border p-3 transition ${selectedId === t.id ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-100" : "border-slate-200 hover:border-blue-300 bg-white"}`}
                    data-testid={`pick-template-${t.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <div className="font-semibold text-slate-900 truncate text-sm">{t.name}</div>
                      <Badge variant="outline" className="text-[10px]">{t.doc_type}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 truncate">{t.filename} · {(t.placeholders || []).length} fields</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 2: preview + overrides */}
          {selectedId && (
            loading ? (
              <div className="py-10 flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Resolving fields…</div>
            ) : preview && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-semibold text-slate-900">
                    Field preview
                    <span className="ml-2 text-xs font-normal text-slate-500">{preview.rows.length} fields · </span>
                    {missingCount === 0 ? (
                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[11px]"><CheckCircle2 className="w-3 h-3 mr-1" />All filled</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[11px]"><AlertTriangle className="w-3 h-3 mr-1" />{missingCount} blank</Badge>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="max-h-[40vh] overflow-y-auto">
                    <table className="w-full text-sm" data-testid="preview-table">
                      <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold w-1/3">Field</th>
                          <th className="px-4 py-2 text-left font-semibold">Value</th>
                          <th className="px-4 py-2 text-left font-semibold w-40">Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((r) => {
                          const overrideVal = rawOverrides[r.placeholder];
                          const finalVal = overrideVal !== undefined && overrideVal !== "" ? overrideVal : r.value;
                          const isMissing = !finalVal;
                          return (
                            <tr key={r.placeholder} className={`border-t border-slate-100 ${isMissing ? "bg-amber-50/30" : ""}`} data-testid={`preview-row-${r.placeholder.replace(/\s+/g, "_")}`}>
                              <td className="px-4 py-2 align-middle">
                                <code className="text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono">{`{{ ${r.placeholder} }}`}</code>
                              </td>
                              <td className="px-2 py-2 align-middle">
                                <Input
                                  value={overrideVal !== undefined ? overrideVal : r.value}
                                  onChange={(e) => updateOverride(r.placeholder, e.target.value)}
                                  placeholder={isMissing ? "Enter value…" : ""}
                                  className={`h-8 text-sm ${isMissing ? "border-amber-300 bg-white" : ""}`}
                                  data-testid={`override-input-${r.placeholder.replace(/\s+/g, "_")}`}
                                />
                              </td>
                              <td className="px-4 py-2 align-middle text-xs">
                                <span className={r.variable ? "text-slate-600" : "text-amber-700"}>{r.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          )}

          {generated && (
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900">{generated.label} generated</div>
                <div className="text-xs text-slate-500 truncate">{generated.filename} · downloaded</div>
              </div>
              <a href={generated.url} download={generated.filename}>
                <Button className="bg-emerald-600 hover:bg-emerald-700" data-testid="download-generated-btn">
                  <Download className="w-4 h-4 mr-1.5" /> Download .docx
                </Button>
              </a>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-slate-50/50">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            disabled={!selectedId || generating}
            onClick={generate}
            data-testid="generate-doc-btn"
          >
            {generating ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-1.5" /> Generate {selectedTemplate ? selectedTemplate.name : "Document"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
