"""
HireIQ email service.
Sends candidate notification emails via SMTP (Gmail app passwords or any SMTP relay).
Gracefully no-ops when SMTP credentials are not configured.
"""

import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings

logger = logging.getLogger("hireiq.email")


async def send_candidate_email(
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    from_name: str = "",
) -> bool:
    """
    Send a plain-text + HTML email to a candidate.
    Returns True on success, False if SMTP is unconfigured or the send fails.
    The caller decides whether to surface an error to the recruiter.
    """
    settings = get_settings()

    if not settings.smtp_user or not settings.smtp_password:
        logger.warning(
            "SMTP credentials not configured — candidate email not sent",
            extra={"to": to_email, "subject": subject},
        )
        return False

    from_name  = (from_name or settings.smtp_from_name or "HireIQ").strip()
    from_addr  = (settings.smtp_from_email or settings.smtp_user).strip()
    to_display = f"{to_name} <{to_email}>" if to_name else to_email

    # ── Build message ──────────────────────────────────────────────────────────
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"{from_name} <{from_addr}>"
    msg["To"]      = to_display

    # Plain-text part
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Minimal HTML part — preserve paragraph breaks, nothing more
    html_paragraphs = "".join(
        f"<p>{para.replace(chr(10), '<br>')}</p>"
        for para in body.split("\n\n")
        if para.strip()
    )
    html = (
        "<html><body style=\"font-family:-apple-system,BlinkMacSystemFont,"
        "'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;"
        "color:#1a1a1a;max-width:600px;margin:0 auto;padding:32px 24px;\">"
        f"{html_paragraphs}"
        "<p style=\"margin-top:40px;font-size:12px;color:#9ca3af;\">Sent via HireIQ</p>"
        "</body></html>"
    )
    msg.attach(MIMEText(html, "html", "utf-8"))

    # ── Send ───────────────────────────────────────────────────────────────────
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(from_addr, to_email, msg.as_string())
        logger.info("Candidate email sent", extra={"to": to_email, "subject": subject})
        return True
    except Exception as error:
        logger.error(
            "Failed to send candidate email",
            extra={"to": to_email, "subject": subject, "error": str(error)},
        )
        return False
