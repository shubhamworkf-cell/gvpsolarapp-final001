import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatApiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { User as UserIcon, Mail, Lock, Building2, LogOut, Camera, Loader2 } from "lucide-react";

/**
 * ProfileMenu — top-right avatar dropdown with My Profile / Change Email /
 * Change Password / Company Details / Logout entries. Each settings flow opens
 * an inline dialog (no separate routes needed).
 */
export default function ProfileMenu() {
  const { user, company, logout, refreshCompany } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(null); // 'profile' | 'email' | 'password' | null

  const initials = (user?.name || "?").slice(0, 1).toUpperCase();
  const photoUrl = user?.profile_photo_file_id ? fileUrl(user.profile_photo_file_id) : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-transparent hover:ring-blue-200 focus:outline-none focus:ring-blue-300 transition overflow-hidden"
            data-testid="profile-menu-trigger"
            aria-label="Profile menu"
          >
            {photoUrl ? <img src={photoUrl} alt={user?.name} className="w-full h-full object-cover" /> : initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60" data-testid="profile-menu-content">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-sm font-semibold overflow-hidden shrink-0">
                {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : initials}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm text-slate-900 truncate">{user?.name}</div>
                <div className="text-xs text-slate-500 truncate">{user?.email}</div>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setOpen("profile")} data-testid="menu-my-profile">
            <UserIcon className="w-4 h-4 mr-2" /> My Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("email")} data-testid="menu-change-email">
            <Mail className="w-4 h-4 mr-2" /> Change Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpen("password")} data-testid="menu-change-password">
            <Lock className="w-4 h-4 mr-2" /> Change Password
          </DropdownMenuItem>
          {user?.role === "Admin" && (
            <DropdownMenuItem onClick={() => nav("/profile")} data-testid="menu-company-details">
              <Building2 className="w-4 h-4 mr-2" /> Company Details
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => { await logout(); nav("/login"); }}
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
            data-testid="menu-logout"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MyProfileDialog open={open === "profile"} onClose={() => setOpen(null)} onSaved={() => refreshCompany()} />
      <ChangeEmailDialog open={open === "email"} onClose={() => setOpen(null)} />
      <ChangePasswordDialog open={open === "password"} onClose={() => setOpen(null)} />
    </>
  );
}

function MyProfileDialog({ open, onClose, onSaved }) {
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [photoId, setPhotoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get("/auth/me").then(({ data }) => {
      setName(data.user?.name || "");
      setMobile(data.user?.mobile || "");
      setPhotoId(data.user?.profile_photo_file_id || "");
    }).catch(() => {});
  }, [open]);

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("category", "avatar");
      const { data } = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotoId(data.id);
      // Save immediately so the avatar shows even if user cancels other edits
      await api.patch("/auth/me", { profile_photo_file_id: data.id });
      toast.success("Photo uploaded");
      onSaved?.();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setUploading(false); }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.patch("/auth/me", { name, mobile, profile_photo_file_id: photoId });
      toast.success("Profile updated");
      onSaved?.();
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="my-profile-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>My Profile</DialogTitle>
          <DialogDescription className="text-xs">Update your name, mobile and profile photo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center text-2xl font-semibold overflow-hidden ring-2 ring-white shadow">
                {photoId ? <img src={fileUrl(photoId)} alt="" className="w-full h-full object-cover" /> : (name || "?").slice(0, 1).toUpperCase()}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} data-testid="profile-photo-input" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-center shadow-sm transition"
                title="Change photo"
                data-testid="profile-photo-btn"
              >
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              </button>
            </div>
            <div className="flex-1 text-xs text-slate-500">
              JPG or PNG up to 10MB. The photo appears in your top-right avatar across the app.
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Full Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5" data-testid="profile-name" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mobile</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="mt-1.5" data-testid="profile-mobile" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={save} disabled={busy} data-testid="profile-save">{busy ? "Saving…" : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeEmailDialog({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setEmail(""); setPwd(""); } }, [open]);

  const submit = async () => {
    if (!email.includes("@")) { toast.error("Enter a valid email"); return; }
    if (!pwd) { toast.error("Current password is required"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-email", { new_email: email, current_password: pwd });
      toast.success("Email updated");
      window.dispatchEvent(new Event("solarix:auth-refresh"));
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="change-email-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>Change Email</DialogTitle>
          <DialogDescription className="text-xs">You will need to log in with your new email next time.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new@example.com" className="mt-1.5" data-testid="new-email-input" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="mt-1.5" data-testid="email-current-password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy} data-testid="change-email-submit">{busy ? "Saving…" : "Update Email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ open, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setCurrent(""); setNext(""); setConfirm(""); } }, [open]);

  const submit = async () => {
    if (next.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (next !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password updated");
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit" }}>Change Password</DialogTitle>
          <DialogDescription className="text-xs">Use at least 6 characters. Avoid using your name or email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Current Password</Label>
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} className="mt-1.5" data-testid="pwd-current" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">New Password</Label>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5" data-testid="pwd-new" />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Confirm New Password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" data-testid="pwd-confirm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-blue-600 hover:bg-blue-700" onClick={submit} disabled={busy} data-testid="change-password-submit">{busy ? "Saving…" : "Update Password"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
