import React from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileCheck2, Download } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function TemplateGenerateDialog({ open, onOpenChange, clientId }) {
  const navigate = useNavigate();

  const handleDownload = async (docType, docLabel) => {
    if (!clientId) return;
    const toastId = toast.loading(`Generating ${docLabel} PDF from code...`);
    try {
      const response = await api.post(
        "/documents/download-direct",
        { client_id: clientId, doc_type: docType },
        { responseType: "blob" }
      );
      const blob = response.data;
      const contentType = blob.type || response.headers?.["content-type"] || "";
      const isDocx = contentType.includes("wordprocessingml") || contentType.includes("docx") || contentType.includes("document");
      const ext = isDocx ? ".docx" : ".pdf";

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${docType.toUpperCase()}_Document${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      const formatLabel = isDocx ? `${docLabel} (DOCX)` : `${docLabel} (PDF)`;
      toast.success(`${formatLabel} downloaded!`, { id: toastId });
      onOpenChange(false);
    } catch (e) {
      toast.error(formatApiError(e) || "Generation failed", { id: toastId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-6 space-y-4">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-blue-600" /> Code-Based Document Generator
          </DialogTitle>
          <DialogDescription className="text-xs">
            Generate and download 100% code-based PDFs directly using verified onboarding data.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          {[
            { k: "wcr", l: "WCR (3-Page Report)" },
            { k: "annexure", l: "Annexure" },
            { k: "sldr", l: "SLDR" },
            { k: "vendor_agreement", l: "Vendor Agreement" },
            { k: "net_meter_agreement", l: "Net Meter Agreement" },
            { k: "quotation", l: "Quotation" },
          ].map((d) => (
            <Button
              key={d.k}
              variant="outline"
              onClick={() => handleDownload(d.k, d.l)}
              className="justify-start text-xs font-semibold py-3 hover:bg-blue-50 border-slate-200"
            >
              <Download className="w-4 h-4 mr-2 text-blue-600 shrink-0" />
              {d.l}
            </Button>
          ))}
        </div>

        <div className="pt-2 border-t flex justify-between items-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-blue-600 hover:text-blue-700"
            onClick={() => {
              onOpenChange(false);
              navigate(`/templates?client_id=${clientId}`);
            }}
          >
            Open Full Documents Hub →
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
