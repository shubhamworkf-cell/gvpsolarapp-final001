import React from "react";
import { Badge } from "@/components/ui/badge";

const MAP = {
  "Lead": "bg-slate-100 text-slate-700 border-slate-200",
  "Survey Pending": "bg-amber-100 text-amber-700 border-amber-200",
  "Quotation Sent": "bg-blue-100 text-blue-700 border-blue-200",
  "Approved": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Installation Pending": "bg-orange-100 text-orange-700 border-orange-200",
  "Installation Complete": "bg-teal-100 text-teal-700 border-teal-200",
  "Handover Complete": "bg-green-100 text-green-700 border-green-200",
};

const StatusBadge = React.memo(function StatusBadge({ status }) {
  const cls = MAP[status] || "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`${cls} border font-medium`} data-testid={`status-badge-${status}`}>{status}</Badge>;
});

export default StatusBadge;
