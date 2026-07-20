import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Sun, LayoutDashboard, Users2, UserCog, Building2, ScrollText, LogOut, Briefcase, ClipboardList, Boxes, FileText, LifeBuoy, Megaphone, Menu, X, Wrench } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";
import ProfileMenu from "@/components/ProfileMenu";
import { Button } from "@/components/ui/button";

export default function Layout({ children }) {
  const { user, company, logout } = useAuth();
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin = user?.role === "Admin";
  const allowed = (page) => isAdmin || user?.permissions?.[page]?.view;
  const ALWAYS_VISIBLE = new Set(["complaints", "reports"]);

  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
    { to: "/clients", label: "Clients", icon: Users2, key: "clients" },
    { to: "/projects", label: "Project Execution", icon: Briefcase, key: "project_execution" },
    { to: "/tasks", label: "Task Portal", icon: ClipboardList, key: "task_portal" },
    { to: "/inventory", label: "Data Management", icon: Boxes, key: "data_management" },
    { to: "/client-data", label: "Client Data", icon: LifeBuoy, key: "client_data" },
    { to: "/reports", label: "Reports", icon: ScrollText, key: "reports" },
    { to: "/sales-documents", label: "Sales Documents", icon: FileText, key: "sales_documents" },
    { to: "/complaints", label: "Complaint Center", icon: Megaphone, key: "complaints" },
    { to: "/templates", label: "Document Templates", icon: FileText, key: "documents" },
    { to: "/team", label: "Team & Access", icon: UserCog, key: "team", adminOnly: true },
    { to: "/profile", label: "Company Details", icon: Building2, key: "settings", adminOnly: true },
    { to: "/activity", label: "Activity Log", icon: ScrollText, key: "settings", adminOnly: true },
  ].filter((i) => {
    if (i.adminOnly) return isAdmin;
    return ALWAYS_VISIBLE.has(i.key) || allowed(i.key);
  });

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center">
          <Sun className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold tracking-tight text-slate-900" style={{ fontFamily: "Outfit" }}>GVP SOLAR ENERGY APP</div>
          <div className="text-[11px] text-slate-500 truncate max-w-[140px]">{company?.company_name || "Solar CRM"}</div>
        </div>
        {/* Close button — only visible on mobile */}
        <button
          className="ml-auto lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.icon;
          const active = pathname.startsWith(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              data-testid={`nav-${it.key}`}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <div className="px-3 py-2 text-xs text-slate-500">
          <div className="font-medium text-slate-900 truncate">{user?.name}</div>
          <div className="truncate">{user?.role}</div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-slate-600"
          onClick={async () => { await logout(); nav("/login"); }}
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4" /> Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on desktop, slide-in on mobile */}
      <aside
        className={`fixed lg:sticky top-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ease-in-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:translate-x-0`}
        data-testid="sidebar"
      >
        <SidebarContent />
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
          <div className="px-4 lg:px-8 py-3 flex items-center justify-between gap-4">
            {/* Hamburger — only shown on mobile */}
            <button
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="ml-auto flex items-center gap-3">
              <NotificationBell />
              <ProfileMenu />
            </div>
          </div>
        </header>

        <div className="px-4 lg:px-8 py-4 lg:py-6 overflow-x-hidden">{children}</div>
      </main>
    </div>
  );
}
