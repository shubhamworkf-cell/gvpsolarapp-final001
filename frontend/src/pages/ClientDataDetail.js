import React, { useState, useRef, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useClientDataDetail, useLedger } from "@/hooks/useClientDataHooks";
import { useDeleteClient } from "@/hooks/useClients";
import { usePermission } from "@/lib/permissions";
import { useEmployeeList } from "@/hooks/useTeam";

const STAGES = [
  "Onboarding",
  "Survey",
  "Quotation",
  "Material Delivery",
  "Installation",
  "Document Making",
  "Document Signed",
  "Meter Testing Request",
  "Meter Testing Completed",
  "PM Surya Ghar Upload",
  "MSEDCL Upload",
  "Verification",
  "Handover",
];
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { InverterStatusBadge } from "./ClientData";
import {
  ArrowLeft, Phone, MessageCircle, Download, MapPin, User, FileImage, Image as ImageIcon,
  Plus, Save, Eye, EyeOff, ExternalLink, Calendar, Wrench, AlertTriangle, Paperclip,
  Clock, CheckCircle2, ChevronRight, Activity, Megaphone, ClipboardList,
  Truck, FileText, Gauge, Package, ScrollText, Check, Trash2, Edit3
} from "lucide-react";
import { toast } from "sonner";
import dayjs from "dayjs";
import RaiseComplaintDialog from "@/components/RaiseComplaintDialog";

const TabSkeleton = () => (
  <Card className="border-slate-200 animate-pulse p-8 space-y-4">
    <div className="h-6 w-48 bg-slate-200 rounded" />
    <div className="h-4 w-full bg-slate-100 rounded" />
    <div className="h-4 w-3/4 bg-slate-100 rounded" />
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
      {[1, 2, 3, 4].map(x => <div key={x} className="aspect-square bg-slate-100 rounded-xl" />)}
    </div>
  </Card>
);

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-700 border-slate-200",
  Medium: "bg-blue-50 text-blue-700 border-blue-200",
  High: "bg-amber-50 text-amber-700 border-amber-200",
  Critical: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_STYLES = {
  Open: "bg-blue-50 text-blue-700 border-blue-200",
  Assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
  "In Progress": "bg-amber-50 text-amber-700 border-amber-200",
  "Waiting Parts": "bg-orange-50 text-orange-700 border-orange-200",
  Resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Closed: "bg-slate-100 text-slate-700 border-slate-300",
};

const STATUS_FLOW = ["Open", "Assigned", "In Progress", "Waiting Parts", "Resolved", "Closed"];
const ISSUE_TYPES = ["Inverter Offline", "Low Generation", "Net Meter Issue", "Panel Damage", "Wiring Issue", "Other"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const INV_STATUSES = ["Online", "Offline", "Error", "Maintenance"];

const cleanPhone = (v) => (v || "").replace(/\D/g, "");

export default function ClientDataDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("info");
  const [zoom, setZoom] = useState(null); // file_id of zoomed asset
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState(new Set(["info"]));
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  // TanStack Query calls — load ALL client-related data in parallel
  const { data: clientData, isLoading: clientDataLoading } = useClientDataDetail(id, "all");
  const { data: employees = [], isLoading: employeesLoading } = useEmployeeList();
  const { data: ledger = null, isLoading: ledgerLoading } = useLedger(id);

  const data = clientData;
  const loading = clientDataLoading;

  const c = clientData?.client || {};
  const monitoring = clientData?.monitoring;
  const inverter_status = clientData?.inverter_status;

  const surveys = clientData?.surveys || [];
  const materialDeliveries = clientData?.material_deliveries || [];
  const materialRequests = clientData?.material_requests || [];
  const documents = clientData?.documents || [];
  const meterTestings = clientData?.meter_testings || [];
  const installations = clientData?.installations || [];
  const verifications = clientData?.verifications || [];
  const assets = clientData?.assets || [];
  const highValueAssets = clientData?.high_value_assets || [];
  const tickets = clientData?.tickets || [];
  const tasks = clientData?.tasks || [];
  const inward = clientData?.inward || [];
  const outward = clientData?.outward || [];
  const activityLogs = clientData?.activity_logs || [];

  const canDelete = usePermission("clients", "delete");
  const deleteClientMutation = useDeleteClient();

  const handleOpenEdit = () => {
    setEditForm({
      full_name: c.full_name || "",
      mobile: c.mobile || "",
      alt_mobile: c.alt_mobile || "",
      consumer_number: c.consumer_number || "",
      address: c.address || "",
      city: c.city || "",
      state: c.state || "",
      pincode: c.pincode || "",
      aadhaar: c.aadhaar || "",
      system_kw: c.system_kw || 0,
      panel_make: c.panel_make || "",
      panel_wattage: c.panel_wattage || 0,
      num_panels: c.num_panels || 0,
      inverter_make: c.inverter_make || "",
      inverter_capacity: c.inverter_capacity || "",
      inverter_serial: c.inverter_serial || "",
      phase_type: c.phase_type || "Single Phase",
      subsidy_eligible: c.subsidy_eligible ?? false,
      status: c.status || "Lead",
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    try {
      const payload = {
        ...editForm,
        system_kw: Number(editForm.system_kw) || 0,
        panel_wattage: Number(editForm.panel_wattage) || 0,
        num_panels: Number(editForm.num_panels) || 0,
      };
      await api.put(`/clients/${id}`, payload);
      queryClient.invalidateQueries({ queryKey: ["client-data"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Client details updated successfully");
      setEditOpen(false);
      setEditForm(null);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const handleDeleteClient = () => {
    if (!window.confirm("Are you sure you want to delete this client? This action cannot be undone.")) return;
    deleteClientMutation.mutate(id, {
      onSuccess: () => navigate("/client-data"),
    });
  };

  const handleInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["client-data", id] });
  };

  if (loading) {
    return (
      <div className="space-y-5 animate-pulse">
        <button className="flex items-center gap-1 text-sm text-slate-400" disabled>
          <ArrowLeft className="w-4 h-4" /> Back to Client Data
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-200 shrink-0" />
            <div className="space-y-2">
              <div className="h-6 w-48 bg-slate-200 rounded" />
              <div className="h-4 w-96 bg-slate-100 rounded" />
            </div>
          </div>
        </div>

        <div className="h-10 w-full bg-slate-100 rounded-lg" />

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="border-slate-200 p-5 lg:col-span-2 space-y-4">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            {[1, 2, 3, 4].map(x => <div key={x} className="h-4 w-full bg-slate-100 rounded" />)}
          </Card>
          <Card className="border-slate-200 p-5 space-y-4">
            <div className="h-5 w-40 bg-slate-200 rounded" />
            {[1, 2, 3, 4].map(x => <div key={x} className="h-4 w-full bg-slate-100 rounded" />)}
          </Card>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const phone = cleanPhone(c.mobile);

  return (
    <div className="space-y-5">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900" data-testid="back-btn">
        <ArrowLeft className="w-4 h-4" /> Back to Client Data
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-bold shadow-sm">
            {(c.full_name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>{c.full_name}</h1>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              {c.client_code && <span className="font-mono text-xs px-1.5 py-0.5 bg-slate-100 rounded">{c.client_code}</span>}
              {c.consumer_number && <span>Consumer · {c.consumer_number}</span>}
              {c.city && <span><MapPin className="w-3 h-3 inline mr-1" />{c.city}</span>}
              <InverterStatusBadge status={inverter_status} size="sm" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
            onClick={handleOpenEdit}
            data-testid="edit-client-btn"
          >
            <Edit3 className="w-4 h-4 mr-1.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
            onClick={() => setComplaintOpen(true)}
            data-testid="raise-complaint-btn"
          >
            <Megaphone className="w-4 h-4 mr-1.5" /> Raise Complaint
          </Button>
          {phone && (
            <>
              <a href={`tel:${phone}`}><Button variant="outline" size="sm" data-testid="call-btn"><Phone className="w-4 h-4 mr-1.5" /> Call</Button></a>
              <a href={`https://wa.me/91${phone.length === 10 ? phone : phone.slice(-10)}`} target="_blank" rel="noreferrer">
                <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" data-testid="wa-btn">
                  <MessageCircle className="w-4 h-4 mr-1.5" /> WhatsApp
                </Button>
              </a>
            </>
          )}
          {canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50"
              onClick={handleDeleteClient}
              data-testid="delete-client-btn"
            >
              <Trash2 className="w-4 h-4 mr-1.5" /> Delete Client
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-100 flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="info" data-testid="tab-info"><User className="w-3.5 h-3.5 mr-1.5" /> Basic Info</TabsTrigger>
          <TabsTrigger value="survey" data-testid="tab-survey"><ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Survey Details <Badge variant="outline" className="ml-1.5 text-[10px]">{surveys.length}</Badge></TabsTrigger>
          <TabsTrigger value="material" data-testid="tab-material"><Truck className="w-3.5 h-3.5 mr-1.5" /> Material Delivery <Badge variant="outline" className="ml-1.5 text-[10px]">{materialDeliveries.length}</Badge></TabsTrigger>
          <TabsTrigger value="material_history" data-testid="tab-material-history"><Package className="w-3.5 h-3.5 mr-1.5" /> Material History <Badge variant="outline" className="ml-1.5 text-[10px]">{materialRequests.length}</Badge></TabsTrigger>
          <TabsTrigger value="material_ledger" data-testid="tab-material-ledger"><ScrollText className="w-3.5 h-3.5 mr-1.5" /> Material Ledger</TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents"><FileText className="w-3.5 h-3.5 mr-1.5" /> Documents <Badge variant="outline" className="ml-1.5 text-[10px]">{documents.length}</Badge></TabsTrigger>
          <TabsTrigger value="meter" data-testid="tab-meter"><Gauge className="w-3.5 h-3.5 mr-1.5" /> Meter Testing <Badge variant="outline" className="ml-1.5 text-[10px]">{meterTestings.length}</Badge></TabsTrigger>
          <TabsTrigger value="installation" data-testid="tab-installation"><Wrench className="w-3.5 h-3.5 mr-1.5" /> Installation <Badge variant="outline" className="ml-1.5 text-[10px]">{installations.length}</Badge></TabsTrigger>
          <TabsTrigger value="verification" data-testid="tab-verification"><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Verification <Badge variant="outline" className="ml-1.5 text-[10px]">{verifications.length}</Badge></TabsTrigger>
          <TabsTrigger value="assets" data-testid="tab-assets"><ImageIcon className="w-3.5 h-3.5 mr-1.5" /> Installation Assets <Badge variant="outline" className="ml-1.5 text-[10px]">{assets.length}</Badge></TabsTrigger>
          <TabsTrigger value="hva" data-testid="tab-hva"><Package className="w-3.5 h-3.5 mr-1.5" /> High Value Assets <Badge variant="outline" className="ml-1.5 text-[10px]">{highValueAssets.length}</Badge></TabsTrigger>
          <TabsTrigger value="monitoring" data-testid="tab-monitoring"><Activity className="w-3.5 h-3.5 mr-1.5" /> Inverter Monitoring</TabsTrigger>
          <TabsTrigger value="tickets" data-testid="tab-tickets"><Wrench className="w-3.5 h-3.5 mr-1.5" /> Service Tickets <Badge variant="outline" className="ml-1.5 text-[10px]">{tickets.length}</Badge></TabsTrigger>
          <TabsTrigger value="tasks" data-testid="tab-tasks"><ClipboardList className="w-3.5 h-3.5 mr-1.5" /> Tasks & Team <Badge variant="outline" className="ml-1.5 text-[10px]">{tasks.length}</Badge></TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity"><Activity className="w-3.5 h-3.5 mr-1.5" /> Activity Log <Badge variant="outline" className="ml-1.5 text-[10px]">{activityLogs.length}</Badge></TabsTrigger>
        </TabsList>

        <div style={{ display: tab === "info" ? "block" : "none" }}>
          <BasicInfoSection client={c} />
        </div>
        <div style={{ display: tab === "survey" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <SurveyDetailsSection surveys={surveys} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "material" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <WorkflowDetailsSection title="Material Delivery" icon={Truck} records={materialDeliveries} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "material_history" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <MaterialHistorySection requests={materialRequests} inward={inward} outward={outward} />}
        </div>
        <div style={{ display: tab === "material_ledger" ? "block" : "none" }}>
          {ledgerLoading ? <TabSkeleton /> : <MaterialLedgerSection ledger={ledger} loading={ledgerLoading} />}
        </div>
        <div style={{ display: tab === "documents" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <WorkflowDetailsSection title="Document" icon={FileText} records={documents} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "meter" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <WorkflowDetailsSection title="Meter Testing" icon={Gauge} records={meterTestings} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "installation" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <WorkflowDetailsSection title="Installation" icon={Wrench} records={installations} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "verification" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <WorkflowDetailsSection title="Verification" icon={CheckCircle2} records={verifications} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "assets" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <AssetsSection assets={assets} onZoom={setZoom} />}
        </div>
        <div style={{ display: tab === "hva" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <HighValueAssetsSection assets={highValueAssets} />}
        </div>
        <div style={{ display: tab === "monitoring" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <MonitoringSection clientId={id} monitoring={monitoring} status={inverter_status} onSaved={handleInvalidate} />}
        </div>
        <div style={{ display: tab === "tickets" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <TicketsSection clientId={id} clientName={c.full_name} tickets={tickets} employees={employees} onChanged={handleInvalidate} />}
        </div>
        <div style={{ display: tab === "tasks" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <TasksSection tasks={tasks} loading={loading} />}
        </div>
        <div style={{ display: tab === "activity" ? "block" : "none" }}>
          {loading ? <TabSkeleton /> : <ActivitySection logs={activityLogs} />}
        </div>
      </Tabs>

      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
          {zoom && (
            <div className="relative">
              <img src={fileUrl(zoom.file_id)} alt={zoom.label} className="w-full h-auto max-h-[85vh] object-contain" />
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                <Badge className="bg-black/60 text-white border-none">{zoom.label}</Badge>
                <a href={fileUrl(zoom.file_id)} download target="_blank" rel="noreferrer">
                  <Button size="sm" className="bg-white/95 text-slate-900 hover:bg-white" data-testid="download-asset-btn"><Download className="w-3.5 h-3.5 mr-1.5" /> Download</Button>
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RaiseComplaintDialog
        open={complaintOpen}
        onOpenChange={setComplaintOpen}
        lockedClient={{ id: c.id, full_name: c.full_name }}
        onCreated={() => toast.success("Complaint raised — track it in Complaint Center")}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" data-testid="edit-client-dialog">
          <DialogHeader>
            <DialogTitle>Edit Client Details</DialogTitle>
            <DialogDescription>Modify any client, address, system, panel, or inverter details below.</DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="grid md:grid-cols-2 gap-4 py-3 text-sm">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Full Name</Label>
                <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Mobile Number</Label>
                <Input value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Alternate Mobile</Label>
                <Input value={editForm.alt_mobile} onChange={(e) => setEditForm({ ...editForm, alt_mobile: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Consumer Number</Label>
                <Input value={editForm.consumer_number} onChange={(e) => setEditForm({ ...editForm, consumer_number: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Aadhaar Number</Label>
                <Input value={editForm.aadhaar} onChange={(e) => setEditForm({ ...editForm, aadhaar: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">System Capacity (kW)</Label>
                <Input type="number" step="0.1" value={editForm.system_kw} onChange={(e) => setEditForm({ ...editForm, system_kw: e.target.value })} />
              </div>

              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Address</Label>
                <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">City</Label>
                <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">State</Label>
                <Input value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Pincode</Label>
                <Input value={editForm.pincode} onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Panel Make / Brand</Label>
                <Input value={editForm.panel_make} onChange={(e) => setEditForm({ ...editForm, panel_make: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Panel Wattage (Wp)</Label>
                <Input type="number" value={editForm.panel_wattage} onChange={(e) => setEditForm({ ...editForm, panel_wattage: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Number of Panels</Label>
                <Input type="number" value={editForm.num_panels} onChange={(e) => setEditForm({ ...editForm, num_panels: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Inverter Make / Brand</Label>
                <Input value={editForm.inverter_make} onChange={(e) => setEditForm({ ...editForm, inverter_make: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Inverter Capacity</Label>
                <Input value={editForm.inverter_capacity} onChange={(e) => setEditForm({ ...editForm, inverter_capacity: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Inverter Serial Number</Label>
                <Input value={editForm.inverter_serial} onChange={(e) => setEditForm({ ...editForm, inverter_serial: e.target.value })} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Phase Type</Label>
                <Select value={editForm.phase_type} onValueChange={(val) => setEditForm({ ...editForm, phase_type: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Phase">Single Phase</SelectItem>
                    <SelectItem value="Three Phase">Three Phase</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-600">Subsidy Eligible</Label>
                <Select value={editForm.subsidy_eligible ? "yes" : "no"} onValueChange={(val) => setEditForm({ ...editForm, subsidy_eligible: val === "yes" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Section 1: Basic Info ----------
const InfoRow = ({ label, value }) => (
  <div className="grid grid-cols-3 gap-3 py-2.5 border-b border-slate-100 last:border-0">
    <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</div>
    <div className="col-span-2 text-sm text-slate-900">{value || <span className="text-slate-400 italic">—</span>}</div>
  </div>
);

function BasicInfoSection({ client: c }) {
  const queryClient = useQueryClient();

  const completedCount = React.useMemo(() => {
    if (!c || !c.stages) return 0;
    return STAGES.filter((s) => c.stages?.[s]).length;
  }, [c]);

  const currentStage = React.useMemo(() => {
    if (!c || !c.stages) return "Onboarding";
    const next = STAGES.find((s) => !c.stages?.[s]);
    return next || STAGES[STAGES.length - 1];
  }, [c]);

  const handleToggleStage = async (stage) => {
    if (!c || !c.id) return;
    const currentStages = c.stages || {};
    const isDone = !!currentStages[stage];
    const updatedStages = { ...currentStages, [stage]: !isDone };
    try {
      await api.patch(`/clients/${c.id}/stages`, { stages: updatedStages });
      queryClient.invalidateQueries({ queryKey: ["client-data"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`${stage} ${!isDone ? "marked as completed" : "reset"}`);
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {/* Progress Timeline */}
      <Card className="border-slate-200 col-span-full">
        <CardContent className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Project Progress Timeline</div>
              <div className="text-xs text-slate-500">Current stage, completed steps, and total progress.</div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current Stage</div>
                <div className="text-xs font-semibold text-slate-900">{currentStage}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Completed Steps</div>
                <div className="text-xs font-semibold text-slate-900">{completedCount} / {STAGES.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Total Progress</div>
                <div className="text-xs font-semibold text-blue-600">{c.progress || 0}%</div>
              </div>
            </div>
          </div>

          <div className="relative" data-testid="progress-timeline">
            <div className="hidden sm:block absolute top-7 left-4 right-4 h-0.5 bg-slate-200" />
            <div className="hidden sm:block absolute top-7 left-4 h-0.5 bg-blue-600 transition-all" style={{ width: `calc((100% - 2rem) * ${(c.progress || 0) / 100})` }} />
            <div className="scrollbar-hidden -mx-4 overflow-x-auto px-4 py-2 sm:mx-0 sm:overflow-visible sm:px-0">
              <div className="flex gap-3 min-w-full sm:min-w-0">
                {STAGES.map((s, i) => {
                  const done = !!c.stages?.[s];
                  const isCurrent = currentStage === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleToggleStage(s)}
                      className={`flex min-w-[80px] flex-col items-center rounded-xl border px-2 py-2 text-center text-[10px] transition-all cursor-pointer hover:border-blue-300 hover:bg-blue-50/70 ${done ? "border-blue-200 bg-blue-50/60" : "border-slate-200 bg-white"} ${isCurrent ? "shadow-md border-blue-400 bg-blue-100/70" : ""}`}
                      data-testid={`stage-${s.replace(/\s/g, "-").toLowerCase()}`}
                    >
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${done ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300 text-slate-400"}`}>
                        {done ? <Check className="w-3.5 h-3.5" /> : <span className="text-[10px] font-semibold">{i + 1}</span>}
                      </div>
                      <div className={`mt-1.5 font-medium leading-tight ${done ? "text-slate-900 font-semibold" : "text-slate-600"}`}>{s}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 lg:col-span-2">
        <CardContent className="p-5">
          <div className="text-sm font-semibold text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Customer & Address</div>
          <InfoRow label="Client Name" value={c.full_name} />
          <InfoRow label="Address" value={[c.address, c.city, c.state, c.pincode].filter(Boolean).join(", ")} />
          <InfoRow label="Mobile" value={c.mobile} />
          <InfoRow label="Alternate Mobile" value={c.alt_mobile} />
          <InfoRow label="Consumer Number" value={c.consumer_number} />
          <InfoRow label="Customer Type" value={c.phase_type === "Three Phase" ? "HT (Three Phase)" : "LT (Single Phase)"} />
          <InfoRow label="Installation Date" value={c.install_date ? dayjs(c.install_date).format("DD MMM YYYY") : dayjs(c.updated_at).format("DD MMM YYYY")} />
        </CardContent>
      </Card>
      <Card className="border-slate-200">
        <CardContent className="p-5">
          <div className="text-sm font-semibold text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Solar System</div>
          <InfoRow label="Capacity" value={c.system_kw ? `${c.system_kw} kW` : ""} />
          <InfoRow label="Panel Brand" value={c.panel_make} />
          <InfoRow label="Panel Wp" value={c.panel_wattage ? `${c.panel_wattage} Wp` : ""} />
          <InfoRow label="Number of Panels" value={c.num_panels} />
          <InfoRow label="Inverter Brand" value={c.inverter_make} />
          <InfoRow label="Inverter Capacity" value={c.inverter_capacity} />
          <InfoRow label="Inverter Serial" value={c.inverter_serial} />
        </CardContent>
      </Card>

      {/* Generated Sales Documents (Quotation, Tax Invoice, Delivery Bill) */}
      {c.documents?.length > 0 && (
        <Card className="border-slate-200 col-span-full">
          <CardContent className="p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Sales Documents (Quotations, Invoices, Delivery Bills)</div>
            <div className="grid md:grid-cols-2 gap-3">
              {c.documents.map((d, i) => (
                <a key={i} href={fileUrl(d.id)} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors">
                  <FileText className="w-4 h-4 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{d.label}</div>
                    <div className="text-xs text-slate-500 truncate">{d.filename}</div>
                  </div>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------- Section 2: Installation Assets ----------
function AssetsSection({ assets, onZoom }) {
  if (assets.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-12 text-center text-sm text-slate-500">
          <ImageIcon className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No installation photos uploaded yet. Photos from the field verification (8-photo mandatory set) will appear here automatically.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="assets-grid">
      {assets.map((a, i) => (
        <button
          key={`${a.file_id}-${i}`}
          onClick={() => onZoom(a)}
          className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-blue-400 hover:shadow-md transition"
          data-testid={`asset-${a.file_id}`}
        >
          <img src={fileUrl(a.file_id)} alt={a.label} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent text-white">
            <div className="text-[11px] font-semibold leading-tight truncate">{a.label}</div>
            <div className="text-[9px] opacity-80">{a.source}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

function HighValueAssetsSection({ assets }) {
  if (!assets || assets.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-12 text-center text-sm text-slate-500">
          <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No high-value assets (Solar Panel, Inverter, Battery, etc.) installed for this client yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-slate-200">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider border-b border-slate-200">
                <th className="p-4 font-semibold">Product</th>
                <th className="p-4 font-semibold">Qty</th>
                <th className="p-4 font-semibold">Serial Number</th>
                <th className="p-4 font-semibold">Vendor / Challan</th>
                <th className="p-4 font-semibold">Installation Date</th>
                <th className="p-4 font-semibold">Warranty Status</th>
                <th className="p-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-slate-900">{a.product_name}</div>
                    {a.size_model && <div className="text-xs text-slate-400 mt-0.5">{a.size_model}</div>}
                  </td>
                  <td className="p-4 font-medium text-slate-900">{a.quantity !== undefined && a.quantity !== null ? a.quantity : 1}</td>
                  <td className="p-4 font-mono font-semibold text-xs text-slate-800">{a.serial_number || "—"}</td>
                  <td className="p-4">
                    <div className="text-xs text-slate-900 font-medium">Challan: {a.challan_number || "—"}</div>
                    <div className="text-[11px] text-slate-500">{a.vendor} · {a.purchase_date}</div>
                  </td>
                  <td className="p-4 text-slate-700">{a.installation_date || "—"}</td>
                  <td className="p-4">
                    <span className={`font-semibold text-xs ${a.warranty_status === "Active" ? "text-emerald-600" : "text-rose-600"}`}>
                      {a.warranty_status || "—"}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Section 3: Monitoring ----------
function MonitoringSection({ clientId, monitoring, status, onSaved }) {
  const [form, setForm] = useState(monitoring || { portal_name: "", app_name: "", portal_url: "", plant_id: "", username: "", password: "", inverter_status: "Offline", notes: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/client-data/clients/${clientId}/monitoring`, form);
      setForm(data);
      toast.success("Monitoring saved");
      onSaved?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Card className="border-slate-200 lg:col-span-2">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Monitoring Portal & Credentials</div>
            <InverterStatusBadge status={status} />
          </div>
          <div className="grid md:grid-cols-2 gap-3 text-sm">
            <Field label="Portal Name" value={form.portal_name} onChange={(v) => setForm({ ...form, portal_name: v })} placeholder="e.g. Growatt ShinePhone, SolarEdge, Enphase" testid="mon-portal-name" />
            <Field label="App Name" value={form.app_name} onChange={(v) => setForm({ ...form, app_name: v })} placeholder="e.g. ShinePhone" testid="mon-app-name" />
            <Field label="Portal URL" value={form.portal_url} onChange={(v) => setForm({ ...form, portal_url: v })} placeholder="https://…" testid="mon-portal-url" full />
            <Field label="Plant ID" value={form.plant_id} onChange={(v) => setForm({ ...form, plant_id: v })} testid="mon-plant-id" />
            <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} testid="mon-username" />
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Password</Label>
              <div className="mt-1.5 relative">
                <Input type={showPwd ? "text" : "password"} value={form.password || ""} onChange={(e) => setForm({ ...form, password: e.target.value })} className="pr-10 font-mono" data-testid="mon-password" />
                <button type="button" onClick={() => setShowPwd((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" data-testid="toggle-pwd">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Notes</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" rows={2} />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status</span>
              <Select value={form.inverter_status || "Offline"} onValueChange={(v) => setForm({ ...form, inverter_status: v })}>
                <SelectTrigger className="w-40 h-9" data-testid="mon-status-select"><SelectValue /></SelectTrigger>
                <SelectContent>{INV_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={saving} data-testid="save-monitoring-btn">
              <Save className="w-4 h-4 mr-1.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Quick Open</div>
          {form.portal_url ? (
            <a href={form.portal_url} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full justify-start" data-testid="open-portal-btn"><ExternalLink className="w-4 h-4 mr-2" /> Open {form.portal_name || "Portal"}</Button>
            </a>
          ) : <div className="text-xs text-slate-500">Add a Portal URL above to open it in one click.</div>}
          {monitoring?.updated_at && (
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
              <Clock className="w-3 h-3 inline mr-1" /> Last updated {dayjs(monitoring.updated_at).fromNow()} by {monitoring.updated_by_name}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, testid, full }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
      <Input className="mt-1.5" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} data-testid={testid} />
    </div>
  );
}

// ---------- Section 4: Service Tickets ----------
function TicketsSection({ clientId, clientName, tickets, employees, onChanged }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-slate-500">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""} for {clientName}</div>
        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setCreateOpen(true)} data-testid="create-ticket-btn">
          <Plus className="w-4 h-4 mr-1.5" /> Create Service Ticket
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50/50">
          <CardContent className="p-12 text-center text-sm text-slate-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-300" />
            No service tickets — this client&apos;s system is running smoothly.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="tickets-list">
          {tickets.map((t) => (
            <button key={t.id} onClick={() => setDetail(t)} className="w-full text-left p-4 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm transition" data-testid={`ticket-card-${t.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mt-0.5"><Wrench className="w-4 h-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-[11px] text-slate-500">{t.ticket_no}</span>
                    <Badge variant="outline" className={`${STATUS_STYLES[t.status] || ""} text-[10px]`}>{t.status}</Badge>
                    <Badge variant="outline" className={`${PRIORITY_STYLES[t.priority] || ""} text-[10px]`}>{t.priority}</Badge>
                    <span className="text-[11px] text-slate-400">{t.issue_type}</span>
                  </div>
                  <div className="font-semibold text-slate-900 text-sm truncate">{t.title}</div>
                  {t.description && <div className="text-xs text-slate-500 truncate mt-0.5">{t.description}</div>}
                  <div className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-2">
                    <Clock className="w-3 h-3" /> {dayjs(t.created_at).fromNow()} · by {t.created_by_name}
                    {t.assigned_to_name && <> · <User className="w-3 h-3" /> {t.assigned_to_name}</>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 mt-1" />
              </div>
            </button>
          ))}
        </div>
      )}

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} clientId={clientId} onCreated={onChanged} />
      <TicketDetailDialog ticket={detail} onClose={() => setDetail(null)} onChanged={() => { setDetail(null); onChanged?.(); }} employees={employees} />
    </div>
  );
}

function CreateTicketDialog({ open, onOpenChange, clientId, onCreated }) {
  const [form, setForm] = useState({ title: "", issue_type: "Inverter Offline", description: "", priority: "Medium" });
  const [files, setFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => { setForm({ title: "", issue_type: "Inverter Offline", description: "", priority: "Medium" }); setFiles([]); };
  const close = (v) => { if (!v) reset(); onOpenChange(v); };

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      // upload attachments first
      const attachments = [];
      for (const f of files) {
        const fd = new FormData(); fd.append("file", f);
        const r = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        attachments.push({ file_id: r.data.id, filename: r.data.original_filename || f.name, content_type: f.type || "" });
      }
      await api.post("/service-tickets", { client_id: clientId, ...form, attachments });
      toast.success("Service ticket created");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl" data-testid="create-ticket-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>New Service Ticket</DialogTitle>
          <DialogDescription className="text-xs">Capture the issue with as much detail as possible. Engineer can be assigned after creation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Field label="Ticket Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="Short summary of the issue" testid="ticket-title" full />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Issue Type</Label>
              <Select value={form.issue_type} onValueChange={(v) => setForm({ ...form, issue_type: v })}>
                <SelectTrigger className="mt-1.5" data-testid="ticket-issue-type"><SelectValue /></SelectTrigger>
                <SelectContent>{ISSUE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger className="mt-1.5" data-testid="ticket-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Description</Label>
            <Textarea className="mt-1.5" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's happening? Any error codes / red LEDs / generation drops?" data-testid="ticket-description" />
          </div>
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachments (optional)</Label>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files || [])])} data-testid="ticket-files-input" />
            <div className="mt-1.5 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <Badge key={i} variant="outline" className="bg-slate-50 text-slate-700 max-w-[200px]">
                  <Paperclip className="w-3 h-3 mr-1" /> <span className="truncate">{f.name}</span>
                  <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="ml-1.5 text-slate-400 hover:text-red-600">×</button>
                </Badge>
              ))}
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="h-7" data-testid="add-attachment-btn">
                <Paperclip className="w-3 h-3 mr-1" /> Add file
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={submitting} data-testid="submit-ticket-btn">
            {submitting ? "Creating…" : "Create Ticket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetailDialog({ ticket, onClose, onChanged, employees }) {
  const [t, setT] = useState(ticket);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setT(ticket); setNote(""); }, [ticket]);
  if (!t) return null;

  const update = async (patch) => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/service-tickets/${t.id}`, patch);
      setT(data);
      toast.success("Ticket updated");
      onChanged?.();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const idx = STATUS_FLOW.indexOf(t.status);

  return (
    <Dialog open={!!ticket} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 overflow-hidden" data-testid="ticket-detail-dialog">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center"><Wrench className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <DialogTitle style={{ fontFamily: "Outfit" }} className="truncate">{t.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="font-mono text-[11px] text-slate-500">{t.ticket_no}</span>
                <Badge variant="outline" className={`${STATUS_STYLES[t.status] || ""} text-[10px]`}>{t.status}</Badge>
                <Badge variant="outline" className={`${PRIORITY_STYLES[t.priority] || ""} text-[10px]`}>{t.priority}</Badge>
                <span className="text-[11px] text-slate-500">{t.issue_type}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Status pipeline */}
          <div className="flex items-center justify-between gap-1 text-[10px] font-semibold tabular-nums">
            {STATUS_FLOW.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex-1 rounded-md py-1.5 text-center transition ${i <= idx ? (s === "Closed" ? "bg-slate-300 text-slate-900" : "bg-blue-600 text-white") : "bg-slate-100 text-slate-400"}`}>{s}</div>
                {i < STATUS_FLOW.length - 1 && <div className={`h-px w-2 ${i < idx ? "bg-blue-600" : "bg-slate-200"}`} />}
              </React.Fragment>
            ))}
          </div>

          {t.description && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-sm text-slate-700">{t.description}</div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</Label>
              <Select value={t.status} onValueChange={(v) => update({ status: v })}>
                <SelectTrigger className="mt-1.5 h-9" data-testid="td-status"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS_FLOW.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Priority</Label>
              <Select value={t.priority} onValueChange={(v) => update({ priority: v })}>
                <SelectTrigger className="mt-1.5 h-9" data-testid="td-priority"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Assigned Engineer</Label>
              <Select value={t.assigned_to || "__unassigned__"} onValueChange={(v) => update({ assigned_to: v === "__unassigned__" ? "" : v })}>
                <SelectTrigger className="mt-1.5 h-9" data-testid="td-assignee"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__unassigned__" className="italic text-slate-500">— Unassigned —</SelectItem>
                  {employees.filter((e) => e.status === "Active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.name} <span className="text-[10px] text-slate-400 ml-1">· {e.role}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {t.attachments?.length > 0 && (
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Attachments</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {t.attachments.map((a, i) => (
                  <a key={i} href={fileUrl(a.file_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-xs hover:border-blue-300 hover:bg-blue-50">
                    {(a.content_type || "").startsWith("image/") ? <FileImage className="w-3.5 h-3.5 text-blue-600" /> : <Paperclip className="w-3.5 h-3.5 text-slate-500" />}
                    <span className="truncate max-w-[200px]">{a.filename}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Resolution */}
          {(t.status === "Resolved" || t.status === "Closed") && (
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resolution</Label>
              <Textarea value={t.resolution || ""} onChange={(e) => setT({ ...t, resolution: e.target.value })} placeholder="Root cause + fix applied…" className="mt-1.5" rows={3} />
              <Button size="sm" className="mt-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => update({ resolution: t.resolution })} data-testid="save-resolution-btn">Save Resolution</Button>
            </div>
          )}

          {/* Timeline */}
          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Service History</Label>
            <div className="mt-2 space-y-2" data-testid="ticket-timeline">
              {(t.timeline || []).slice().reverse().map((e, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900">{e.action}</div>
                    {e.note && <div className="text-xs text-slate-600 mt-0.5">{e.note}</div>}
                    <div className="text-[10px] text-slate-400 mt-0.5">{dayjs(e.ts).format("DD MMM YYYY · HH:mm")} · {e.user_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick note */}
          <div className="border-t border-slate-200 pt-3">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Add quick note</Label>
            <div className="mt-1.5 flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Engineer reached site, awaiting inverter restart" data-testid="td-note-input" />
              <Button onClick={() => { if (note.trim()) { update({ note }); setNote(""); } }} disabled={!note.trim() || saving} data-testid="td-add-note-btn">Add</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SurveyDetailsSection({ surveys, onZoom }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!surveys || surveys.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-12 text-center text-sm text-slate-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          No survey reports submitted for this client yet.
        </CardContent>
      </Card>
    );
  }

  const s = surveys[selectedIdx];
  const details = s.details || {};
  const checklist = details.checklist || [];
  const photos = details.photos || {};
  const photoEntries = Object.entries(photos);

  return (
    <div className="space-y-4">
      {surveys.length > 1 && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Survey:</Label>
          <Select value={String(selectedIdx)} onValueChange={(val) => setSelectedIdx(Number(val))}>
            <SelectTrigger className="w-[260px] bg-white">
              <SelectValue placeholder="Choose survey report" />
            </SelectTrigger>
            <SelectContent>
              {surveys.map((item, idx) => (
                <SelectItem key={item.id} value={String(idx)}>
                  {dayjs(item.details?.submitted_at || item.created_at).format("DD MMM YYYY HH:mm")} · By {item.details?.assigned_to_name || "Employee"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left column: Info + Checklist */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Survey Information</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                <InfoRow label="Survey Date" value={details.submitted_at ? dayjs(details.submitted_at).format("DD MMM YYYY HH:mm") : dayjs(s.created_at).format("DD MMM YYYY")} />
                <InfoRow label="Survey By" value={details.assigned_to_name || "Survey Engineer"} />
                <InfoRow label="Assigned By" value={details.assigned_by_name || "Admin"} />
                <InfoRow label="Survey Status" value={<Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs py-0.5">{details.task_status || "Completed"}</Badge>} />
                <InfoRow label="GPS Location" value={
                  details.gps ? (
                    <div className="flex items-center gap-2">
                      <span>{details.gps}</span>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${details.gps}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center text-xs">
                        Map <ExternalLink className="w-3 h-3 ml-0.5" />
                      </a>
                    </div>
                  ) : null
                } />
                <InfoRow label="Manual Location" value={details.manual_location} />
                <InfoRow label="Uploaded Photos" value={`${photoEntries.length} Photos`} />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Survey Notes</div>
                <div className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[60px] whitespace-pre-wrap">
                  {details.notes || <span className="text-slate-400 italic">No notes provided.</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Photos section */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Photo Gallery</div>
              {photoEntries.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">No survey photos uploaded.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {photoEntries.map(([label, val]) => {
                    const fileId = typeof val === "string" ? val : val.file_id;
                    const note = typeof val === "object" ? val.note : "";
                    const photoGps = typeof val === "object" ? val.gps : "";
                    const captureTime = typeof val === "object" ? val.capture_time : "";
                    const uploadedBy = typeof val === "object" ? val.uploaded_by : "";

                    return (
                      <div
                        key={label}
                        className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 flex flex-col justify-between"
                      >
                        <button
                          type="button"
                          onClick={() => onZoom({ file_id: fileId, label: `Survey - ${label}` })}
                          className="relative aspect-video w-full overflow-hidden bg-slate-100 hover:opacity-95 transition"
                        >
                          <img src={fileUrl(fileId)} alt={label} loading="lazy" className="w-full h-full object-cover" />
                          <div className="absolute top-2 left-2">
                            <Badge className="bg-black/60 text-white border-none text-[9px]">{label}</Badge>
                          </div>
                        </button>
                        <div className="p-2.5 space-y-1.5 bg-white flex-1 flex flex-col justify-between">
                          <div className="text-xs text-slate-700 leading-normal font-normal">
                            {note ? (
                              <span className="text-slate-800 font-medium">“{note}”</span>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No photo note</span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-400 space-y-0.5 border-t border-slate-100/80 pt-1.5 font-mono">
                            {photoGps && <div className="flex items-center"><MapPin className="w-2.5 h-2.5 mr-1" /> {photoGps}</div>}
                            {captureTime && <div className="flex items-center"><Clock className="w-2.5 h-2.5 mr-1" /> {dayjs(captureTime).format("DD MMM YYYY HH:mm")}</div>}
                            {uploadedBy && <div className="flex items-center"><User className="w-2.5 h-2.5 mr-1" /> {uploadedBy}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Checklist */}
        <Card className="border-slate-200 h-fit">
          <CardContent className="p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Submitted Checklist</div>
            {checklist.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-6 text-center">No checklist completed.</div>
            ) : (
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <div
                    key={`${item.label}-${idx}`}
                    className={`flex items-center justify-between border rounded-xl px-3 py-2 text-sm ${item.checked ? "border-emerald-200 bg-emerald-50/50 text-emerald-900" : "border-slate-100 bg-slate-50/30 text-slate-500"}`}
                  >
                    <span className="font-medium leading-tight">{item.label}</span>
                    {item.checked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 shrink-0 ml-2 uppercase">Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkflowDetailsSection({ title, icon: Icon, records = [], onZoom }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (!records || records.length === 0) {
    return (
      <Card className="border-dashed border-slate-300 bg-slate-50/50">
        <CardContent className="p-12 text-center text-sm text-slate-500">
          {Icon && <Icon className="w-10 h-10 mx-auto mb-2 text-slate-300" />}
          No {title.toLowerCase()} reports submitted for this client yet.
        </CardContent>
      </Card>
    );
  }

  const s = records[selectedIdx];
  const details = s.details || {};
  const checklist = details.checklist || [];
  
  // Extract attachments from the records
  // Attachments can be in details.attachments (object) or derived from details.checklist
  const attachments = [];
  
  // 1. Direct attachments dict
  if (details.attachments) {
    Object.entries(details.attachments).forEach(([label, val]) => {
      const fileId = typeof val === "string" ? val : (val?.file_id || "");
      if (fileId) {
        attachments.push({ label, fileId });
      }
    });
  }
  
  // 2. Checklist-based uploads
  checklist.forEach((item) => {
    if (item.file_id) {
      attachments.push({
        label: `Signed - ${item.label}`,
        fileId: item.file_id,
        filename: item.filename
      });
    }
  });

  return (
    <div className="space-y-4">
      {records.length > 1 && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Submission:</Label>
          <Select value={String(selectedIdx)} onValueChange={(val) => setSelectedIdx(Number(val))}>
            <SelectTrigger className="w-[260px] bg-white">
              <SelectValue placeholder="Choose report" />
            </SelectTrigger>
            <SelectContent>
              {records.map((item, idx) => (
                <SelectItem key={item.id || idx} value={String(idx)}>
                  {dayjs(item.details?.completed_date || item.created_at).format("DD MMM YYYY HH:mm")} · By {item.details?.completed_by || "Employee"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left/Main Column: Info + Notes + Attachments */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>{title} Info</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                <InfoRow
                  label="Completed Date"
                  value={details.completed_date ? dayjs(details.completed_date).format("DD MMM YYYY HH:mm") : dayjs(s.created_at).format("DD MMM YYYY")}
                />
                <InfoRow label="Completed By" value={details.completed_by || "Employee"} />
                <InfoRow label="Assigned By" value={details.assigned_by || "Admin"} />
                <InfoRow label="Status" value={<Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 text-xs py-0.5">{details.task_status || "Completed"}</Badge>} />
              </div>

              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Notes / Remarks</div>
                <div className="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 border border-slate-100 min-h-[60px] whitespace-pre-wrap">
                  {details.notes || <span className="text-slate-400 italic">No notes provided.</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachments Section */}
          <Card className="border-slate-200">
            <CardContent className="p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Uploaded Attachments / Files</div>
              {attachments.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-6 text-center">No files uploaded.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {attachments.map(({ label, fileId, filename }) => {
                    return (
                      <div
                        key={fileId}
                        className="group border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 flex flex-col justify-between"
                      >
                        <button
                          type="button"
                          onClick={() => onZoom({ file_id: fileId, label: label })}
                          className="relative aspect-video w-full overflow-hidden bg-slate-100 hover:opacity-95 transition flex items-center justify-center"
                        >
                          <img src={fileUrl(fileId)} alt={label} loading="lazy" className="w-full h-full object-cover error-fallback-hidden" onError={(e) => {
                            e.target.style.display = "none";
                          }} />
                          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-slate-400">
                            <Paperclip className="w-8 h-8" />
                          </div>
                          <div className="absolute top-2 left-2">
                            <Badge className="bg-black/60 text-white border-none text-[9px] truncate max-w-[140px]">{label}</Badge>
                          </div>
                        </button>
                        <div className="p-2.5 bg-white flex flex-col justify-between">
                          <div className="text-xs text-slate-700 leading-normal font-medium truncate">
                            {filename || label}
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono mt-1">
                            <a href={fileUrl(fileId)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                              Download File
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Checklist */}
        <Card className="border-slate-200 h-fit">
          <CardContent className="p-5">
            <div className="text-sm font-semibold text-slate-900 mb-3" style={{ fontFamily: "Outfit" }}>Completed Checklist</div>
            {checklist.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-6 text-center">No checklist completed.</div>
            ) : (
              <div className="space-y-2">
                {checklist.map((item, idx) => (
                  <div
                    key={`${item.label}-${idx}`}
                    className={`flex items-center justify-between border rounded-xl px-3 py-2 text-sm ${item.checked ? "border-emerald-200 bg-emerald-50/50 text-emerald-900" : "border-slate-100 bg-slate-50/30 text-slate-500"}`}
                  >
                    <span className="font-medium leading-tight">{item.label}</span>
                    {item.checked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 ml-2" />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400 shrink-0 ml-2 uppercase">Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MaterialHistorySection({ requests, inward = [], outward = [] }) {
  return (
    <div className="space-y-4">
      {/* Material Requests History */}
      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-4">
          <div className="text-sm font-semibold text-slate-900">Material Requests History</div>
          {(!requests || requests.length === 0) ? (
            <div className="text-xs text-slate-500 italic">No material requests found for this client.</div>
          ) : (
            <div className="space-y-4">
              {requests.map((m) => {
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
                  <div key={m.id} className="border border-slate-100 rounded-lg p-3 space-y-3" data-testid={`material-req-history-${m.id}`}>
                    <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-semibold">{m.request_no || "—"}</span>
                          <Badge variant="outline" className={
                            m.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                            m.status === "partial_approved" ? "bg-amber-50 text-amber-700 border-amber-200" :
                            m.status === "rejected" ? "bg-red-50 text-red-700 border-red-200" :
                            "bg-slate-100 text-slate-700 border-slate-200"
                          }>{(m.status || "pending").replace("_", " ").toUpperCase()}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">Requested by {m.requested_by_name} · {dayjs(m.created_at).format("MMM D, YYYY h:mm A")}</div>
                      </div>
                      <div className="text-xs text-slate-600 font-medium text-right">
                        <div>Approved Qty: <span className="text-slate-900 font-semibold">{totalApproved}</span></div>
                        <div>Pending Qty: <span className="text-slate-900 font-semibold">{totalPending}</span></div>
                      </div>
                    </div>

                    {m.remarks && (
                      <div className="text-xs bg-slate-50 rounded-md p-2 text-slate-700">
                        <strong>Remarks:</strong> {m.remarks}
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                            <th className="text-left py-1.5 pr-2">Product</th>
                            <th className="text-right py-1.5 px-2">Requested</th>
                            <th className="text-right py-1.5 px-2">Approved</th>
                            <th className="text-right py-1.5 pl-2">Pending</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(m.items || []).map((it, idx) => {
                            const requested = Number(it.quantity || 0);
                            const approved = it.approved_quantity != null ? Number(it.approved_quantity) : (m.status === "approved" ? requested : 0);
                            const pending = m.status === "pending" ? requested : Math.max(0, requested - approved);
                            return (
                              <tr key={idx} className="border-b border-slate-50 last:border-0">
                                <td className="py-2 pr-2 text-slate-700 font-medium">{it.product} {it.size && <span className="text-slate-400 font-normal">({it.size})</span>}</td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-600">{requested}</td>
                                <td className="py-2 px-2 text-right tabular-nums text-slate-600">{approved}</td>
                                <td className="py-2 pl-2 text-right tabular-nums text-slate-600">{pending}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {m.delivery && (
                      <div className="border-t border-slate-100 pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 bg-slate-50/50 p-2.5 rounded-lg">
                        <div><span className="text-slate-400 uppercase tracking-wider text-[9px] block">Challan No</span><span className="font-semibold text-slate-900">{m.delivery.challan_number || "—"}</span></div>
                        <div><span className="text-slate-400 uppercase tracking-wider text-[9px] block">Vehicle No</span><span className="font-semibold text-slate-900">{m.delivery.vehicle_number || "—"}</span></div>
                        <div><span className="text-slate-400 uppercase tracking-wider text-[9px] block">Driver</span><span className="font-semibold text-slate-900">{m.delivery.driver_name || "—"}</span></div>
                        <div><span className="text-slate-400 uppercase tracking-wider text-[9px] block">Delivery Date</span><span className="font-semibold text-slate-900">{m.delivery.delivery_date ? dayjs(m.delivery.delivery_date).format("MMM D, YYYY") : "—"}</span></div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outward Dispatch Transactions */}
      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Outward Dispatch History</div>
          {(!outward || outward.length === 0) ? (
            <div className="text-xs text-slate-500 italic">No outward dispatches recorded for this client.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-2.5 font-semibold">Product</th>
                    <th className="p-2.5 font-semibold text-right">Qty</th>
                    <th className="p-2.5 font-semibold">Challan / Ref</th>
                    <th className="p-2.5 font-semibold">Date</th>
                    <th className="p-2.5 font-semibold">Status</th>
                    <th className="p-2.5 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outward.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-semibold text-slate-800">{o.product} {o.size && <span className="text-slate-400 font-normal">({o.size})</span>}</td>
                      <td className="p-2.5 text-right font-medium text-slate-800">{o.quantity} {o.unit}</td>
                      <td className="p-2.5 font-mono">{o.outward_challan_no || o.reference_number || "—"}</td>
                      <td className="p-2.5 text-slate-600">{dayjs(o.date).format("DD MMM YYYY")}</td>
                      <td className="p-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-100">
                          {o.status || "Dispatched"}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-500 truncate max-w-xs">{o.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Inward Returns Transactions */}
      <Card className="border-slate-200">
        <CardContent className="p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-900">Inward Returns History</div>
          {(!inward || inward.length === 0) ? (
            <div className="text-xs text-slate-500 italic">No returns recorded from this client.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-200">
                    <th className="p-2.5 font-semibold">Product</th>
                    <th className="p-2.5 font-semibold text-right">Qty</th>
                    <th className="p-2.5 font-semibold">Challan / Ref</th>
                    <th className="p-2.5 font-semibold">Date</th>
                    <th className="p-2.5 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inward.map((i) => (
                    <tr key={i.id} className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-semibold text-slate-800">{i.product} {i.size && <span className="text-slate-400 font-normal">({i.size})</span>}</td>
                      <td className="p-2.5 text-right font-medium text-slate-800">{i.quantity} {i.unit}</td>
                      <td className="p-2.5 font-mono">{i.reference_number || "—"}</td>
                      <td className="p-2.5 text-slate-600">{dayjs(i.date).format("DD MMM YYYY")}</td>
                      <td className="p-2.5 text-slate-500 truncate max-w-xs">{i.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MaterialLedgerSection({ ledger, loading }) {
  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Loading ledger…</div>;
  if (!ledger || !ledger.items || ledger.items.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-10 text-center text-slate-500 text-sm">
          No material ledger records found for this client.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-900">Client Material Ledger</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs border-separate border-spacing-0">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Product</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Size</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Unit</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Total Outward</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Total Returned</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Current Balance</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Last Movement Date</th>
                <th className="px-4 py-3 border border-slate-200 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {ledger.items.map((row, idx) => {
                let statusColor = "text-slate-700";
                let balanceColor = "text-slate-900 font-semibold";
                if (row.current_balance < 0) {
                  statusColor = "text-red-600 font-semibold";
                  balanceColor = "text-red-600 font-semibold bg-red-50 px-1.5 py-0.5 rounded";
                } else if (row.current_balance === 0) {
                  statusColor = "text-slate-400";
                  balanceColor = "text-slate-400";
                }

                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border border-slate-200 font-medium text-slate-900">{row.product}</td>
                    <td className="px-4 py-3 border border-slate-200 text-slate-600">{row.size || "—"}</td>
                    <td className="px-4 py-3 border border-slate-200 text-slate-600">{row.unit}</td>
                    <td className="px-4 py-3 border border-slate-200 font-medium text-slate-700">{row.total_outward}</td>
                    <td className="px-4 py-3 border border-slate-200 font-medium text-slate-700">{row.total_returned}</td>
                    <td className={`px-4 py-3 border border-slate-200 ${balanceColor}`}>{row.current_balance}</td>
                    <td className="px-4 py-3 border border-slate-200 text-slate-500">{row.last_movement_date || "—"}</td>
                    <td className={`px-4 py-3 border border-slate-200 ${statusColor}`}>{row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TasksSection({ tasks, loading }) {
  if (loading) return <div className="py-20 text-center text-sm text-slate-500">Loading tasks…</div>;
  if (!tasks || tasks.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center text-slate-500">
          No tasks found for this client.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-900">Assigned Tasks & Execution</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                <th className="p-3 font-semibold">Task Type</th>
                <th className="p-3 font-semibold">Assigned Employee</th>
                <th className="p-3 font-semibold">Assigned By</th>
                <th className="p-3 font-semibold">Deadline</th>
                <th className="p-3 font-semibold">Priority</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-900">{t.task_type}</td>
                  <td className="p-3 text-slate-700">{t.assigned_to_name || "—"}</td>
                  <td className="p-3 text-slate-500">{t.assigned_by_name || "—"}</td>
                  <td className="p-3 text-slate-600">{t.deadline || "—"}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${PRIORITY_STYLES[t.priority] || "bg-slate-100"}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={
                      t.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      t.status === "in_progress" ? "bg-blue-50 text-blue-700 border-blue-200" :
                      "bg-amber-50 text-amber-700 border-amber-200"
                    }>
                      {t.status === "in_progress" ? "IN PROGRESS" : t.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="p-3 text-slate-600 max-w-xs truncate">{t.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivitySection({ logs }) {
  if (!logs || logs.length === 0) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-8 text-center text-slate-500">
          No activity logs found for this client.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5 space-y-4">
        <div className="text-sm font-semibold text-slate-900">Client Activity Log</div>
        <div className="relative border-l border-slate-200 pl-4 space-y-4 ml-2">
          {logs.map((l) => (
            <div key={l.id} className="relative">
              <div className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-blue-500 ring-4 ring-white" />
              <div className="text-xs text-slate-500">{dayjs(l.created_at).format("DD MMM YYYY · h:mm A")}</div>
              <div className="text-sm font-medium text-slate-800 mt-0.5">{l.action}</div>
              <div className="text-xs text-slate-600 mt-0.5">By {l.user_name}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

