import React, { useState, useEffect } from "react";
import "@/App.css";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientNew from "@/pages/ClientNew";
import ClientDetail from "@/pages/ClientDetail";
import Team from "@/pages/Team";
import Profile from "@/pages/Profile";
import Notifications from "@/pages/Notifications";
import ActivityLog from "@/pages/ActivityLog";
import ProjectExecution from "@/pages/ProjectExecution";
import TaskPortal from "@/pages/TaskPortal";
import Inventory from "@/pages/Inventory";
import DocumentTemplates from "@/pages/DocumentTemplates";
import Quotation from "@/pages/Quotation";
import TaxInvoice from "@/pages/TaxInvoice";
import DeliveryBill from "@/pages/DeliveryBill";
import SalesDocuments from "@/pages/SalesDocuments";
import ClientData from "@/pages/ClientData";
import ClientDataDetail from "@/pages/ClientDataDetail";
import Complaints from "@/pages/Complaints";
import ComplaintDetail from "@/pages/ComplaintDetail";
import ForgotPassword from "@/pages/ForgotPassword";
import Reports from "@/pages/Reports";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-sm max-w-md mx-auto my-12">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Access Denied</h2>
      <p className="text-slate-500 mb-6 text-sm">You do not have permission to view this page. Please contact your administrator if you believe this is an error.</p>
    </div>
  );
}

function PermissionRoute({ page, children }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const hasPerm = isAdmin || user?.permissions?.[page]?.view;
  
  if (!hasPerm) {
    return <AccessDenied />;
  }
  return children;
}

function MainTabShell({ activeTab }) {
  const [visited, setVisited] = useState({
    dashboard: false,
    clients: false,
    projects: false,
    tasks: false,
    inventory: false,
    "client-data": false,
    reports: false,
  });

  useEffect(() => {
    setVisited((prev) => ({ ...prev, [activeTab]: true }));
  }, [activeTab]);

  return (
    <>
      <div style={{ display: activeTab === "dashboard" ? "block" : "none" }}>
        {visited.dashboard && <Dashboard />}
      </div>
      <div style={{ display: activeTab === "clients" ? "block" : "none" }}>
        {visited.clients && <Clients />}
      </div>
      <div style={{ display: activeTab === "projects" ? "block" : "none" }}>
        {visited.projects && <ProjectExecution />}
      </div>
      <div style={{ display: activeTab === "tasks" ? "block" : "none" }}>
        {visited.tasks && <TaskPortal />}
      </div>
      <div style={{ display: activeTab === "inventory" ? "block" : "none" }}>
        {visited.inventory && <Inventory />}
      </div>
      <div style={{ display: activeTab === "client-data" ? "block" : "none" }}>
        {visited["client-data"] && <ClientData />}
      </div>
      <div style={{ display: activeTab === "reports" ? "block" : "none" }}>
        {visited.reports && <Reports />}
      </div>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
          <Route path="/dashboard" element={<Protected><MainTabShell activeTab="dashboard" /></Protected>} />
          <Route path="/clients" element={<Protected><MainTabShell activeTab="clients" /></Protected>} />
          <Route path="/clients/new" element={<Protected><ClientNew /></Protected>} />
          <Route path="/clients/:id" element={<Protected><ClientDetail /></Protected>} />
          <Route path="/team" element={<Protected><Team /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
          <Route path="/activity" element={<Protected><ActivityLog /></Protected>} />
          <Route path="/projects" element={<Protected><MainTabShell activeTab="projects" /></Protected>} />
          <Route path="/tasks" element={<Protected><MainTabShell activeTab="tasks" /></Protected>} />
          <Route path="/inventory" element={<Protected><MainTabShell activeTab="inventory" /></Protected>} />
          <Route path="/templates" element={<Protected><DocumentTemplates /></Protected>} />
          <Route path="/quotation" element={<Protected><PermissionRoute page="sales_documents"><Quotation /></PermissionRoute></Protected>} />
          <Route path="/tax-invoice" element={<Protected><PermissionRoute page="sales_documents"><TaxInvoice /></PermissionRoute></Protected>} />
          <Route path="/delivery-bill" element={<Protected><PermissionRoute page="sales_documents"><DeliveryBill /></PermissionRoute></Protected>} />
          <Route path="/sales-documents" element={<Protected><PermissionRoute page="sales_documents"><SalesDocuments /></PermissionRoute></Protected>} />
          <Route path="/reports" element={<Protected><MainTabShell activeTab="reports" /></Protected>} />
          <Route path="/client-data" element={<Protected><MainTabShell activeTab="client-data" /></Protected>} />
          <Route path="/client-data/:id" element={<Protected><ClientDataDetail /></Protected>} />
          <Route path="/complaints" element={<Protected><Complaints /></Protected>} />
          <Route path="/complaints/:id" element={<Protected><ComplaintDetail /></Protected>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
