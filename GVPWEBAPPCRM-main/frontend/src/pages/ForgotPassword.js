import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Sun, MailCheck, KeyRound, CheckCircle2, Loader2 } from "lucide-react";

const STEPS = ["email", "otp", "password", "done"];

export default function ForgotPassword() {
  const nav = useNavigate();
  const [step, setStep] = useState("email"); // 'email' | 'otp' | 'password' | 'done'
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [pw, setPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const sendOtp = async (resend = false) => {
    if (!email.trim()) { toast.error("Enter your email"); return; }
    if (busy) return;                           // prevent double-fire
    if (resendCountdown > 0) return;            // countdown still running
    setBusy(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      toast.success(resend ? "OTP re-sent" : "Check your inbox — code is on the way");
      setResendCountdown(60);                   // 60s cooldown (Supabase rate limit is ~3/hr)
      if (!resend) setStep("otp");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { email: email.trim(), otp });
      setResetToken(data.reset_token);
      setStep("password");
      toast.success("Code verified");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const resetPassword = async () => {
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (pw !== pwConfirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { reset_token: resetToken, new_password: pw });
      setStep("done");
      toast.success("Password updated");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const currentIdx = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center"><Sun className="w-5 h-5" /></div>
          <div className="text-xl font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>GVP SOLAR ENERGY APP</div>
        </div>

        <Card className="border-slate-200 shadow-lg" data-testid="forgot-password-card">
          <CardContent className="p-6 md:p-8 space-y-6">
            <div>
              <Link to="/login" className="text-xs text-slate-500 hover:text-blue-600 inline-flex items-center gap-1" data-testid="back-to-login"><ArrowLeft className="w-3 h-3" /> Back to login</Link>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-3" style={{ fontFamily: "Outfit" }}>Reset your password</h1>
              <p className="text-sm text-slate-500 mt-1">We&apos;ll email you a 6-digit code to verify it&apos;s really you.</p>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-3 flex-wrap">
              <StepDot idx={0} label="Email" currentIdx={currentIdx} />
              <div className="flex-1 h-px bg-slate-200" />
              <StepDot idx={1} label="OTP" currentIdx={currentIdx} />
              <div className="flex-1 h-px bg-slate-200" />
              <StepDot idx={2} label="New Password" currentIdx={currentIdx} />
            </div>

            {step === "email" && (
              <form onSubmit={(e) => { e.preventDefault(); sendOtp(false); }} className="space-y-4" data-testid="step-email">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="mt-1.5" required data-testid="fp-email" autoFocus />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy || resendCountdown > 0} data-testid="fp-send-otp">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MailCheck className="w-4 h-4 mr-2" />}
                  {busy ? "Sending…" : "Send OTP"}
                </Button>
                <div className="text-[11px] text-slate-400 text-center">For security, we always show this success message even if the email isn&apos;t registered.</div>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={(e) => { e.preventDefault(); verifyOtp(); }} className="space-y-4" data-testid="step-otp">
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-900">
                  <MailCheck className="w-3.5 h-3.5 inline mr-1.5" /> Code sent to <span className="font-semibold">{email}</span>. It expires in 10 minutes.
                </div>
                <OtpInput value={otp} onChange={setOtp} testId="fp-otp" />
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy || otp.length !== 6} data-testid="fp-verify-otp">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                  {busy ? "Verifying…" : "Verify Code"}
                </Button>
                <div className="text-xs text-slate-500 text-center">
                  Didn&apos;t get the code?{" "}
                  {resendCountdown > 0 ? (
                    <span className="text-slate-400">Resend in {resendCountdown}s</span>
                  ) : (
                    <button type="button" onClick={() => sendOtp(true)} className="text-blue-600 hover:underline" data-testid="fp-resend-otp">Resend</button>
                  )}
                </div>
              </form>
            )}

            {step === "password" && (
              <form onSubmit={(e) => { e.preventDefault(); resetPassword(); }} className="space-y-4" data-testid="step-password">
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Password</Label>
                  <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1.5" placeholder="At least 6 characters" required data-testid="fp-new-password" autoFocus />
                </div>
                <div>
                  <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm Password</Label>
                  <Input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} className="mt-1.5" required data-testid="fp-confirm-password" />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={busy} data-testid="fp-submit">
                  {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <KeyRound className="w-4 h-4 mr-2" />}
                  {busy ? "Updating…" : "Update Password"}
                </Button>
              </form>
            )}

            {step === "done" && (
              <div className="space-y-4 text-center" data-testid="step-done">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-slate-900" style={{ fontFamily: "Outfit" }}>Password updated</div>
                  <div className="text-sm text-slate-500 mt-1">You can now log in with your new password.</div>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => nav("/login")} data-testid="fp-go-to-login">
                  Go to login <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StepDot({ idx, label, currentIdx }) {
  const active = idx === currentIdx;
  const done = idx < currentIdx;
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${active ? "bg-blue-600 text-white shadow" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
      </div>
      <div className={`text-xs ${active ? "text-slate-900 font-medium" : "text-slate-400"}`}>{label}</div>
    </div>
  );
}

function OtpInput({ value, onChange, testId }) {
  const refs = useRef([]);
  const digits = (value || "").padEnd(6, " ").slice(0, 6).split("");

  const setAt = (idx, ch) => {
    const next = digits.slice();
    next[idx] = ch;
    onChange(next.join("").replace(/\s+/g, ""));
  };

  const onKey = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx].trim() && idx > 0) {
      refs.current[idx - 1]?.focus();
    }
  };

  const onPaste = (e) => {
    const text = (e.clipboardData.getData("text") || "").replace(/\D+/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    setTimeout(() => refs.current[Math.min(text.length, 5)]?.focus(), 0);
  };

  return (
    <div className="flex items-center justify-center gap-2" onPaste={onPaste} data-testid={testId}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={(digits[i] || "").trim()}
          onChange={(e) => {
            const ch = (e.target.value || "").replace(/\D+/g, "").slice(0, 1);
            setAt(i, ch);
            if (ch && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => onKey(i, e)}
          className="w-11 h-12 text-center text-xl font-semibold tabular-nums rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid={`${testId}-${i}`}
        />
      ))}
    </div>
  );
}
