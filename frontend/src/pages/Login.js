import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { Sun, Shield, Users, ArrowRight } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [empId, setEmpId] = useState("");
  const [empPw, setEmpPw] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [empLoading, setEmpLoading] = useState(false);

  const onAdminLogin = async (e) => {
    e.preventDefault();
    if (adminLoading) return;          // guard against double-submit
    setAdminLoading(true);
    try {
      await login(adminEmail, adminPw);
      toast.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setAdminLoading(false);
    }
  };

  const onEmpLogin = async (e) => {
    e.preventDefault();
    if (empLoading) return;            // guard against double-submit
    setEmpLoading(true);
    try {
      await login(empId, empPw);
      toast.success("Welcome back!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setEmpLoading(false);
    }
  };


  return (
    <div className="min-h-screen grid md:grid-cols-2">
      {/* Left - Admin */}
      <div className="relative bg-gradient-to-br from-blue-700 via-blue-600 to-blue-800 text-white p-8 md:p-14 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center">
            <Sun className="w-6 h-6" />
          </div>
          <div className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "Outfit" }}>GVP SOLAR ENERGY APP</div>
        </div>

        <div className="my-auto max-w-md">
          <div className="flex items-center gap-2 text-blue-100 text-sm mb-3">
            <Shield className="w-4 h-4" /> Admin / Company Login
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-3" style={{ fontFamily: "Outfit" }}>
            Run your solar business with clarity.
          </h1>
          <p className="text-blue-100/90 mb-8">Manage clients, employees, installations and subsidy progress — all in one place.</p>

          <form onSubmit={onAdminLogin} className="space-y-4" data-testid="admin-login-form">
            <div>
              <Label className="text-blue-50">Email or Mobile</Label>
              <Input
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@yourcompany.com"
                className="bg-white/10 border-white/20 text-white placeholder:text-blue-100/70 mt-1"
                data-testid="admin-email-input"
                required
              />
            </div>
            <div>
              <Label className="text-blue-50">Password</Label>
              <Input
                type="password"
                value={adminPw}
                onChange={(e) => setAdminPw(e.target.value)}
                placeholder="••••••••"
                className="bg-white/10 border-white/20 text-white placeholder:text-blue-100/70 mt-1"
                data-testid="admin-password-input"
                required
              />
            </div>
            <Button type="submit" disabled={adminLoading} className="w-full bg-white text-blue-700 hover:bg-blue-50" data-testid="admin-login-btn">
              {adminLoading ? "Signing in…" : "Login"} <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-blue-100 hover:text-white underline-offset-2 hover:underline" data-testid="forgot-password-link">Forgot Password</Link>
              <Link to="/register" className="text-white font-medium hover:underline" data-testid="create-vendor-link">Create Vendor Account →</Link>
            </div>
          </form>
        </div>
        <div className="text-xs text-blue-100/80">© {new Date().getFullYear()} GVP SOLAR ENERGY APP • Solar CRM</div>
      </div>

      {/* Right - Employee */}
      <div className="bg-white p-8 md:p-14 flex flex-col">
        <div className="ml-auto text-xs text-slate-500">v1.0 • Phase 1</div>
        <div className="my-auto max-w-md mx-auto w-full">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-3">
            <Users className="w-4 h-4" /> Employee Login
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Welcome back, team.</h2>
          <p className="text-slate-500 mb-8 text-sm">For Installers, Supervisors, Inventory Managers, Documentation Team and Office Staff.</p>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <form onSubmit={onEmpLogin} className="space-y-4" data-testid="employee-login-form">
                <div>
                  <Label>Employee ID / Email / Mobile</Label>
                  <Input value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="EMP-2026-XXXXXX" className="mt-1" data-testid="employee-id-input" required />
                </div>
                <div>
                  <Label>Password</Label>
                  <Input type="password" value={empPw} onChange={(e) => setEmpPw(e.target.value)} placeholder="••••••••" className="mt-1" data-testid="employee-password-input" required />
                </div>
                <Button type="submit" disabled={empLoading} className="w-full bg-blue-600 hover:bg-blue-700" data-testid="employee-login-btn">
                  {empLoading ? "Signing in…" : "Login"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-xs text-slate-500 hover:text-blue-600 hover:underline" data-testid="emp-forgot-password-link">Forgot password?</Link>
          </div>

          <div className="mt-8 text-xs text-slate-500">
            Need access? Contact your company admin to create your employee account.
          </div>
        </div>
      </div>
    </div>
  );
}
