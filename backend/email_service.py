"""Resend email service for Solarix.

Wraps the synchronous Resend SDK in `asyncio.to_thread` so FastAPI stays
non-blocking. Reads RESEND_API_KEY and SENDER_EMAIL from env on import.
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY")
SENDER_EMAIL = os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev"
APP_NAME = os.environ.get("APP_PUBLIC_NAME") or "Solarix"


async def send_email(to: str, subject: str, html: str) -> Optional[str]:
    """Fire-and-track email send. Returns Resend email id on success, None on failure."""
    if not resend.api_key:
        logger.warning("RESEND_API_KEY missing — email to %s skipped", to)
        return None
    params = {
        "from": f"{APP_NAME} <{SENDER_EMAIL}>",
        "to": [to],
        "subject": subject,
        "html": html,
    }
    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        email_id = result.get("id") if isinstance(result, dict) else None
        logger.info("Resend → %s · subject=%r · id=%s", to, subject, email_id)
        return email_id
    except Exception as exc:  # noqa: BLE001
        logger.exception("Resend send failed for %s: %s", to, exc)
        return None


def render_otp_email(otp: str, minutes: int = 10) -> str:
    """Inline-CSS, table-based HTML OTP email."""
    return f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 16px 32px;">
              <div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">{APP_NAME} password reset</div>
              <div style="font-size:14px;color:#64748b;margin-top:6px;">We received a request to reset your account password.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 24px 32px;">
              <div style="font-size:13px;color:#475569;margin-bottom:14px;">Use the verification code below to continue. It expires in <strong>{minutes} minutes</strong>.</div>
              <div style="background:linear-gradient(135deg,#eff6ff,#fef3c7);border:1px solid #fde68a;border-radius:12px;padding:20px;text-align:center;">
                <div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:14px;color:#0f172a;">{otp}</div>
              </div>
              <div style="font-size:12px;color:#94a3b8;margin-top:18px;">If you did not request a password reset you can safely ignore this email — your password will not be changed.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px 32px;">
              <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:11px;color:#94a3b8;">
                Sent automatically by {APP_NAME}. Please do not reply to this email.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body></html>"""


def render_password_changed_email() -> str:
    return f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
        <tr><td style="padding:32px;">
          <div style="font-family:Outfit,sans-serif;font-size:22px;font-weight:600;color:#0f172a;letter-spacing:-0.01em;">Password updated successfully</div>
          <div style="font-size:14px;color:#475569;margin-top:10px;">You can now log in to {APP_NAME} with your new password.</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px;">
            If you did <strong>not</strong> make this change, contact your administrator immediately to secure the account.
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""
