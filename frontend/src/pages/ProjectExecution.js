import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useProjectList, useProjectStats, useInvalidateProjects } from "@/hooks/useProjects";
import { useEmployeeList } from "@/hooks/useTeam";
import { useMaterialRequestList, useInvalidateMaterialRequests } from "@/hooks/useMaterialRequests";
import { useProductList } from "@/hooks/useInventory";
import { usePermission } from "@/lib/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Briefcase, Clock, PackageSearch, ShieldCheck, CheckCircle2, Zap, Plus, ClipboardCheck, Camera, Eye, MapPin, ImageIcon, FileText, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import dayjs from "dayjs";
import { MaterialRequest } from "./TaskPortal";

const TASK_TYPES = [
  "Survey",
  "Installation",
  "Material Delivery",
  "Document Making",
  "Document Signed",
  "Meter Testing Request",
  "Meter Testing Completed",
  "PM Surya Ghar Upload",
  "MSEDCL Upload",
  "Verification",
  "Handover",
];

export default function ProjectExecution() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState("projects");
  const [loadedTabs, setLoadedTabs] = useState(new Set(["projects"]));
  const [projectPage, setProjectPage] = useState(1);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [taskForm, setTaskForm] = useState({ task_type: "Survey", assigned_to: "", deadline: "", priority: "Medium", remarks: "" });
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (tab) {
      setLoadedTabs((prev) => {
        if (prev.has(tab)) return prev;
        const next = new Set(prev);
        next.add(tab);
        return next;
      });
    }
  }, [tab]);

  const itemsPerPage = 25;

  // React Query queries
  const canProjectAssignment = usePermission("project_execution", "project_assignment");
  const canVerification = usePermission("project_execution", "verification");
  const canApproval = usePermission("project_execution", "approval");
  const canReject = usePermission("project_execution", "reject");
  const canRetry = usePermission("project_execution", "retry");

  const { data: stats = {}, isLoading: statsLoading } = useProjectStats();
  const { data: projects = [], isLoading: projectsLoading } = useProjectList();

  const { data: employees = [], isLoading: employeesLoading } = useEmployeeList();
  const { data: matReqs = [], isLoading: matReqsLoading } = useMaterialRequestList({}, { enabled: tab === "materials" || tab === "rejected" });

  const { data: verifs = [], isLoading: verifsLoading } = useQuery({
    queryKey: ["verifications"],
    queryFn: async () => {
      const { data } = await api.get("/verifications");
      return data || [];
    },
    enabled: tab === "verifications" || tab === "materials" || tab === "rejected" || tab === "retry",
    staleTime: 3 * 60 * 1000,
  });

  const loading = tab === "projects" && (projectsLoading || statsLoading);
  const loadingTab = (tab === "materials" && (employeesLoading || matReqsLoading)) ||
    (tab === "verifications" && verifsLoading);

  const invalidateProjects = useInvalidateProjects();
  const invalidateMatReqs = useInvalidateMaterialRequests();

  const openAssign = (c) => { setSelected(c); setTaskForm({ task_type: "Survey", assigned_to: "", deadline: "", priority: "Medium", remarks: "" }); setAssignOpen(true); };

  const submitTask = async () => {
    if (!taskForm.assigned_to) { toast.error("Pick a team member"); return; }
    if (assigning) return;
    setAssigning(true);
    try {
      await api.post("/tasks", { ...taskForm, client_id: selected.id });
      toast.success("Task assigned");
      setAssignOpen(false);
      invalidateProjects();
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setAssigning(false);
    }
  };

  const approveMaterial = async (id, payload) => {
    try {
      await api.patch(`/material-requests/${id}`, payload);
      toast.success("Updated");
      invalidateProjects();
      invalidateMatReqs();
    }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const reviewVerif = async (id, status) => {
    try {
      await api.patch(`/verifications/${id}`, { status });
      toast.success(`Verification ${status}`);
      invalidateProjects();
      queryClient.invalidateQueries({ queryKey: ["verifications"] });
    }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const cards = [
    { label: "Total Projects", v: stats.total || 0, icon: Briefcase, color: "blue" },
    { label: "Pending Installation", v: stats.pending_install || 0, icon: Clock, color: "amber" },
    { label: "Material Pending", v: stats.material_pending || 0, icon: PackageSearch, color: "orange" },
    { label: "Verification Pending", v: stats.verif_pending || 0, icon: ShieldCheck, color: "indigo" },
    { label: "Completed", v: stats.completed || 0, icon: CheckCircle2, color: "emerald" },
    { label: "KW Under Execution", v: `${(stats.kw_in_execution || 0).toFixed(1)} kW`, icon: Zap, color: "teal" },
  ];

  const totalPages = Math.ceil(projects.length / itemsPerPage);
  const paginated = useMemo(() => {
    const safePage = Math.min(projectPage, Math.max(1, totalPages || 1));
    return projects.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);
  }, [projects, projectPage, itemsPerPage, totalPages]);

  useEffect(() => {
    setProjectPage(1);
  }, [projects.length]);

  const allTabs = useMemo(() => [
    { id: "projects", label: "Project Assignment", perm: canProjectAssignment, testId: "tab-projects" },
    { id: "verifications", label: "Verification", perm: canVerification, testId: "tab-verifs" },
    { id: "materials", label: "Approval", perm: canApproval, testId: "tab-materials", badge: loadedTabs.has("materials") ? (matReqs.filter(m => m.status === "pending").length + verifs.filter(v => v.status === "pending").length) : 0 },
    { id: "rejected", label: "Rejected", perm: canReject, testId: "tab-rejected", badge: (matReqs.filter(m => m.status === "rejected").length + verifs.filter(v => v.status === "rejected").length) },
    { id: "retry", label: "Rework / Retry", perm: canRetry, testId: "tab-retry", badge: verifs.filter(v => v.status === "rework" || v.status === "retry").length },
  ], [canProjectAssignment, canVerification, canApproval, canReject, canRetry, loadedTabs, matReqs, verifs]);

  const visibleTabs = useMemo(() => allTabs.filter((t) => t.perm), [allTabs]);

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0].id);
    }
  }, [visibleTabs, tab]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-pulse">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Project Execution</h1>
            <div className="h-4 w-96 bg-slate-200 rounded mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((x) => (
            <Card key={x} className="p-4 border-slate-200">
              <div className="w-9 h-9 rounded-lg bg-slate-100 mb-2" />
              <div className="h-5 w-16 bg-slate-200 rounded mb-1" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Project Execution</h1>
          <p className="text-sm text-slate-500 mt-1">Control the complete installation workflow for onboarded clients.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="p-4 card-lift border-slate-200" data-testid={`proj-stat-${c.label.replace(/\s/g, "-").toLowerCase()}`}>
              <div className={`w-9 h-9 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center mb-2`}><Icon className="w-4 h-4" /></div>
              <div className="text-xl font-semibold tabular-nums text-slate-900">{c.v}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium mt-0.5">{c.label}</div>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white border border-slate-200">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t.id} value={t.id} data-testid={t.testId}>
              {t.label} {t.badge ? `(${t.badge})` : ""}
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleTabs.length === 0 && (
          <div className="p-8 text-center text-slate-500 bg-white rounded-lg border border-slate-200 mt-4">
            No project execution tabs permitted. Contact your administrator.
          </div>
        )}

        {canProjectAssignment && (
          <div style={{ display: tab === "projects" ? "block" : "none" }}>
            {loadedTabs.has("projects") && (
              <Card className="border-slate-200">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="projects-table">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Client</th>
                        <th className="text-left px-4 py-3 font-semibold">Mobile</th>
                        <th className="text-left px-4 py-3 font-semibold">KW</th>
                        <th className="text-left px-4 py-3 font-semibold">Current Stage</th>
                        <th className="text-left px-4 py-3 font-semibold">Assigned Team</th>
                        <th className="text-left px-4 py-3 font-semibold">Updated</th>
                        <th className="text-right px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No onboarded projects yet. Mark Onboarding complete on a client to add them here.</td></tr>}
                      {paginated.map((p) => {
                        const stages = p.stages || {};
                        const order = [
                          "Handover",
                          "Verification",
                          "MSEDCL Upload",
                          "PM Surya Ghar Upload",
                          "Meter Testing Completed",
                          "Meter Testing Request",
                          "Document Signed",
                          "Document Making",
                          "Installation",
                          "Material Delivery",
                          "Quotation",
                          "Survey",
                          "Onboarding",
                        ];
                        const current = order.find((s) => stages[s]) || "Onboarding";
                        return (
                          <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                            <td className="px-4 py-3"><Link to={`/client-data/${p.id}`} className="font-medium text-slate-900 hover:text-blue-600 hover:underline">{p.full_name}</Link><div className="text-xs text-slate-500">{p.sol_id}</div></td>
                            <td className="px-4 py-3 text-slate-700">{p.mobile}</td>
                            <td className="px-4 py-3 text-slate-700">{p.system_kw || 0}</td>
                            <td className="px-4 py-3"><Link to={`/client-data/${p.id}`}><Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 cursor-pointer">{current}</Badge></Link></td>
                            <td className="px-4 py-3 text-slate-700 text-xs">{p.assigned_team?.length ? p.assigned_team.join(", ") : "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{p.updated_at ? dayjs(p.updated_at).format("MMM D") : "—"}</td>
                            <td className="px-4 py-3 text-right">
                              {canProjectAssignment && (
                                <Button size="sm" onClick={() => openAssign(p)} className="bg-blue-600 hover:bg-blue-700" data-testid={`assign-${p.id}`}>
                                  <Plus className="w-3.5 h-3.5 mr-1" /> Assign Work
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="p-4 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-slate-500">
                      Showing {(projectPage - 1) * itemsPerPage + 1} to {Math.min(projectPage * itemsPerPage, projects.length)} of {projects.length} projects
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setProjectPage(p => Math.max(1, p - 1))} disabled={projectPage === 1}>Previous</Button>
                      <Button variant="outline" size="sm" onClick={() => setProjectPage(p => Math.min(totalPages, p + 1))} disabled={projectPage === totalPages}>Next</Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {canApproval && (
          <div style={{ display: tab === "materials" ? "block" : "none" }}>
            {loadedTabs.has("materials") && loadingTab ? (
              <Card className="border-slate-200 p-6 space-y-4 animate-pulse">
                {[1, 2, 3].map((x) => (
                  <div key={x} className="flex justify-between items-center py-4 border-b border-slate-100 last:border-none">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-32 bg-slate-200 rounded" />
                      <div className="h-3 w-64 bg-slate-100 rounded" />
                    </div>
                    <div className="h-8 w-24 bg-slate-200 rounded" />
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="border-slate-200">
                <div className="divide-y divide-slate-100">
                  {matReqs.length === 0 && <div className="p-8 text-center text-slate-500">No material requests yet.</div>}
                  {matReqs.map((m) => {
                    const totalApproved = (m.items || []).reduce((sum, it) => {
                      const requested = Number(it.quantity || 0);
                      const approved = it.approved_quantity != null ? Number(it.approved_quantity) : (m.status === "approved" ? requested : 0);
                      return sum + approved;
                    }, 0);
                    const totalPending = (m.items || []).reduce((sum, it) => {
                      const requested = Number(it.quantity || 0);
                      const approved = it.approved_quantity != null ? Number(it.approved_quantity) : (m.status === "approved" ? requested : 0);
                      const pending = m.status === "pending" ? requested : Math.max(0, requested - approved);
                      return sum + pending;
                    }, 0);

                    return (
                      <div key={m.id} className="p-5 flex items-start gap-4 flex-wrap" data-testid={`material-req-${m.id}`}>
                        <div className="flex-1 min-w-[280px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-semibold">{m.request_no || "—"}</span>
                            <div className="font-semibold text-slate-900">{m.client_name}</div>
                            <span className="text-xs text-slate-500">{m.sol_id}</span>
                            <Badge variant="outline" className={
                              m.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                m.status === "partial_approved" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                  m.status === "rejected" ? "bg-red-50 text-red-700 border-red-200" :
                                    "bg-slate-100 text-slate-700 border-slate-200"
                            } data-testid={`mr-status-${m.id}`}>{(m.status || "pending").replace("_", " ").toUpperCase()}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">Requested by {m.requested_by_name} · {dayjs(m.created_at).format("MMM D, YYYY h:mm A")}</div>

                          <div className="text-xs text-slate-600 mt-2 flex gap-4 font-medium">
                            <span>Approved Qty: <span className="text-slate-900 font-semibold">{totalApproved}</span></span>
                            <span>Pending Qty: <span className="text-slate-900 font-semibold">{totalPending}</span></span>
                          </div>

                          <div className="mt-2 overflow-x-auto -mx-1 px-1">
                            <table className="w-full text-xs min-w-[480px]">
                              <thead><tr className="text-[10px] uppercase tracking-wider text-slate-400">
                                <th className="text-left py-1 pr-2">Product</th>
                                <th className="text-right py-1 px-2">Requested</th>
                                <th className="text-right py-1 px-2">Available</th>
                                <th className="text-right py-1 px-2">Approved</th>
                                <th className="text-right py-1 pl-2">Pending</th>
                              </tr></thead>
                              <tbody>
                                {(m.items || []).map((it) => {
                                  const requested = Number(it.quantity || 0);
                                  const available = Number(it.available_stock || 0);
                                  const approved = it.approved_quantity != null ? Number(it.approved_quantity) : (m.status === "approved" ? requested : 0);
                                  const pending = m.status === "pending" ? requested : Math.max(0, requested - approved);
                                  const short = available < requested;
                                  return (
                                    <tr key={`${m.id}-${it.product}`} className="border-t border-slate-100">
                                      <td className="py-1 pr-2 text-slate-700">{it.product} {it.size && <span className="text-slate-400">({it.size})</span>}</td>
                                      <td className="py-1 px-2 text-right tabular-nums">{requested}</td>
                                      <td className={`py-1 px-2 text-right tabular-nums ${short ? "text-red-600 font-semibold" : "text-slate-700"}`}>{available}</td>
                                      <td className="py-1 px-2 text-right tabular-nums">{approved}</td>
                                      <td className="py-1 pl-2 text-right tabular-nums">{pending}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {m.delivery && <div className="text-xs text-slate-500 mt-2">Challan {m.delivery.challan_number} · {m.delivery.vehicle_number} · {m.delivery.driver_name}</div>}
                        </div>
                        {m.status === "pending" && <MaterialApprovalForm request={m} canApproval={canApproval} canReject={canReject} onSubmit={(p) => approveMaterial(m.id, p)} />}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {canVerification && (
          <div style={{ display: tab === "verifications" ? "block" : "none" }}>
            {loadedTabs.has("verifications") && loadingTab ? (
              <Card className="border-slate-200 p-6 space-y-4 animate-pulse">
                {[1, 2, 3].map((x) => (
                  <div key={x} className="flex justify-between items-center py-4 border-b border-slate-100 last:border-none">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 w-48 bg-slate-200 rounded" />
                      <div className="h-3 w-32 bg-slate-100 rounded" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-8 w-20 bg-slate-200 rounded" />
                      <div className="h-8 w-20 bg-slate-200 rounded" />
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="border-slate-200">
                <div className="divide-y divide-slate-100">
                  {verifs.length === 0 && <div className="p-8 text-center text-slate-500">No verifications submitted yet.</div>}
                  {verifs.map((v) => (
                    <div key={v.id} className="p-5 flex items-start gap-4 flex-wrap" data-testid={`verif-${v.id}`}>
                      <div className="flex-1 min-w-[280px]">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold text-slate-900">{v.client_name}</div>
                          <span className="text-xs text-slate-500">{v.sol_id}</span>
                          <Badge variant="outline" className={v.status === "approved" ? "bg-emerald-50 text-emerald-700" : v.status === "rejected" || v.status === "rework" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}>{v.status}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Submitted by {v.submitted_by_name} · {dayjs(v.created_at).format("MMM D, h:mm A")}</div>
                        <div className="text-sm text-slate-700 mt-2">{Object.keys(v.photos || {}).length} photos · {v.inverters?.length || 0} inverters</div>
                        {v.gps && <div className="text-xs text-slate-500">GPS: {v.gps}</div>}
                        {v.notes && <div className="text-sm text-slate-600 mt-1">{v.notes}</div>}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <VerificationDetailsButton verification={v} />
                        {v.status === "pending" && (
                          <>
                            {canRetry && <Button size="sm" variant="outline" onClick={() => reviewVerif(v.id, "rework")} data-testid={`verif-rework-${v.id}`}>Request Rework</Button>}
                            {canReject && <Button size="sm" variant="outline" className="text-red-600" onClick={() => reviewVerif(v.id, "rejected")} data-testid={`verif-reject-${v.id}`}>Reject</Button>}
                            {canApproval && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewVerif(v.id, "approved")} data-testid={`verif-approve-${v.id}`}>Approve</Button>}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {canReject && (
          <div style={{ display: tab === "rejected" ? "block" : "none" }}>
            <Card className="border-slate-200">
              <div className="divide-y divide-slate-100">
                {matReqs.filter(m => m.status === "rejected").length === 0 && verifs.filter(v => v.status === "rejected").length === 0 && (
                  <div className="p-8 text-center text-slate-500">No rejected items found.</div>
                )}
                {verifs.filter(v => v.status === "rejected").map((v) => (
                  <div key={`rej-v-${v.id}`} className="p-5 flex items-start gap-4 flex-wrap" data-testid={`rejected-verif-${v.id}`}>
                    <div className="flex-1 min-w-[280px]">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{v.client_name}</div>
                        <span className="text-xs text-slate-500">{v.sol_id}</span>
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">REJECTED VERIFICATION</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Submitted by {v.submitted_by_name} · {dayjs(v.created_at).format("MMM D, h:mm A")}</div>
                      {v.notes && <div className="text-sm text-slate-600 mt-1">{v.notes}</div>}
                    </div>
                    <VerificationDetailsButton verification={v} />
                  </div>
                ))}
                {matReqs.filter(m => m.status === "rejected").map((m) => (
                  <div key={`rej-m-${m.id}`} className="p-5 flex items-start gap-4 flex-wrap" data-testid={`rejected-mr-${m.id}`}>
                    <div className="flex-1 min-w-[280px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-semibold">{m.request_no || "—"}</span>
                        <div className="font-semibold text-slate-900">{m.client_name}</div>
                        <span className="text-xs text-slate-500">{m.sol_id}</span>
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">REJECTED MATERIAL REQUEST</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Requested by {m.requested_by_name} · {dayjs(m.created_at).format("MMM D, YYYY h:mm A")}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {canRetry && (
          <div style={{ display: tab === "retry" ? "block" : "none" }}>
            <Card className="border-slate-200">
              <div className="divide-y divide-slate-100">
                {verifs.filter(v => v.status === "rework" || v.status === "retry").length === 0 && (
                  <div className="p-8 text-center text-slate-500">No items flagged for rework/retry.</div>
                )}
                {verifs.filter(v => v.status === "rework" || v.status === "retry").map((v) => (
                  <div key={`retry-v-${v.id}`} className="p-5 flex items-start gap-4 flex-wrap" data-testid={`retry-verif-${v.id}`}>
                    <div className="flex-1 min-w-[280px]">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-900">{v.client_name}</div>
                        <span className="text-xs text-slate-500">{v.sol_id}</span>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">REWORK REQUESTED</Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">Submitted by {v.submitted_by_name} · {dayjs(v.created_at).format("MMM D, h:mm A")}</div>
                      {v.notes && <div className="text-sm text-slate-600 mt-1">{v.notes}</div>}
                    </div>
                    <div className="flex gap-2">
                      <VerificationDetailsButton verification={v} />
                      {canApproval && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewVerif(v.id, "approved")} data-testid={`verif-retry-approve-${v.id}`}>Approve</Button>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </Tabs>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Work — {selected?.full_name}</DialogTitle></DialogHeader>
          <div className="grid gap-4 mt-2">
            <FF label="Task Type">
              <Select value={taskForm.task_type} onValueChange={(v) => setTaskForm({ ...taskForm, task_type: v })}>
                <SelectTrigger data-testid="task-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </FF>
            <FF label="Team Member">
              <Select value={taskForm.assigned_to} onValueChange={(v) => setTaskForm({ ...taskForm, assigned_to: v })}>
                <SelectTrigger data-testid="task-assignee"><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} ({e.role})</SelectItem>)}</SelectContent>
              </Select>
            </FF>
            <div className="grid grid-cols-2 gap-3">
              <FF label="Deadline"><Input type="date" value={taskForm.deadline} onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })} /></FF>
              <FF label="Priority">
                <Select value={taskForm.priority} onValueChange={(v) => setTaskForm({ ...taskForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low", "Medium", "High", "Urgent"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </FF>
            </div>
            <FF label="Remarks"><Textarea rows={3} value={taskForm.remarks} onChange={(e) => setTaskForm({ ...taskForm, remarks: e.target.value })} /></FF>
          </div>
          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={submitTask} className="bg-blue-600 hover:bg-blue-700" data-testid="assign-submit" disabled={assigning}>
              {assigning ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FF = ({ label, children }) => (
  <div><Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1.5">{children}</div></div>
);

function MaterialApprovalForm({ request, onSubmit, canApproval = true, canReject = true }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ challan_number: "", vehicle_number: "", driver_name: "", delivery_date: "", remarks: "" });
  const [deliveryPhoto, setDeliveryPhoto] = useState({ id: "", name: "" });
  const [challanPhoto, setChallanPhoto] = useState({ id: "", name: "" });
  const [uploading, setUploading] = useState("");
  const deliveryRef = useRef(null);
  const challanRef = useRef(null);

  const { data: productsData = [] } = useProductList();

  // Editable items state initialized from request.items
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (open) {
      const initialItems = (request?.items || []).map((it) => {
        const requested = Number(it.quantity || 0);
        const approved = it.approved_quantity != null ? Number(it.approved_quantity) : requested;
        return {
          product: it.product || "",
          size: it.size || "",
          quantity: requested,
          approved_quantity: approved,
          unit: it.unit || "Nos",
          variant: it.variant || "",
          available_stock: it.available_stock || 0,
        };
      });
      if (initialItems.length === 0) {
        initialItems.push({ product: "", size: "", quantity: 1, approved_quantity: 1, unit: "Nos", variant: "", available_stock: 0 });
      }
      setItems(initialItems);
    }
  }, [open, request]);

  const updateItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      const current = { ...next[index] };
      if (field === "quantity") {
        const numVal = Math.max(0, Number(value) || 0);
        current.quantity = numVal;
        current.approved_quantity = numVal;
      } else if (field === "approved_quantity") {
        current.approved_quantity = Math.max(0, Number(value) || 0);
      } else {
        current[field] = value;
      }
      next[index] = current;
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { product: "", size: "", quantity: 1, approved_quantity: 1, unit: "Nos", variant: "", available_stock: 0 }]);
  };

  const removeItem = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveItem = (index, direction) => {
    setItems((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const upload = async (file, setter, key) => {
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "material-delivery");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setter({ id: data.id, name: data.original_filename || file.name });
      toast.success(`${key === "delivery" ? "Delivery" : "Challan"} photo uploaded`);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setUploading(""); }
  };

  const approve = () => {
    if (!d.challan_number.trim()) { toast.error("Challan number is required"); return; }
    if (items.length === 0) { toast.error("At least one material item is required"); return; }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].product.trim()) { toast.error(`Product Name is required for row ${i + 1}`); return; }
      if (Number(items[i].approved_quantity || 0) <= 0) { toast.error(`Approved quantity for ${items[i].product} must be greater than 0`); return; }
    }

    const formattedItems = items.map((it) => ({
      ...it,
      quantity: Number(it.quantity || 0),
      approved_quantity: Number(it.approved_quantity || 0),
    }));

    const isPartial = formattedItems.some((it) => Number(it.approved_quantity) < Number(it.quantity || 0));
    const status = isPartial ? "partial_approved" : "approved";
    onSubmit({
      status,
      items: formattedItems,
      challan_number: d.challan_number,
      vehicle_number: d.vehicle_number,
      driver_name: d.driver_name,
      delivery_date: d.delivery_date,
      remarks: d.remarks,
      delivery_photo_file_id: deliveryPhoto.id,
      challan_photo_file_id: challanPhoto.id,
    });
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      {canReject && <Button size="sm" variant="outline" className="text-red-600" onClick={() => onSubmit({ status: "rejected" })} data-testid={`mr-reject-${request?.id || "x"}`}>Reject</Button>}
      {canApproval && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen(true)} data-testid={`mr-approve-${request?.id || "x"}`}>Approve</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="mr-approve-dialog">
          <DialogHeader>
            <DialogTitle>Approve & Schedule Delivery</DialogTitle>
            <DialogDescription className="text-xs">Review and edit requested materials, sizes, quantities, units, and brands before final approval.</DialogDescription>
          </DialogHeader>

          {/* Editable per-item approval table */}
          <div className="mt-2 rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="text-left py-2 px-3 min-w-[180px]">Product Name *</th>
                    <th className="text-left py-2 px-2 min-w-[110px]">Size / Spec</th>
                    <th className="text-left py-2 px-2 min-w-[90px]">Unit</th>
                    <th className="text-left py-2 px-2 min-w-[100px]">Brand / Variant</th>
                    <th className="text-right py-2 px-2 w-20">Req Qty</th>
                    <th className="text-right py-2 px-2 w-24">Approve Qty</th>
                    <th className="text-center py-2 px-2 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={`edit-row-${idx}`} className="hover:bg-slate-50/50">
                      <td className="py-1.5 px-3">
                        <Input
                          value={it.product}
                          onChange={(e) => updateItem(idx, "product", e.target.value)}
                          placeholder="e.g. Solar Panel 540W"
                          className="h-8 text-xs bg-white"
                          list="product-suggestions"
                          data-testid={`mr-product-name-${idx}`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          value={it.size}
                          onChange={(e) => updateItem(idx, "size", e.target.value)}
                          placeholder="e.g. 540W"
                          className="h-8 text-xs bg-white"
                          data-testid={`mr-product-size-${idx}`}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <Select value={it.unit || "Nos"} onValueChange={(v) => updateItem(idx, "unit", v)}>
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Nos">Nos</SelectItem>
                            <SelectItem value="Meter">Meter</SelectItem>
                            <SelectItem value="Set">Set</SelectItem>
                            <SelectItem value="Kg">Kg</SelectItem>
                            <SelectItem value="Pcs">Pcs</SelectItem>
                            <SelectItem value="Box">Box</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-2">
                        <Input
                          value={it.variant}
                          onChange={(e) => updateItem(idx, "variant", e.target.value)}
                          placeholder="Brand/Variant"
                          className="h-8 text-xs bg-white"
                          data-testid={`mr-product-variant-${idx}`}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          value={it.quantity}
                          onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                          className="h-8 text-right text-xs tabular-nums bg-white"
                          data-testid={`mr-req-qty-${idx}`}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <Input
                          type="number"
                          min="0"
                          value={it.approved_quantity}
                          onChange={(e) => updateItem(idx, "approved_quantity", e.target.value)}
                          className="h-8 text-right text-xs font-semibold text-emerald-700 bg-white"
                          data-testid={`mr-approved-${idx}`}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => moveItem(idx, -1)}
                            disabled={idx === 0}
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-700"
                            onClick={() => moveItem(idx, 1)}
                            disabled={idx === items.length - 1}
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeItem(idx)}
                            disabled={items.length <= 1}
                            title="Remove Product"
                            data-testid={`mr-remove-item-${idx}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <datalist id="product-suggestions">
              {productsData.map((p) => (
                <option key={p.id} value={p.name}>{p.name} ({p.size || p.unit})</option>
              ))}
            </datalist>

            <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-dashed border-slate-300 text-blue-600 hover:bg-blue-50"
                onClick={addItem}
                data-testid="mr-add-product-btn"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Product Line
              </Button>
              <div className="text-[11px] text-slate-500 font-medium">Total Items: {items.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <FF label="Challan Number *"><Input value={d.challan_number} onChange={(e) => setD({ ...d, challan_number: e.target.value })} data-testid="mr-challan-no" /></FF>
            <FF label="Delivery Date"><Input type="date" value={d.delivery_date} onChange={(e) => setD({ ...d, delivery_date: e.target.value })} data-testid="mr-delivery-date" /></FF>
            <FF label="Vehicle Number"><Input value={d.vehicle_number} onChange={(e) => setD({ ...d, vehicle_number: e.target.value })} data-testid="mr-vehicle" /></FF>
            <FF label="Driver Name"><Input value={d.driver_name} onChange={(e) => setD({ ...d, driver_name: e.target.value })} data-testid="mr-driver" /></FF>
          </div>

          <FF label="Approval Remarks (optional)"><Textarea rows={2} value={d.remarks} onChange={(e) => setD({ ...d, remarks: e.target.value })} placeholder="e.g. Stock short by 50; balance to be dispatched on Tuesday." data-testid="mr-remarks" /></FF>

          {/* Optional photo uploads */}
          <div className="grid grid-cols-2 gap-3 mt-1">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Delivery Photo <span className="text-slate-400 font-normal">(optional)</span></Label>
              <input ref={deliveryRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0], setDeliveryPhoto, "delivery")} data-testid="mr-delivery-photo-input" />
              <div className="mt-1.5">
                {deliveryPhoto.id ? (
                  <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <a href={fileUrl(deliveryPhoto.id)} target="_blank" rel="noreferrer" className="truncate flex-1 hover:underline">{deliveryPhoto.name}</a>
                    <button type="button" onClick={() => setDeliveryPhoto({ id: "", name: "" })} className="text-emerald-700 hover:text-red-600">×</button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => deliveryRef.current?.click()} disabled={uploading === "delivery"} data-testid="mr-delivery-photo-btn">
                    <Camera className="w-3.5 h-3.5 mr-1.5" /> {uploading === "delivery" ? "Uploading…" : "Upload Delivery Photo"}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Challan Photo <span className="text-slate-400 font-normal">(optional)</span></Label>
              <input ref={challanRef} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => upload(e.target.files?.[0], setChallanPhoto, "challan")} data-testid="mr-challan-photo-input" />
              <div className="mt-1.5">
                {challanPhoto.id ? (
                  <div className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <a href={fileUrl(challanPhoto.id)} target="_blank" rel="noreferrer" className="truncate flex-1 hover:underline">{challanPhoto.name}</a>
                    <button type="button" onClick={() => setChallanPhoto({ id: "", name: "" })} className="text-emerald-700 hover:text-red-600">×</button>
                  </div>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={() => challanRef.current?.click()} disabled={uploading === "challan"} data-testid="mr-challan-photo-btn">
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> {uploading === "challan" ? "Uploading…" : "Upload Challan Photo"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={approve} data-testid="mr-approve-submit">
              <ClipboardCheck className="w-4 h-4 mr-1" /> Approve &amp; Auto-Outward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VerificationDetailsButton({ verification }) {
  const [open, setOpen] = useState(false);
  const photos = verification.photos || {};
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid={`verif-view-${verification.id}`}>
        <Eye className="w-3.5 h-3.5 mr-1.5" /> View Details
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="verif-details-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>Verification Details — {verification.client_name}</DialogTitle>
            <DialogDescription className="text-xs">Submitted by {verification.submitted_by_name} · {dayjs(verification.created_at).format("MMM D, YYYY h:mm A")}</DialogDescription>
          </DialogHeader>

          {verification.gps && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 mt-2 flex items-center gap-2 text-xs text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>GPS:</span>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(verification.gps)}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{verification.gps}</a>
            </div>
          )}

          {verification.notes && (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 mt-2 text-sm text-slate-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Verification Notes</div>
              {verification.notes}
            </div>
          )}

          {!!(verification.inverters || []).length && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Inverters</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {verification.inverters.map((inv, i) => (
                  <div key={`${inv.serial}-${i}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <div className="text-slate-700">SN: <span className="font-mono">{inv.serial || "—"}</span></div>
                    {inv.monitoring_id && <div className="text-slate-500">Monitoring: {inv.monitoring_id}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Photos ({Object.keys(photos).length})</div>
            {Object.keys(photos).length === 0 ? (
              <div className="text-xs text-slate-400 italic">No photos attached.</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(photos).map(([label, val]) => {
                  const fid = typeof val === "string" ? val : val?.file_id;
                  if (!fid) return null;
                  return (
                    <a key={label} href={fileUrl(fid)} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 overflow-hidden bg-white hover:border-blue-300 hover:shadow-sm transition">
                      <div className="aspect-square bg-slate-100 flex items-center justify-center">
                        <img src={fileUrl(fid)} alt={label} loading="lazy" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                      </div>
                      <div className="px-2 py-1.5 text-[10px] font-medium text-slate-700 truncate flex items-center gap-1">
                        <ImageIcon className="w-3 h-3 text-slate-400" /> {label}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
