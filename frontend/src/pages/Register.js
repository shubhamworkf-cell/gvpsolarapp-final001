import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatApiError } from "@/lib/api";
import { Sun, ArrowLeft } from "lucide-react";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    owner_name: "", company_name: "", mobile: "", alt_mobile: "", email: "", password: "",
    gst_number: "", address: "", city: "", state: "", pincode: "", business_type: "Solar EPC",
  });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      await register(form);
      toast.success("Account created!");
      nav("/dashboard");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center"><Sun className="w-5 h-5" /></div>
            <div className="font-semibold tracking-tight text-lg" style={{ fontFamily: "Outfit" }}>GVP SOLAR ENERGY APP</div>
          </div>
          <Link to="/login" className="text-sm text-slate-600 hover:text-blue-600 flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to login</Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-2" style={{ fontFamily: "Outfit" }}>Create Vendor Account</h1>
        <p className="text-slate-500 mb-8">Register your company account.</p>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6 md:p-8">
            <form onSubmit={submit} className="grid md:grid-cols-2 gap-5" data-testid="vendor-registration-form">
              <Field label="Owner Name *"><Input value={form.owner_name} onChange={set("owner_name")} required data-testid="reg-owner-name" /></Field>
              <Field label="Company Name *"><Input value={form.company_name} onChange={set("company_name")} required data-testid="reg-company-name" /></Field>
              <Field label="Mobile Number *"><Input value={form.mobile} onChange={set("mobile")} required data-testid="reg-mobile" /></Field>
              <Field label="Alternate Mobile"><Input value={form.alt_mobile} onChange={set("alt_mobile")} /></Field>
              <Field label="Email Address *"><Input type="email" value={form.email} onChange={set("email")} required data-testid="reg-email" /></Field>
              <Field label="Password *"><Input type="password" value={form.password} onChange={set("password")} required minLength={6} data-testid="reg-password" /></Field>
              <Field label="GST Number (Optional)"><Input value={form.gst_number} onChange={set("gst_number")} /></Field>
              <Field label="Business Type *">
                <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                  <SelectTrigger data-testid="reg-business-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Solar EPC">Solar EPC</SelectItem>
                    <SelectItem value="Solar Vendor">Solar Vendor</SelectItem>
                    <SelectItem value="EPC + Vendor">EPC + Vendor</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Address" full><Input value={form.address} onChange={set("address")} /></Field>
              <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
              <Field label="State"><Input value={form.state} onChange={set("state")} /></Field>
              <Field label="Pincode"><Input value={form.pincode} onChange={set("pincode")} /></Field>

              <div className="md:col-span-2 mt-2 flex items-center justify-between">
                <Link to="/login" className="text-sm text-slate-500 hover:text-slate-900">Already registered? Login</Link>
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700" data-testid="vendor-submit-btn">
                  {loading ? "Creating…" : "Create Account"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Field = ({ label, children, full }) => (
  <div className={full ? "md:col-span-2" : ""}>
    <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);
