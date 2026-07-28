import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useTaskList, useInvalidateTasks } from "@/hooks/useTasks";
import { useMaterialRequestList, useInvalidateMaterialRequests } from "@/hooks/useMaterialRequests";
import { useComplaintList, useInvalidateComplaints } from "@/hooks/useComplaints";
import { useClientDetail } from "@/hooks/useClients";
import { useProjectList } from "@/hooks/useProjects";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ClipboardList, CalendarClock, CheckCircle2, PackagePlus, MapPin, Phone, Camera, Plus,
  Upload, Trash2, Users2, Activity, AlertTriangle, TrendingUp, Megaphone, ChevronRight,
  FileText, Eye, Navigation, Send, BarChart2, Clock
} from "lucide-react";
import dayjs from "dayjs";
import { ProductAutocompleteInput } from "@/components/Inventory/_shared";
import { useDebounce } from "@/hooks/useDebounce";

const VERIF_PHOTOS = ["Site Photo", "Client With Solar", "Panel Photo", "Inverter Photo", "ACDB Photo", "DCDB Photo", "Net Meter Photo", "Serial Number Photo"];
const SURVEY_PHOTOS = ["Client Photo", "Roof Photo", "Panel Layout", "Meter Location", "Site Access"];
const SURVEY_CHECKLIST = [
  "Site access is safe",
  "Roof layout has been verified",
  "Panel locations are noted",
  "Meter / grid connection identified",
  "Client requirements confirmed",
];
const STATUS_OPTIONS = ["all", "pending", "in_progress", "completed"];

// ─── Task Type → Workflow mapping ────────────────────────────────────────────
const TASK_TYPE_WORKFLOWS = {
  "Survey": "survey",
  "Installation": "installation",
  "Material Delivery": "material_dispatch",
  "Document Making": "document_making",
  "Document Signed": "document_signed",
  "PM Surya Ghar Upload": "document_making",
  "MSEDCL Upload": "document_making",
  "Meter Testing Request": "meter_testing",
  "Meter Testing Completed": "meter_testing",
  "Material Dispatch": "material_dispatch",
  "Site Visit": "site_visit",
  "Verification": "verification",
  "Handover": "handover",
  "Complaint": "complaint",
};

function getWorkflow(taskType) {
  return TASK_TYPE_WORKFLOWS[taskType] || "installation";
}

export default function TaskPortal() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || user?.role === "Supervisor";

  const [scope, setScope] = useState("mine");
  const [selected, setSelected] = useState(null);
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [taskPortalTab, setTaskPortalTab] = useState("tasks");
  const [visitedTaskPortalTabs, setVisitedTaskPortalTabs] = useState(new Set(["tasks"]));

  const [mrOpen, setMrOpen] = useState(false);
  const [mrSearch, setMrSearch] = useState("");
  const debouncedMrSearch = useDebounce(mrSearch, 300);
  const [mrSelectedProject, setMrSelectedProject] = useState(null);

  useEffect(() => {
    setVisitedTaskPortalTabs((prev) => {
      if (prev.has(taskPortalTab)) return prev;
      const next = new Set(prev);
      next.add(taskPortalTab);
      return next;
    });
  }, [taskPortalTab]);

  // Track whether a mutation happened inside the detail view so we only
  // invalidate queries when something actually changed (not on every close).
  const didMutate = useRef(false);

  const taskFilters = scope === "mine" || !isAdmin ? { mine: true } : {};

  // Use Infinity staleTime from hook defaults — do NOT override with 30s here
  const { data: tasks = [], isLoading: tasksLoading } = useTaskList(taskFilters);
  const { data: matReqs = [], isLoading: matReqsLoading } = useMaterialRequestList({});
  const { data: complaints = [], isLoading: complaintsLoading } = useComplaintList({ mine: true });
  const { data: projects = [] } = useProjectList();

  const loading = tasksLoading || matReqsLoading || complaintsLoading;

  const invalidateTasks = useInvalidateTasks();
  const invalidateMatReqs = useInvalidateMaterialRequests();
  const invalidateComplaints = useInvalidateComplaints();

  // Only invalidate if something actually mutated during the detail view
  const handleCloseDetail = useCallback(() => {
    setSelected(null);
    if (didMutate.current) {
      invalidateTasks();
      invalidateMatReqs();
      invalidateComplaints();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      didMutate.current = false;
    }
  }, [invalidateTasks, invalidateMatReqs, invalidateComplaints, queryClient]);

  // Call this inside any mutation handler to flag that cache needs refresh
  const markMutated = useCallback(() => { didMutate.current = true; }, []);

  const today = dayjs().format("YYYY-MM-DD");

  const personalCards = [
    { label: "Pending Tasks", v: tasks.filter(t => t.status === "pending").length, icon: ClipboardList, color: "amber" },
    { label: "Today's Tasks", v: tasks.filter(t => t.deadline === today).length, icon: CalendarClock, color: "blue" },
    { label: "Completed Sites", v: tasks.filter(t => t.status === "completed").length, icon: CheckCircle2, color: "emerald" },
    { label: "Material Requests", v: matReqs.length, icon: PackagePlus, color: "indigo" },
  ];

  const team = useMemo(() => {
    const byEmp = new Map();
    tasks.forEach((t) => {
      const key = t.assigned_to || "unassigned";
      const name = t.assigned_to_name || "—";
      if (!byEmp.has(key)) byEmp.set(key, { id: key, name, total: 0, pending: 0, in_progress: 0, completed: 0, overdue: 0 });
      const row = byEmp.get(key);
      row.total += 1;
      if (t.status === "pending") row.pending += 1;
      else if (t.status === "in_progress") row.in_progress += 1;
      else if (t.status === "completed") row.completed += 1;
      if (t.status !== "completed" && t.deadline && t.deadline < today) row.overdue += 1;
    });
    return Array.from(byEmp.values())
      .map((r) => ({ ...r, progress: r.total ? Math.round((r.completed / r.total) * 100) : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [tasks, today]);

  const employees = useMemo(() => {
    const seen = new Map();
    tasks.forEach((t) => { if (t.assigned_to && t.assigned_to_name && !seen.has(t.assigned_to)) seen.set(t.assigned_to, t.assigned_to_name); });
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const teamCards = useMemo(() => {
    const completed = tasks.filter(t => t.status === "completed").length;
    const overdue = tasks.filter(t => t.status !== "completed" && t.deadline && t.deadline < today).length;
    return [
      { label: "Total Tasks", v: tasks.length, icon: ClipboardList, color: "blue" },
      { label: "Pending", v: tasks.filter(t => t.status === "pending").length, icon: AlertTriangle, color: "amber" },
      { label: "In Progress", v: tasks.filter(t => t.status === "in_progress").length, icon: Activity, color: "indigo" },
      { label: "Completed", v: completed, icon: CheckCircle2, color: "emerald" },
      { label: "Overdue", v: overdue, icon: CalendarClock, color: "red" },
      { label: "Completion %", v: tasks.length ? `${Math.round((completed / tasks.length) * 100)}%` : "0%", icon: TrendingUp, color: "violet" },
    ];
  }, [tasks, today]);

  const filteredTeamTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterEmployee !== "all" && t.assigned_to !== filterEmployee) return false;
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      return true;
    });
  }, [tasks, filterEmployee, filterStatus]);
  if (loading) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap animate-pulse">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Task Portal</h1>
            <div className="h-4 w-48 bg-slate-200 rounded mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4 animate-pulse">
          {[1, 2, 3, 4].map((x) => (
            <Card key={x} className="p-4 lg:p-5 border-slate-200">
              <div className="w-9 lg:w-10 h-9 lg:h-10 rounded-lg bg-slate-100 mb-2 lg:mb-3" />
              <div className="h-6 w-16 bg-slate-200 rounded mb-1" />
              <div className="h-3 w-24 bg-slate-100 rounded" />
            </Card>
          ))}
        </div>

        <Card className="border-slate-200 animate-pulse">
          <div className="p-4 border-b border-slate-200 h-12 bg-slate-50" />
          <div className="p-4 space-y-4">
            {[1, 2, 3].map(x => (
              <div key={x} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-none">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-48 bg-slate-200 rounded" />
                  <div className="h-3 w-32 bg-slate-100 rounded" />
                </div>
                <div className="h-6 w-16 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>Task Portal</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin ? "Personal tasks and team-wide visibility." : "Your assigned work, in order."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={() => setMrOpen(true)} className="bg-blue-600 hover:bg-blue-700 w-fit" data-testid="new-material-request-btn">
            <Plus className="w-4 h-4 mr-1" /> New Material Request
          </Button>
          {isAdmin && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm" data-testid="scope-toggle">
              <button
                onClick={() => setScope("mine")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "mine" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                data-testid="scope-mine"
              >
                <ClipboardList className="w-3.5 h-3.5 inline mr-1.5" /> My Tasks
              </button>
              <button
                onClick={() => setScope("team")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${scope === "team" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                data-testid="scope-team"
              >
                <Users2 className="w-3.5 h-3.5 inline mr-1.5" /> All Team Tasks
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stat cards */}
      {scope === "team" && isAdmin ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="team-stats-grid">
          {teamCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="p-4 border-slate-200">
                <div className={`w-9 h-9 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center mb-2.5`}><Icon className="w-4 h-4" /></div>
                <div className="text-2xl font-semibold text-slate-900 tabular-nums" style={{ fontFamily: "Outfit" }}>{c.v}</div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-0.5 font-medium">{c.label}</div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          {personalCards.map((c) => {
            const Icon = c.icon;
            return (
              <Card key={c.label} className="p-4 lg:p-5 border-slate-200">
                <div className={`w-9 lg:w-10 h-9 lg:h-10 rounded-lg bg-${c.color}-50 text-${c.color}-600 flex items-center justify-center mb-2 lg:mb-3`}><Icon className="w-4 lg:w-5 h-4 lg:h-5" /></div>
                <div className="text-xl lg:text-2xl font-semibold text-slate-900">{c.v}</div>
                <div className="text-xs uppercase tracking-wider text-slate-500 mt-1 font-medium">{c.label}</div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Team view */}
      {scope === "team" && isAdmin ? (
        <>
          <Card className="border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Progress by Employee</div>
              <Badge variant="outline" className="text-[10px]">{team.length} {team.length === 1 ? "person" : "people"}</Badge>
            </div>
            <div className="divide-y divide-slate-100" data-testid="team-by-employee">
              {team.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">No tasks have been assigned yet.</div>}
              {team.map((r) => (
                <div key={r.id} className="p-4 flex items-center gap-4" data-testid={`team-row-${r.id}`}>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {(r.name || "?").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <div className="font-medium text-slate-900 text-sm">{r.name}</div>
                      <Badge variant="outline" className="text-[10px] bg-slate-50">{r.total} total</Badge>
                      {r.pending > 0 && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">{r.pending} pending</Badge>}
                      {r.in_progress > 0 && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">{r.in_progress} in progress</Badge>}
                      {r.completed > 0 && <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{r.completed} done</Badge>}
                      {r.overdue > 0 && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">{r.overdue} overdue</Badge>}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all" style={{ width: `${r.progress}%` }} />
                      </div>
                      <div className="text-xs tabular-nums font-semibold text-slate-700 w-10 text-right">{r.progress}%</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="border-slate-200">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>All Team Tasks</div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger className="h-8 w-40 text-xs" data-testid="filter-employee"><SelectValue placeholder="All employees" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All employees</SelectItem>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id} className="text-xs">{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-8 w-36 text-xs" data-testid="filter-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All statuses" : s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="text-[10px]">{filteredTeamTasks.length} / {tasks.length}</Badge>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredTeamTasks.length === 0 && <div className="p-8 text-center text-sm text-slate-500">No tasks match the current filters.</div>}
              {filteredTeamTasks.map((t) => <TaskRow key={t.id} t={t} showAssignee onSelect={setSelected} />)}
            </div>
          </Card>
        </>
      ) : (
        // Personal task list
        <>
          {complaints.some((c) => c.status !== "Resolved" && c.status !== "Closed") && (
            <Card className="border-rose-200 bg-rose-50/40" data-testid="open-complaints-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><Megaphone className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-rose-900">
                      {complaints.filter((c) => c.status !== "Resolved" && c.status !== "Closed").length} open complaint{complaints.filter((c) => c.status !== "Resolved" && c.status !== "Closed").length === 1 ? "" : "s"} for you
                    </div>
                    <div className="text-xs text-rose-700">Issues raised by you or assigned to you.</div>
                  </div>
                  <Link to="/complaints"><Button variant="outline" size="sm" className="border-rose-300 text-rose-700 hover:bg-rose-100">Open Complaint Center <ChevronRight className="w-3.5 h-3.5 ml-1" /></Button></Link>
                </div>
              </CardContent>
            </Card>
          )}

          <Tabs value={taskPortalTab} onValueChange={setTaskPortalTab}>
            <TabsList className="bg-slate-100">
              <TabsTrigger value="tasks" data-testid="tab-my-tasks"><ClipboardList className="w-3.5 h-3.5 mr-1.5" /> My Tasks ({tasks.length})</TabsTrigger>
              <TabsTrigger value="complaints" data-testid="tab-my-complaints"><Megaphone className="w-3.5 h-3.5 mr-1.5" /> Complaints ({complaints.length})</TabsTrigger>
            </TabsList>
            <div style={{ display: taskPortalTab === "tasks" ? "block" : "none" }} className="mt-3">
              {visitedTaskPortalTabs.has("tasks") && (
                <Card className="border-slate-200">
                  <div className="p-4 border-b border-slate-200 font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>My Tasks</div>
                  <div className="divide-y divide-slate-100">
                    {tasks.length === 0 && <div className="p-8 text-center text-slate-500">No tasks assigned yet. Your admin will assign work soon.</div>}
                    {tasks.map((t) => <TaskRow key={t.id} t={t} onSelect={setSelected} />)}
                  </div>
                </Card>
              )}
            </div>
            <div style={{ display: taskPortalTab === "complaints" ? "block" : "none" }} className="mt-3">
              {visitedTaskPortalTabs.has("complaints") && (
                <Card className="border-slate-200">
                  <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                    <div className="font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>My Complaints</div>
                    <Link to="/complaints" className="text-xs text-blue-600 hover:underline">Open Complaint Center →</Link>
                  </div>
                  <div className="divide-y divide-slate-100" data-testid="task-portal-complaints">
                    {complaints.length === 0 && <div className="p-8 text-center text-slate-500 text-sm">No complaints yet. <Link to="/complaints" className="text-blue-600 hover:underline">Raise one →</Link></div>}
                    {complaints.map((c) => <ComplaintMiniRow key={c.id} c={c} />)}
                  </div>
                </Card>
              )}
            </div>
          </Tabs>
        </>
      )}

      {selected && (
        <TaskDetail
          task={tasks.find((t) => t.id === selected.id) || selected}
          canMutate={scope === "mine" || !isAdmin || selected.assigned_to === user?.id}
          onClose={handleCloseDetail}
          onMutate={() => {
            markMutated();
            queryClient.invalidateQueries(["tasks"]);
          }}
        />
      )}
      <Dialog open={mrOpen} onOpenChange={(o) => { setMrOpen(o); if (!o) { setMrSelectedProject(null); setMrSearch(""); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="new-mr-dialog">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Outfit" }}>New Material Request</DialogTitle>
            <DialogDescription className="text-xs">Create an independent material request for a project.</DialogDescription>
          </DialogHeader>

          {!mrSelectedProject ? (
            <div className="space-y-4 py-2">
              <FF label="Step 1: Select Client">
                <Input
                  placeholder="Search by client name, SOL ID, or mobile..."
                  value={mrSearch}
                  onChange={(e) => setMrSearch(e.target.value)}
                  className="w-full"
                  data-testid="mr-client-search"
                />
              </FF>
              <div className="border border-slate-200 rounded-md max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                {projects
                  .filter((p) => {
                    const q = debouncedMrSearch.toLowerCase();
                    return !q ||
                      p.full_name?.toLowerCase().includes(q) ||
                      p.sol_id?.toLowerCase().includes(q) ||
                      p.mobile?.toLowerCase().includes(q);
                  })
                  .map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setMrSelectedProject(p)}
                      className="p-3 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition"
                      data-testid={`mr-search-item-${p.id}`}
                    >
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{p.full_name}</div>
                        <div className="text-xs text-slate-500">SOL ID: {p.sol_id} · Mobile: {p.mobile}</div>
                      </div>
                      <Plus className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
                {projects.filter((p) => {
                  const q = debouncedMrSearch.toLowerCase();
                  return !q ||
                    p.full_name?.toLowerCase().includes(q) ||
                    p.sol_id?.toLowerCase().includes(q) ||
                    p.mobile?.toLowerCase().includes(q);
                }).length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">No matching clients found.</div>
                  )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Step 2: Client Info Display */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 relative">
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2 text-xs h-7 px-2"
                  onClick={() => setMrSelectedProject(null)}
                  data-testid="mr-change-client-btn"
                >
                  Change Client
                </Button>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Selected Project Info</div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <span className="text-xs text-slate-500 block">Client Name</span>
                    <span className="font-semibold text-slate-900">{mrSelectedProject.full_name}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Project Number</span>
                    <span className="font-semibold text-slate-900">{mrSelectedProject.sol_id}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Consumer Number</span>
                    <span className="font-semibold text-slate-900">{mrSelectedProject.consumer_number || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-500 block">Current Stage</span>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 mt-0.5">
                      {(() => {
                        const stages = mrSelectedProject.stages || {};
                        const order = [
                          "Handover", "Verification", "MSEDCL Upload", "PM Surya Ghar Upload",
                          "Meter Testing Completed", "Meter Testing Request", "Document Signed",
                          "Document Making", "Installation", "Material Delivery", "Quotation",
                          "Survey", "Onboarding"
                        ];
                        return order.find((s) => stages[s]) || "Onboarding";
                      })()}
                    </Badge>
                  </div>
                  <div className="col-span-2">
                    <span className="text-xs text-slate-500 block">Site Address</span>
                    <span className="text-slate-900">
                      {[mrSelectedProject.address, mrSelectedProject.city, mrSelectedProject.state, mrSelectedProject.pincode].filter(Boolean).join(", ") || "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Step 3: Material Request Form */}
              <div className="border-t border-slate-200 pt-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Create Material Request</div>
                <MaterialRequest
                  clientId={mrSelectedProject.id}
                  onDone={() => {
                    setMrOpen(false);
                    setMrSelectedProject(null);
                    setMrSearch("");
                    invalidateMatReqs();
                    queryClient.invalidateQueries({ queryKey: ["projects"] });
                  }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const FF = ({ label, children }) => (
  <div><Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label><div className="mt-1.5">{children}</div></div>
);

function ComplaintMiniRow({ c }) {
  const status = c.status || "Open";
  const statusCls = status === "Resolved" || status === "Closed"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "In Progress"
    ? "bg-blue-50 text-blue-700 border-blue-200"
    : status === "Waiting"
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  const priorityBar = c.priority === "Urgent" ? "bg-red-500" : c.priority === "High" ? "bg-orange-500" : c.priority === "Low" ? "bg-slate-400" : "bg-blue-500";
  const esc = c.escalation === "red" ? { cls: "bg-red-100 text-red-800 border-red-300", label: "Overdue" } : c.escalation === "yellow" ? { cls: "bg-amber-100 text-amber-800 border-amber-300", label: "Aging" } : null;
  return (
    <Link to={`/complaints/${c.id}`} className="block p-4 hover:bg-slate-50 transition" data-testid={`complaint-mini-${c.id}`}>
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-12 rounded-full ${priorityBar} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-slate-500">#{c.complaint_no}</span>
            <div className="font-medium text-slate-900 truncate">{c.title}</div>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 text-[10px] shrink-0">{c.category}</Badge>
            {esc && <Badge variant="outline" className={`${esc.cls} text-[10px] shrink-0`}>{esc.label}</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-1 truncate">
            Raised by <span className="font-medium text-slate-700">{c.raised_by_name}</span>
            {c.client_name && <> · for <span className="font-medium text-slate-700">{c.client_name}</span></>}
            <> · {dayjs(c.created_at).fromNow()}</>
          </div>
        </div>
        <Badge variant="outline" className={`${statusCls} text-[10px] shrink-0`}>{status}</Badge>
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </div>
    </Link>
  );
}

const TaskRow = React.memo(function TaskRow({ t, showAssignee = false, onSelect }) {
  const overdue = t.status !== "completed" && t.deadline && t.deadline < dayjs().format("YYYY-MM-DD");
  const workflow = getWorkflow(t.task_type);
  const workflowLabel = t.task_type || "Task";
  
  const handleClick = React.useCallback(() => {
    onSelect(t);
  }, [t, onSelect]);

  return (
    <div className="p-4 flex items-center gap-3 hover:bg-slate-50 cursor-pointer" onClick={handleClick} data-testid={`task-${t.id}`}>
      <div className={`w-2 h-12 rounded-full shrink-0 ${t.priority === "Urgent" ? "bg-red-500" : t.priority === "High" ? "bg-orange-500" : "bg-blue-500"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-slate-900">{workflowLabel}</div>
          <Badge variant="outline" className="bg-slate-50 text-slate-700 text-xs truncate max-w-[120px]">{t.client_name}</Badge>
          <span className="text-xs text-slate-500">{t.sol_id}</span>
          {overdue && <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[10px]">Overdue</Badge>}
        </div>
        <div className="text-xs text-slate-500 mt-1 truncate">
          {showAssignee && <><span className="font-medium text-slate-700">{t.assigned_to_name || "Unassigned"}</span> · </>}
          Assigned by {t.assigned_by_name} · Deadline {t.deadline || "—"} · {t.priority}
        </div>
      </div>
      <Badge variant="outline" className={`shrink-0 ${t.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : t.status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
        {t.status === "in_progress" ? "In Progress" : t.status}
      </Badge>
    </div>
  );
});

// ─── Task Detail – renders correct workflow based on task_type ────────────────
function TaskDetail({ task, onClose, onMutate, canMutate = true }) {
  const { data: client } = useClientDetail(task.client_id);
  const workflow = getWorkflow(task.task_type);

  const updateStatus = async (status, payload = {}) => {
    try {
      await api.patch(`/tasks/${task.id}`, { status, ...payload });
      toast.success(`Task ${status}`);
      onMutate?.();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const mapsUrl = client
    ? `https://maps.google.com/?q=${encodeURIComponent([client.address, client.city, client.state, client.pincode].filter(Boolean).join(", "))}`
    : "#";

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{task.task_type}</span>
            <span className="text-slate-400">—</span>
            <span className="text-slate-600 font-normal truncate">{task.client_name}</span>
          </DialogTitle>
        </DialogHeader>

        {client && (
          <div className="space-y-4 mt-2">
            {/* Client info card */}
            <Card className="border-slate-200">
              <CardContent className="p-4 grid md:grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Client</span><div className="font-medium">{client.full_name}</div></div>
                <div><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Assigned to</span><div className="font-medium">{task.assigned_to_name || "—"}</div></div>
                <div><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Mobile</span>
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /><a href={`tel:${client.mobile}`} className="text-blue-600">{client.mobile}</a></div>
                </div>
                <div className="md:col-span-2"><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Address</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{[client.address, client.city, client.state, client.pincode].filter(Boolean).join(", ") || "—"}</span>
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 text-xs hover:underline" data-testid="maps-link">
                      <MapPin className="w-3.5 h-3.5" /> Open in Maps
                    </a>
                  </div>
                </div>
                <div><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">System</span><div>{client.system_kw} kW · {client.phase_type}</div></div>
                <div><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Panel / Inverter</span><div className="text-xs">{client.panel_make} {client.panel_wattage}W × {client.num_panels} / {client.inverter_make} {client.inverter_capacity}</div></div>
                {task.remarks && <div className="md:col-span-2"><span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Admin Instructions</span><div className="text-slate-700">{task.remarks}</div></div>}
              </CardContent>
            </Card>

            {/* ── Workflow panel: driven by task_type ── */}
            {(!canMutate || task.status === "completed") && (
              <div className="text-xs text-slate-500 italic bg-slate-50 border border-slate-200 rounded-lg p-3">
                {task.status === "completed" ? "This task is completed and locked." : "Read-only — you are viewing another employee's task."}
              </div>
            )}

            {(() => {
              const activeCanMutate = canMutate && task.status !== "completed";
              return (
                <>
                  {workflow === "survey" && <SurveyWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                  {workflow === "installation" && <InstallationWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} clientId={task.client_id} onDone={onClose} />}
                  {workflow === "document_making" && <DocumentMakingWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                  {workflow === "document_signed" && <DocumentSignedWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} onDone={onClose} />}
                  {workflow === "meter_testing" && <MeterTestingWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} onDone={onClose} />}
                  {workflow === "material_dispatch" && <MaterialDispatchWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                  {workflow === "site_visit" && <SiteVisitWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                  {workflow === "verification" && <VerificationWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} clientId={task.client_id} onDone={onClose} />}
                  {workflow === "handover" && <HandoverWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                  {workflow === "complaint" && <ComplaintWorkflow task={task} canMutate={activeCanMutate} updateStatus={updateStatus} />}
                </>
              );
            })()}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Workflow components ──────────────────────────────────────────────────────

function ActionBar({ children }) {
  return <Card className="border-slate-200"><CardContent className="p-4 flex flex-wrap gap-2">{children}</CardContent></Card>;
}

function SurveyWorkflow({ task, canMutate, updateStatus }) {
  const [photos, setPhotos] = useState({});
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState("");
  const [manualLocation, setManualLocation] = useState("");
  const [checklist, setChecklist] = useState(SURVEY_CHECKLIST.map((label) => ({ label, checked: false })));
  const [uploading, setUploading] = useState("");

  // Populate existing submission if any (e.g. for re-viewing completed task or loading drafts)
  useEffect(() => {
    if (task && task.submission) {
      const sub = task.submission;
      if (sub.photos) setPhotos(sub.photos);
      if (sub.notes) setNotes(sub.notes);
      if (sub.gps) setGps(sub.gps);
      if (sub.manual_location) setManualLocation(sub.manual_location);
      if (sub.checklist) setChecklist(sub.checklist);
    }
  }, [task]);

  const uploadPhoto = async (e, label) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(label);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "project-images");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });

      const setPhotoWithGPS = (coords) => {
        setPhotos((prev) => ({
          ...prev,
          [label]: {
            file_id: data.id,
            note: "",
            gps: coords,
            capture_time: dayjs().toISOString(),
            uploaded_by: task.assigned_to_name || "Employee",
          }
        }));
      };

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
            setPhotoWithGPS(coords);
          },
          () => {
            setPhotoWithGPS(gps || "");
          }
        );
      } else {
        setPhotoWithGPS(gps || "");
      }

      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading("");
      e.target.value = "";
    }
  };

  const updatePhotoNote = (label, noteVal) => {
    setPhotos((prev) => ({
      ...prev,
      [label]: {
        ...(prev[label] || {}),
        note: noteVal,
      }
    }));
  };

  const deletePhoto = (label) => {
    setPhotos((prev) => {
      const copy = { ...prev };
      delete copy[label];
      return copy;
    });
  };

  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => toast.error("Could not get location"),
    );
  };

  const toggleChecklist = (index) => {
    if (!canMutate) return;
    setChecklist((prev) => prev.map((item, idx) => idx === index ? { ...item, checked: !item.checked } : item));
  };

  const submitSurvey = async () => {
    await updateStatus("completed", {
      submission: {
        photos,
        gps,
        manual_location: manualLocation,
        notes,
        checklist,
        submitted_at: dayjs().toISOString(),
      },
    });
  };

  const completedCount = checklist.filter((item) => item.checked).length;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 bg-blue-50 rounded-lg px-3 py-2">Survey Workflow</div>
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Checklist</div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleChecklist(idx)}
                    disabled={!canMutate}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${item.checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className={`text-xs font-semibold ${item.checked ? "text-emerald-700" : "text-slate-400"}`}>{item.checked ? "Done" : "Pending"}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">{completedCount} of {checklist.length} completed</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Survey Notes</div>
                <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canMutate} placeholder="Enter observations or client requirements" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span>GPS Location</span>
                  {canMutate && <Button variant="outline" size="sm" onClick={captureGps} disabled={uploading === "gps"}>Capture</Button>}
                </div>
                <Input value={gps} onChange={(e) => setGps(e.target.value)} disabled={!canMutate} placeholder="lat, lng" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Manual Location / Address</div>
                <Input value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} disabled={!canMutate} placeholder="Enter manual address or landmark" />
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Photos</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {SURVEY_PHOTOS.map((label) => {
                const item = photos[label];
                if (!item) {
                  return (
                    <label key={label} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors border-slate-200 hover:border-blue-400 hover:bg-slate-50/50 flex flex-col justify-center items-center min-h-[140px] ${!canMutate ? "pointer-events-none opacity-60" : ""}`}>
                      <Camera className="w-6 h-6 text-slate-400 mb-2" />
                      <div className="text-xs font-semibold text-slate-700">{label}</div>
                      <div className="text-[10px] text-slate-400 mt-1">Click to capture/upload</div>
                      <input type="file" accept="image/*" capture="environment" className="hidden" disabled={!canMutate} onChange={(e) => uploadPhoto(e, label)} />
                    </label>
                  );
                }

                const fileId = typeof item === "string" ? item : item.file_id;
                const note = typeof item === "object" ? item.note : "";
                const photoGps = typeof item === "object" ? item.gps : "";
                const time = typeof item === "object" ? item.capture_time : "";

                return (
                  <div key={label} className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:shadow-sm transition flex flex-col">
                    <div className="relative aspect-video bg-slate-100 border-b border-slate-100 flex items-center justify-center overflow-hidden">
                      <img src={fileUrl(fileId)} alt={label} className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 right-2 flex justify-between items-start">
                        <Badge className="bg-black/60 text-white border-none text-[9px]">{label}</Badge>
                        {canMutate && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="w-6 h-6 rounded-full shadow"
                            onClick={() => deletePhoto(label)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <Input
                        placeholder="Add note for this photo..."
                        value={note || ""}
                        onChange={(e) => updatePhotoNote(label, e.target.value)}
                        className="text-xs h-7"
                        disabled={!canMutate}
                      />
                      <div className="text-[9px] text-slate-400 space-y-0.5 font-mono">
                        {photoGps && <div className="flex items-center"><MapPin className="w-2.5 h-2.5 mr-1" /> {photoGps}</div>}
                        {time && <div className="flex items-center"><Clock className="w-2.5 h-2.5 mr-1" /> {dayjs(time).format("DD MMM HH:mm")}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {uploading && <div className="text-xs text-blue-600 mt-2">Uploading {uploading}…</div>}
          </div>
        </CardContent>
      </Card>
      <ActionBar>
        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1.5" /> View Client</Button>
        <Button variant="outline" size="sm"><Navigation className="w-4 h-4 mr-1.5" /> Open Location</Button>
        {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
          <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">Start Survey</Button>
        )}
        {canMutate && task.status === "in_progress" && (
          <Button onClick={submitSurvey} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Submit Survey Report</Button>
        )}
      </ActionBar>
    </div>
  );
}

function InstallationWorkflow({ task, canMutate, updateStatus, clientId, onDone }) {
  return (
    <Tabs defaultValue="actions">
      <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 rounded-lg px-3 py-2 mb-3">Installation Workflow</div>
      <TabsList className="bg-white border border-slate-200">
        <TabsTrigger value="actions">Actions</TabsTrigger>
        <TabsTrigger value="material">Request Material</TabsTrigger>
        <TabsTrigger value="verify">Submit Verification</TabsTrigger>
      </TabsList>
      <TabsContent value="actions">
        <ActionBar>
          {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
            <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">Start Task / Installation</Button>
          )}
          {canMutate && task.status !== "completed" && (
            <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Send For Verification</Button>
          )}
        </ActionBar>
      </TabsContent>
      <TabsContent value="material"><MaterialRequest clientId={clientId} onDone={onDone} /></TabsContent>
      <TabsContent value="verify"><VerificationForm clientId={clientId} onDone={onDone} /></TabsContent>
    </Tabs>
  );
}

function DocumentMakingWorkflow({ task, canMutate, updateStatus }) {
  const DOC_TYPES = [
    { label: "WCR", value: "wcr" },
    { label: "Annexure", value: "annexure" },
    { label: "SLDR", value: "sldr" },
    { label: "Net Meter Agreement", value: "net_meter_agreement" },
    { label: "Vendor Agreement", value: "vendor_agreement" },
  ];
  const [uploading, setUploading] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState({});
  const signedRef = useRef(null);
  const pmRef = useRef(null);
  const msedclRef = useRef(null);

  const generateDocument = async (docType) => {
    setUploading(docType);
    try {
      await api.post(`/clients/${task.client_id}/generate-document`, { doc_type: docType });
      toast.success(`Generated ${docType.replace(/_/g, " ")}`);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading("");
    }
  };

  const uploadFile = async (file, category) => {
    if (!file) return;
    setUploading(category);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "customer-documents");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setUploadedFiles((prev) => ({ ...prev, [category]: data.original_filename || file.name }));
      toast.success(`${category} uploaded`);
      const stageMap = {
        signed_copy: "Document Signed",
        pm_surya_ghar: "PM Surya Ghar Upload",
        msedcl: "MSEDCL Upload",
      };
      const stageName = stageMap[category];
      if (stageName) {
        await api.patch(`/clients/${task.client_id}/stages`, { stages: { [stageName]: true } });
      }
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setUploading("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 rounded-lg px-3 py-2">Document Making Workflow</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {DOC_TYPES.map((dt) => (
          <Button
            key={dt.value}
            variant="outline"
            size="sm"
            className="justify-start"
            onClick={() => generateDocument(dt.value)}
            disabled={uploading === dt.value}
            data-testid={`doc-generate-${dt.value}`}
          >
            <FileText className="w-3.5 h-3.5 mr-1.5" /> {dt.label}
          </Button>
        ))}
      </div>
      <ActionBar>
        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1.5" /> Open Client</Button>
        <Button variant="outline" size="sm" onClick={() => signedRef.current?.click()} disabled={uploading === "signed_copy"} data-testid="upload-signed-copy">
          <Upload className="w-4 h-4 mr-1.5" /> Upload Signed Copy
        </Button>
        <Button variant="outline" size="sm" onClick={() => pmRef.current?.click()} disabled={uploading === "pm_surya_ghar"} data-testid="upload-pm-surya-ghar">
          PM Surya Ghar Upload
        </Button>
        <Button variant="outline" size="sm" onClick={() => msedclRef.current?.click()} disabled={uploading === "msedcl"} data-testid="upload-msedcl">
          MSEDCL Upload
        </Button>
        {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
          <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">Start Documents</Button>
        )}
        {canMutate && task.status === "in_progress" && (
          <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Submit</Button>
        )}
      </ActionBar>
      <input ref={signedRef} type="file" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "signed_copy")} />
      <input ref={pmRef} type="file" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "pm_surya_ghar")} />
      <input ref={msedclRef} type="file" className="hidden" onChange={(e) => uploadFile(e.target.files?.[0], "msedcl")} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-500">
        {Object.entries(uploadedFiles).map(([key, name]) => (
          <div key={key} className="truncate"><span className="font-medium capitalize">{key.replace(/_/g, " ")}:</span> {name}</div>
        ))}
      </div>
    </div>
  );
}

function MeterTestingWorkflow({ task, canMutate, updateStatus, onDone }) {
  const CHECKLIST_ITEMS = [
    "Meter Testing Request Received",
    "Meter Installed",
    "Meter Reading Verified",
    "Meter Testing Completed",
    "MSEDCL Meter Testing Submitted",
    "Meter Approved",
    "Final Notes Added"
  ];
  
  const ATTACHMENT_FIELDS = [
    "Meter Photo",
    "Meter Serial Number Photo",
    "Meter Testing Report",
    "Other Files"
  ];

  const [checklist, setChecklist] = useState(
    CHECKLIST_ITEMS.map((label) => ({ label, checked: false }))
  );
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState({});
  const [uploading, setUploading] = useState("");

  useEffect(() => {
    if (task && task.submission) {
      const sub = task.submission;
      if (sub.checklist) setChecklist(sub.checklist);
      if (sub.notes) setNotes(sub.notes);
      if (sub.attachments) setAttachments(sub.attachments);
    }
  }, [task]);

  const toggleChecklist = (index) => {
    if (!canMutate) return;
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, checked: !item.checked } : item))
    );
  };

  const uploadAttachment = async (e, label) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(label);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "project-images");
      const { data } = await api.post("/files/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setAttachments((prev) => ({
        ...prev,
        [label]: data.id
      }));
      toast.success(`${label} uploaded`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading("");
      e.target.value = "";
    }
  };

  const deleteAttachment = (label) => {
    setAttachments((prev) => {
      const copy = { ...prev };
      delete copy[label];
      return copy;
    });
  };

  const submitReport = async () => {
    if (!notes.trim()) {
      toast.error("Notes are required for submission");
      return;
    }
    await updateStatus("completed", {
      submission: {
        checklist,
        notes,
        attachments,
        submitted_at: dayjs().toISOString()
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Meter Testing Workflow
      </div>
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Checklist</div>
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => toggleChecklist(idx)}
                    disabled={!canMutate}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${item.checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-center justify-between text-sm">
                      <span>{item.label}</span>
                      <span className={`text-xs font-semibold ${item.checked ? "text-emerald-700" : "text-slate-400"}`}>
                        {item.checked ? "Done" : "Pending"}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Notes <span className="text-red-500">*</span>
                </div>
                <Textarea
                  placeholder="Enter detailed notes (required)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canMutate}
                  rows={4}
                  className="text-sm"
                />
              </div>

              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Attachments</div>
                <div className="grid grid-cols-2 gap-2">
                  {ATTACHMENT_FIELDS.map((label) => {
                    const fileId = attachments[label];
                    return (
                      <div key={label} className="border border-slate-200 rounded-lg p-2 bg-white flex flex-col justify-between space-y-2 text-xs">
                        <div className="font-semibold text-slate-700">{label}</div>
                        {fileId ? (
                          <div className="flex items-center justify-between bg-slate-50 border rounded px-2 py-1">
                            <span className="text-[10px] text-slate-500 truncate">Uploaded</span>
                            {canMutate && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="w-5 h-5 text-red-500 hover:text-red-700"
                                onClick={() => deleteAttachment(label)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="relative">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full text-[10px] py-1 h-7 bg-white"
                              disabled={!canMutate || uploading === label}
                              onClick={() => document.getElementById(`upload-meter-${label}`).click()}
                            >
                              <Upload className="w-3 h-3 mr-1" /> {uploading === label ? "Uploading..." : "Upload"}
                            </Button>
                            <input
                              id={`upload-meter-${label}`}
                              type="file"
                              className="hidden"
                              onChange={(e) => uploadAttachment(e, label)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <ActionBar>
        <Button variant="outline" size="sm">
          <Eye className="w-4 h-4 mr-1.5" /> View Client
        </Button>
        {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
          <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">
            Start Meter Testing
          </Button>
        )}
        {canMutate && task.status === "in_progress" && (
          <Button onClick={submitReport} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">
            Submit Meter Testing
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

function DocumentSignedWorkflow({ task, canMutate, updateStatus, onDone }) {
  const CHECKLIST_ITEMS = [
    "WCR Signed",
    "Annexure Signed",
    "SLDR Signed",
    "Net Meter Agreement Signed",
    "Meter Testing Request Signed",
    "Vendor Agreement Signed",
    "Other Documents Signed",
  ];

  const [checklist, setChecklist] = useState(
    CHECKLIST_ITEMS.map((label) => ({ label, checked: false, file_id: "", filename: "" }))
  );
  const [notes, setNotes] = useState("");
  const [uploadingIndex, setUploadingIndex] = useState(null);

  useEffect(() => {
    if (task && task.submission) {
      const sub = task.submission;
      if (sub.checklist) setChecklist(sub.checklist);
      if (sub.notes) setNotes(sub.notes);
    }
  }, [task]);

  const toggleChecklist = (index) => {
    if (!canMutate) return;
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, checked: !item.checked } : item))
    );
  };

  const uploadDoc = async (e, index) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIndex(index);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "customer-documents");
      const { data } = await api.post("/files/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      setChecklist((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? { ...item, file_id: data.id, filename: data.original_filename || file.name }
            : item
        )
      );
      toast.success(`${checklist[index].label} uploaded`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploadingIndex(null);
      e.target.value = "";
    }
  };

  const deleteDoc = (index) => {
    setChecklist((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, file_id: "", filename: "" }
          : item
      )
    );
  };

  const submitDocumentSigned = async () => {
    await updateStatus("completed", {
      submission: {
        checklist,
        notes,
        submitted_at: dayjs().toISOString()
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
        Document Signed Workflow
      </div>
      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Checklist & Document Uploads</div>
            <div className="space-y-3">
              {checklist.map((item, idx) => (
                <div
                  key={item.label}
                  className={`flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-lg border ${
                    item.checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleChecklist(idx)}
                      disabled={!canMutate}
                      className={`px-3 py-1 rounded text-xs font-semibold border ${
                        item.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-slate-600"
                      }`}
                    >
                      {item.checked ? "✓ Checked" : "☐ Pending"}
                    </button>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.file_id ? (
                      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1 text-xs">
                        <span className="text-[10px] text-slate-500 max-w-[150px] truncate">{item.filename}</span>
                        {canMutate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-4 h-4 text-red-500 hover:text-red-700"
                            onClick={() => deleteDoc(idx)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-[10px] py-1 h-7 bg-white"
                          disabled={!canMutate || uploadingIndex === idx}
                          onClick={() => document.getElementById(`upload-signed-doc-${idx}`).click()}
                        >
                          <Upload className="w-3 h-3 mr-1" /> {uploadingIndex === idx ? "Uploading..." : "Upload File"}
                        </Button>
                        <input
                          id={`upload-signed-doc-${idx}`}
                          type="file"
                          className="hidden"
                          onChange={(e) => uploadDoc(e, idx)}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Remarks / Notes</div>
            <Textarea
              placeholder="Add optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canMutate}
              rows={3}
              className="text-sm"
            />
          </div>
        </CardContent>
      </Card>
      <ActionBar>
        <Button variant="outline" size="sm">
          <Eye className="w-4 h-4 mr-1.5" /> Open Client
        </Button>
        {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
          <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">
            Start Task
          </Button>
        )}
        {canMutate && task.status === "in_progress" && (
          <Button onClick={submitDocumentSigned} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">
            Upload Signed Documents
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

function MaterialDispatchWorkflow({ task, canMutate, updateStatus }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin" || user?.role === "Supervisor";

  const [matReq, setMatReq] = useState(null);
  const [outwards, setOutwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewRequestOpen, setViewRequestOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  
  // Local state for approval Form
  const [appForm, setAppForm] = useState({ challan_number: "", vehicle_number: "", driver_name: "", delivery_date: "", remarks: "" });
  const [appItems, setAppItems] = useState({});
  const [uploading, setUploading] = useState("");
  const [deliveryPhoto, setDeliveryPhoto] = useState({ id: "", name: "" });
  const [challanPhoto, setChallanPhoto] = useState({ id: "", name: "" });
  
  // Regular employee delivery notes
  const [deliveryNotes, setDeliveryNotes] = useState("");

  const [dispatchHVOpen, setDispatchHVOpen] = useState(false);
  const [dispatchHVItems, setDispatchHVItems] = useState([]);
  const [currentHVIndex, setCurrentHVIndex] = useState(0);
  const [hvDialogResults, setHvDialogResults] = useState({});
  const [hvDialogData, setHvDialogData] = useState({
    serial_number_required: false,
    serial_text: "",
    serial_numbers: [],
    installation_notes: "",
    warranty_start_date: "",
    asset_remarks: ""
  });

  const loadData = useCallback(async () => {
    try {
      const { data } = await api.get("/material-requests", { params: { client_id: task.client_id } });
      if (data && data.length > 0) {
        const req = data[0];
        setMatReq(req);
        
        // Pre-fill approved quantities
        const itemsQty = {};
        (req.items || []).forEach((it) => {
          itemsQty[it.product] = it.approved_quantity !== undefined 
            ? it.approved_quantity 
            : Math.max(0, Math.min(Number(it.quantity || 0), Number(it.available_stock || 0)));
        });
        setAppItems(itemsQty);

        if (req.delivery) {
          setAppForm({
            challan_number: req.delivery.challan_number || "",
            vehicle_number: req.delivery.vehicle_number || "",
            driver_name: req.delivery.driver_name || "",
            delivery_date: req.delivery.delivery_date || "",
            remarks: req.approval?.remarks || "",
          });
          if (req.delivery.delivery_photo_file_id) {
            setDeliveryPhoto({ id: req.delivery.delivery_photo_file_id, name: "Delivery Photo" });
          }
          if (req.delivery.challan_photo_file_id) {
            setChallanPhoto({ id: req.delivery.challan_photo_file_id, name: "Challan Photo" });
          }
        }
      }
      
      const outRes = await api.get("/inventory/outward");
      const filteredOutwards = (outRes.data || []).filter(o => o.client_id === task.client_id);
      setOutwards(filteredOutwards);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  }, [task.client_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async (e, key, setter) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "material-delivery");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setter({ id: data.id, name: data.original_filename || file.name });
      toast.success(`${key === "delivery" ? "Delivery" : "Challan"} photo uploaded`);
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setUploading("");
      e.target.value = "";
    }
  };

  const handleApprove = async () => {
    if (!matReq) return;
    if (!appForm.challan_number.trim()) {
      toast.error("Challan number is required");
      return;
    }
    
    setLoading(true);
    try {
      const items = (matReq.items || []).map((it) => {
        const approved = Number(appItems[it.product]) || 0;
        return { ...it, approved_quantity: approved };
      });
      const isPartial = items.some((it) => Number(it.approved_quantity) < Number(it.quantity || 0));
      const status = isPartial ? "partial_approved" : "approved";
      
      await api.patch(`/material-requests/${matReq.id}`, {
        status,
        items,
        challan_number: appForm.challan_number,
        vehicle_number: appForm.vehicle_number,
        driver_name: appForm.driver_name,
        delivery_date: appForm.delivery_date || dayjs().format("YYYY-MM-DD"),
        remarks: appForm.remarks,
        delivery_photo_file_id: deliveryPhoto.id,
        challan_photo_file_id: challanPhoto.id,
      });
      
      toast.success("Material request approved and outward pending entries created");
      setApproveOpen(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const proceedDispatch = async (pendingOutwards, hvDataMap) => {
    setLoading(true);
    try {
      for (const item of pendingOutwards) {
        const hvData = hvDataMap[item.id] || {};
        await api.patch(`/inventory/outward/${item.id}`, {
          product: item.product,
          size: item.size || "",
          quantity: item.quantity,
          unit: item.unit || "Nos",
          client_id: item.client_id,
          client_name: item.client_name,
          project_id: item.project_id,
          project_name: item.project_name,
          outward_challan_no: item.outward_challan_no,
          reference_number: item.reference_number || item.outward_challan_no,
          reference_type: item.reference_type || "Challan Number",
          date: item.date,
          status: "Dispatched",
          high_value_goods: !!hvDataMap[item.id],
          high_value_asset: !!hvDataMap[item.id],
          ...hvData
        });
      }
      toast.success("Outward status updated to Dispatched. Stock has been reduced.");
      setDispatchHVOpen(false);
      loadData();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOutward = async () => {
    const pendingOutwards = outwards.filter(o => o.status === "Pending");
    if (pendingOutwards.length === 0) {
      toast.info("No pending outward entries found to dispatch.");
      return;
    }

    // Filter pendingOutwards to find High Value items
    const hvItems = pendingOutwards.filter(item => {
      const pName = (item.product || "").toUpperCase();
      const highValueKeywords = ["SOLAR PANEL", "INVERTER", "ACDB", "DCDB", "NET METER", "BATTERY"];
      const isHV = item.high_value_goods || item.high_value_asset || highValueKeywords.some(keyword => pName.includes(keyword));
      return isHV;
    });

    if (hvItems.length > 0) {
      setDispatchHVItems(hvItems);
      setCurrentHVIndex(0);
      setHvDialogResults({});
      setHvDialogData({
        serial_number_required: false,
        serial_text: "",
        serial_numbers: [],
        installation_notes: "",
        warranty_start_date: "",
        asset_remarks: ""
      });
      setDispatchHVOpen(true);
    } else {
      await proceedDispatch(pendingOutwards, {});
    }
  };

  const handleMarkDelivered = async () => {
    const checklist = (matReq?.items || []).map(it => ({
      label: `${it.product} (Qty: ${it.quantity}, Approved: ${it.approved_quantity || 0})`,
      checked: true
    }));

    await updateStatus("completed", {
      submission: {
        checklist,
        notes: deliveryNotes || appForm.remarks || "",
        attachments: {
          "Delivery Photo": deliveryPhoto.id,
          "Challan Photo": challanPhoto.id,
        },
        submitted_at: dayjs().toISOString(),
      }
    });
  };

  const pendingCount = outwards.filter(o => o.status === "Pending").length;
  const dispatchedCount = outwards.filter(o => o.status === "Dispatched").length;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        Material Dispatch & Delivery Workflow
      </div>

      {matReq && (
        <Card className="border-slate-200">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-700">Request Status:</span>
              <Badge className={matReq.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                {matReq.status}
              </Badge>
            </div>
            {matReq.delivery?.challan_number && (
              <div>
                <span className="font-semibold text-slate-700">Challan:</span> {matReq.delivery.challan_number}
              </div>
            )}
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <div>Pending Outwards: <span className="text-amber-600 font-bold">{pendingCount}</span></div>
              <div>Dispatched: <span className="text-emerald-600 font-bold">{dispatchedCount}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="border border-slate-200 rounded p-2 bg-slate-50 text-xs">
                <div className="font-semibold text-slate-600">Delivery Photo</div>
                {deliveryPhoto.id ? (
                  <div className="truncate text-emerald-600 mt-1">✓ {deliveryPhoto.name}</div>
                ) : (
                  <div className="text-slate-400 mt-1">Not Uploaded</div>
                )}
              </div>
              <div className="border border-slate-200 rounded p-2 bg-slate-50 text-xs">
                <div className="font-semibold text-slate-600">Challan Copy</div>
                {challanPhoto.id ? (
                  <div className="truncate text-emerald-600 mt-1">✓ {challanPhoto.name}</div>
                ) : (
                  <div className="text-slate-400 mt-1">Not Uploaded</div>
                )}
              </div>
            </div>

            <div className="mt-3">
              <span className="text-xs font-semibold text-slate-500">Delivery Notes / Remarks</span>
              <Textarea
                placeholder="Enter remarks or comments..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                disabled={!canMutate}
                rows={2}
                className="text-xs mt-1"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <ActionBar>
        <Button variant="outline" size="sm" onClick={() => setViewRequestOpen(true)}>
          <Eye className="w-4 h-4 mr-1.5" /> View Material Request
        </Button>
        
        {isAdmin && matReq && matReq.status === "pending" && (
          <Button variant="outline" size="sm" onClick={() => setApproveOpen(true)}>
            <BarChart2 className="w-4 h-4 mr-1.5" /> Approve Quantity
          </Button>
        )}

        {isAdmin && pendingCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleCreateOutward} disabled={loading}>
            <Send className="w-4 h-4 mr-1.5" /> Create Outward
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={!canMutate || uploading === "delivery"}
          onClick={() => document.getElementById("dispatch-upload-delivery").click()}
        >
          <Camera className="w-4 h-4 mr-1.5" /> {uploading === "delivery" ? "Uploading..." : "Upload Delivery Photo"}
        </Button>
        <input
          id="dispatch-upload-delivery"
          type="file"
          className="hidden"
          onChange={(e) => handleUpload(e, "delivery", setDeliveryPhoto)}
        />

        <Button
          variant="outline"
          size="sm"
          disabled={!canMutate || uploading === "challan"}
          onClick={() => document.getElementById("dispatch-upload-challan").click()}
        >
          <Upload className="w-4 h-4 mr-1.5" /> {uploading === "challan" ? "Uploading..." : "Upload Challan"}
        </Button>
        <input
          id="dispatch-upload-challan"
          type="file"
          className="hidden"
          onChange={(e) => handleUpload(e, "challan", setChallanPhoto)}
        />

        {canMutate && task.status !== "completed" && (
          <Button onClick={handleMarkDelivered} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">
            Mark Delivered
          </Button>
        )}
      </ActionBar>

      {viewRequestOpen && matReq && (
        <Dialog open onOpenChange={setViewRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Material Request Items</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2 text-sm">
              <div className="border border-slate-200 rounded divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {matReq.items.map((it) => (
                  <div key={it.product} className="p-3 flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-800">{it.product}</div>
                      <div className="text-xs text-slate-500">Size: {it.size || "—"} | Available: {it.available_stock || 0}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600">Qty: {it.quantity}</div>
                      <div className="text-xs text-slate-500">Approved: {it.approved_quantity !== undefined ? it.approved_quantity : "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
              {matReq.remarks && (
                <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                  <div className="font-bold text-slate-600">Requester Remarks:</div>
                  <div className="text-slate-700 mt-0.5">{matReq.remarks}</div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setViewRequestOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {dispatchHVOpen && dispatchHVItems.length > 0 && (
        <Dialog open onOpenChange={setDispatchHVOpen}>
          <DialogContent className="max-w-md bg-white border border-slate-200 shadow-xl rounded-xl">
            <DialogHeader>
              <DialogTitle className="text-slate-900 font-semibold text-base" style={{ fontFamily: "Outfit" }}>
                High Value Goods Dispatch Details ({currentHVIndex + 1} of {dispatchHVItems.length})
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500">
                Enter serial numbers and optional installation details for <strong>{dispatchHVItems[currentHVIndex].product}</strong> (Qty: {dispatchHVItems[currentHVIndex].quantity}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2 text-sm text-left">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hvDialogData.serial_number_required || false}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setHvDialogData(prev => ({
                      ...prev,
                      serial_number_required: checked,
                      serial_numbers: checked ? prev.serial_numbers : []
                    }));
                  }}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300"
                />
                Serial Number Required
              </label>

              {hvDialogData.serial_number_required && (
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Enter / Paste Serial Numbers</div>
                  <Textarea
                    rows={3}
                    placeholder={`SN001\nSN002\nSN003`}
                    value={hvDialogData.serial_text || ""}
                    onChange={(e) => {
                      const text = e.target.value;
                      const parsed = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
                      setHvDialogData(prev => ({ ...prev, serial_text: text, serial_numbers: parsed }));
                    }}
                    className="font-mono text-xs bg-white border border-slate-200 rounded-lg p-2 w-full focus:ring-1 focus:ring-blue-500 text-slate-800"
                  />
                  <div className="flex items-center justify-between text-xs mt-1">
                    <span className="text-slate-500">
                      Entered: <strong>{hvDialogData.serial_numbers.length}</strong> / <strong>{Math.floor(Number(dispatchHVItems[currentHVIndex].quantity) || 0)}</strong>
                    </span>
                    {hvDialogData.serial_numbers.length === Math.floor(Number(dispatchHVItems[currentHVIndex].quantity) || 0) ? (
                      <span className="text-emerald-600 font-semibold">✓ Matches quantity</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">✗ Must match quantity</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Installation Notes (Optional)</Label>
                <Input
                  value={hvDialogData.installation_notes || ""}
                  onChange={(e) => setHvDialogData(prev => ({ ...prev, installation_notes: e.target.value }))}
                  placeholder="e.g. Installed on south-facing roof"
                  className="mt-1 bg-white"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Warranty Start Date (Optional)</Label>
                <Input
                  type="date"
                  value={hvDialogData.warranty_start_date || ""}
                  onChange={(e) => setHvDialogData(prev => ({ ...prev, warranty_start_date: e.target.value }))}
                  className="mt-1 bg-white"
                />
              </div>

              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Asset Remarks (Optional)</Label>
                <Input
                  value={hvDialogData.asset_remarks || ""}
                  onChange={(e) => setHvDialogData(prev => ({ ...prev, asset_remarks: e.target.value }))}
                  placeholder="Remarks specific to this asset batch"
                  className="mt-1 bg-white"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDispatchHVOpen(false)}>Cancel</Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => {
                  const currentItem = dispatchHVItems[currentHVIndex];
                  if (hvDialogData.serial_number_required) {
                    const reqCount = Math.floor(Number(currentItem.quantity) || 0);
                    if (hvDialogData.serial_numbers.length !== reqCount) {
                      toast.error(`Please enter exactly ${reqCount} serial number(s).`);
                      return;
                    }
                  }
                  
                  // Save current dialog data to results
                  const updatedResults = {
                    ...hvDialogResults,
                    [currentItem.id]: {
                      serial_numbers: hvDialogData.serial_numbers,
                      installation_notes: hvDialogData.installation_notes,
                      warranty_start_date: hvDialogData.warranty_start_date,
                      asset_remarks: hvDialogData.asset_remarks
                    }
                  };
                  setHvDialogResults(updatedResults);

                  if (currentHVIndex + 1 < dispatchHVItems.length) {
                    setCurrentHVIndex(prev => prev + 1);
                    setHvDialogData({
                      serial_number_required: false,
                      serial_text: "",
                      serial_numbers: [],
                      installation_notes: "",
                      warranty_start_date: "",
                      asset_remarks: ""
                    });
                  } else {
                    const pendingOutwards = outwards.filter(o => o.status === "Pending");
                    proceedDispatch(pendingOutwards, updatedResults);
                  }
                }}
              >
                {currentHVIndex + 1 < dispatchHVItems.length ? "Next Product" : "Dispatch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {approveOpen && matReq && (
        <Dialog open onOpenChange={setApproveOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Approve & Schedule Delivery</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="border border-slate-200 rounded divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {matReq.items.map((it) => (
                  <div key={it.product} className="p-3 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-semibold text-slate-800">{it.product}</div>
                      <div className="text-xs text-slate-500">Requested: {it.quantity} | In Stock: {it.available_stock || 0}</div>
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        className="h-8 text-xs text-right"
                        min="0"
                        max={it.quantity}
                        value={appItems[it.product] === undefined ? "" : appItems[it.product]}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAppItems(prev => ({ ...prev, [it.product]: val }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <Label className="text-xs">Challan Number *</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Challan Number"
                    value={appForm.challan_number}
                    onChange={(e) => setAppForm(prev => ({ ...prev, challan_number: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Vehicle Number</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Vehicle Number"
                    value={appForm.vehicle_number}
                    onChange={(e) => setAppForm(prev => ({ ...prev, vehicle_number: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Driver Name</Label>
                  <Input
                    className="h-8 text-xs mt-1"
                    placeholder="Driver Name"
                    value={appForm.driver_name}
                    onChange={(e) => setAppForm(prev => ({ ...prev, driver_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Delivery Date</Label>
                  <Input
                    type="date"
                    className="h-8 text-xs mt-1"
                    value={appForm.delivery_date}
                    onChange={(e) => setAppForm(prev => ({ ...prev, delivery_date: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-500">Approval Remarks</Label>
                <Textarea
                  placeholder="Approval comments..."
                  value={appForm.remarks}
                  onChange={(e) => setAppForm(prev => ({ ...prev, remarks: e.target.value }))}
                  rows={2}
                  className="text-xs mt-1"
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={loading}>
                Approve Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SiteVisitWorkflow({ task, canMutate, updateStatus }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-teal-600 bg-teal-50 rounded-lg px-3 py-2">Site Visit Workflow</div>
      <ActionBar>
        <Button variant="outline" size="sm"><Navigation className="w-4 h-4 mr-1.5" /> Open Location</Button>
        <Button variant="outline" size="sm"><Camera className="w-4 h-4 mr-1.5" /> Upload Photos</Button>
        {canMutate && task.status !== "in_progress" && task.status !== "completed" && (
          <Button onClick={() => updateStatus("in_progress")} className="bg-blue-600 hover:bg-blue-700" data-testid="start-task">Start Site Visit</Button>
        )}
        {canMutate && task.status === "in_progress" && (
          <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Submit Report</Button>
        )}
      </ActionBar>
    </div>
  );
}

function VerificationWorkflow({ task, canMutate, updateStatus, clientId, onDone }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-rose-600 bg-rose-50 rounded-lg px-3 py-2">Verification Workflow</div>
      <VerificationForm clientId={clientId} onDone={onDone} />
      {canMutate && (
        <div className="flex gap-2">
          <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700 flex-1" data-testid="complete-task">Approve</Button>
          <Button variant="outline" className="border-red-300 text-red-600 hover:bg-red-50 flex-1" onClick={() => updateStatus("pending")}>Reject</Button>
        </div>
      )}
    </div>
  );
}

function HandoverWorkflow({ task, canMutate, updateStatus }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">Handover Workflow</div>
      <ActionBar>
        <Button variant="outline" size="sm"><FileText className="w-4 h-4 mr-1.5" /> Review Documents</Button>
        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1.5" /> Review Assets</Button>
        {canMutate && (
          <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Mark Handover Complete</Button>
        )}
      </ActionBar>
    </div>
  );
}

function ComplaintWorkflow({ task, canMutate, updateStatus }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-red-600 bg-red-50 rounded-lg px-3 py-2">Complaint Workflow</div>
      <ActionBar>
        <Button variant="outline" size="sm"><Eye className="w-4 h-4 mr-1.5" /> View Complaint</Button>
        <Button variant="outline" size="sm"><Upload className="w-4 h-4 mr-1.5" /> Upload Evidence</Button>
        {canMutate && (
          <Button onClick={() => updateStatus("completed")} className="bg-emerald-600 hover:bg-emerald-700" data-testid="complete-task">Resolve Complaint</Button>
        )}
      </ActionBar>
    </div>
  );
}

// ─── Shared sub-components ───────────────────────────────────────────────────

import { fetchSearchProducts, getCachedSearchProducts, getCachedProducts } from "@/lib/productCache";

export function MaterialRequest({ clientId, onDone }) {
  const [items, setItems] = useState([{ product: "", size: "", quantity: 1, remarks: "" }]);
  const [remarks, setRemarks] = useState("");
  // Use slim 6-field search cache — no balance/aggregation queries
  const [products, setProducts] = useState(() => getCachedSearchProducts() || getCachedProducts() || []);

  // Refs for auto-focus: productRefs[i] → product input of row i
  const productRefs = useRef({});

  useEffect(() => {
    fetchSearchProducts()
      .then((list) => setProducts(list || []))
      .catch(() => {
        // Fallback to full cache if search endpoint fails
        const full = getCachedProducts();
        if (full && full.length > 0) setProducts(full);
      });
  }, []);

  const handleProductChange = (i, v) => {
    let pName = "";
    let sizeVal = items[i].size || "";
    if (typeof v === "object" && v !== null) {
      pName = (v.name || "").toUpperCase();
      sizeVal = v.size || "";
    } else {
      pName = v.toUpperCase();
      const matched = products.find((p) => p.name.toUpperCase() === pName);
      if (matched) {
        sizeVal = matched.size || "";
      }
    }
    setItems(items.map((x, idx) => idx === i ? { ...x, product: pName, size: sizeVal } : x));
  };

  // Add a new empty row and focus its Product field after render
  const addRow = useCallback((afterIndex) => {
    const newItems = [...items, { product: "", size: "", quantity: 1, remarks: "" }];
    setItems(newItems);
    const newRowIndex = newItems.length - 1;
    // Focus the product input of the new row after React renders it
    setTimeout(() => {
      const ref = productRefs.current[newRowIndex];
      if (ref) ref.focus();
    }, 30);
  }, [items]);

  // Keyboard handler for Qty field: Enter or Tab → auto-add next row
  const handleQtyKeyDown = useCallback((e, i) => {
    if (e.key === "Enter" || e.key === "Tab") {
      // Only add new row if this is the last row (avoid duplicates mid-list)
      if (i === items.length - 1) {
        e.preventDefault();
        addRow(i);
      }
    }
  }, [items, addRow]);

  const submit = async () => {
    const normalizedItems = items
      .filter((i) => (i.product || "").trim())
      .map((it) => ({
        ...it,
        product: (it.product || "").trim().toUpperCase(),
        size: (it.size || "").trim(),
        quantity: Number(it.quantity) || 0,
        remarks: it.remarks || "",
      }));
    if (!normalizedItems.length) { toast.error("Add at least one product"); return; }
    if (normalizedItems.some((it) => it.quantity <= 0)) { toast.error("Quantity must be greater than zero"); return; }
    try {
      await api.post("/material-requests", { client_id: clientId, items: normalizedItems, remarks });
      toast.success("Material requested"); onDone();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <Card className="border-slate-200"><CardContent className="p-4 space-y-3">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center border-b border-slate-100 pb-2 md:pb-0 md:border-b-0">
          <div className="col-span-8 md:col-span-4">
            <ProductAutocompleteInput
              value={it.product}
              onChange={(v) => handleProductChange(i, v)}
              products={products}
              placeholder="Product"
              className="h-10 uppercase font-medium"
              testid={`mat-product-${i}`}
              inputRef={(el) => { productRefs.current[i] = el; }}
            />
          </div>
          <Input 
            placeholder="Size" 
            className="col-span-4 md:col-span-2 h-10" 
            value={it.size} 
            onChange={(e) => setItems(items.map((x, idx) => idx === i ? { ...x, size: e.target.value } : x))} 
            data-testid={`mat-size-${i}`} 
          />
          <Input 
            type="number" 
            placeholder="Qty" 
            className="col-span-4 md:col-span-2 h-10" 
            min="1"
            value={it.quantity || ""} 
            onChange={(e) => {
              const val = e.target.value === "" ? "" : Number(e.target.value);
              setItems(items.map((x, idx) => idx === i ? { ...x, quantity: val } : x));
            }}
            onKeyDown={(e) => handleQtyKeyDown(e, i)}
          />
          <Input 
            placeholder="Remarks" 
            className="col-span-6 md:col-span-3 h-10" 
            value={it.remarks} 
            onChange={(e) => setItems(items.map((x, idx) => idx === i ? { ...x, remarks: e.target.value } : x))} 
          />
          <Button 
            size="sm" 
            variant="ghost" 
            className="col-span-2 md:col-span-1 h-10 flex items-center justify-center p-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors" 
            onClick={() => setItems(items.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => setItems([...items, { product: "", size: "", quantity: 1, remarks: "" }])}><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
      <Textarea placeholder="Additional remarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <Button onClick={submit} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="submit-material-req">Submit Request</Button>
    </CardContent></Card>
  );
}

function VerificationForm({ clientId, onDone }) {
  const [photos, setPhotos] = useState({});
  const [inverters, setInverters] = useState([{ serial: "", monitoring_id: "" }]);
  const [gps, setGps] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState("");

  const uploadPhoto = async (e, label) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(label);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "verification");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotos({ ...photos, [label]: data.id }); toast.success(`${label} uploaded`);
    } catch (err) { toast.error(formatApiError(err)); }
    finally { setUploading(""); e.target.value = ""; }
  };

  const captureGps = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not supported"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGps(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`),
      () => toast.error("Could not get location"),
    );
  };

  const submit = async () => {
    const missing = VERIF_PHOTOS.filter(l => !photos[l]);
    if (missing.length > 0) { toast.error(`Missing photos: ${missing.slice(0, 3).join(", ")}…`); return; }
    try {
      await api.post("/verifications", { client_id: clientId, photos, inverters: inverters.filter(i => i.serial), gps, notes });
      toast.success("Verification submitted"); onDone();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Card className="border-slate-200"><CardContent className="p-4 space-y-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Mandatory Photos</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {VERIF_PHOTOS.map((label) => (
            <label key={label} className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${photos[label] ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-blue-400"}`}>
              {photos[label] ? <CheckCircle2 className="w-5 h-5 mx-auto text-emerald-600 mb-1" /> : <Camera className="w-5 h-5 mx-auto text-slate-400 mb-1" />}
              <div className="text-[11px] font-medium text-slate-700">{label}</div>
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => uploadPhoto(e, label)} />
            </label>
          ))}
        </div>
        {uploading && <div className="text-xs text-blue-600 mt-2">Uploading {uploading}…</div>}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Inverters</div>
          <Button size="sm" variant="ghost" onClick={() => setInverters([...inverters, { serial: "", monitoring_id: "" }])}><Plus className="w-3.5 h-3.5 mr-1" /> Add Inverter</Button>
        </div>
        {inverters.map((inv, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 mb-2">
            <Input placeholder="Serial Number" value={inv.serial} onChange={(e) => setInverters(inverters.map((x, idx) => idx === i ? { ...x, serial: e.target.value } : x))} />
            <Input placeholder="Monitoring ID" value={inv.monitoring_id} onChange={(e) => setInverters(inverters.map((x, idx) => idx === i ? { ...x, monitoring_id: e.target.value } : x))} />
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">GPS</Label>
          <div className="flex gap-2 mt-1.5">
            <Input value={gps} onChange={(e) => setGps(e.target.value)} placeholder="lat, lng" />
            <Button variant="outline" onClick={captureGps}><MapPin className="w-4 h-4" /></Button>
          </div>
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Date / Time</Label>
          <Input className="mt-1.5" value={dayjs().format("MMM D, YYYY h:mm A")} readOnly />
        </div>
      </div>

      <Textarea placeholder="Additional notes…" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button onClick={submit} className="w-full bg-emerald-600 hover:bg-emerald-700" data-testid="submit-verification"><Upload className="w-4 h-4 mr-1" /> Submit Verification</Button>
    </CardContent></Card>
  );
}
