"""
HireIQ email service — powered by Resend.
All platform emails route through a single Resend API key (RESEND_API_KEY).
Companies never configure anything. The from address shows only the company name.
HireIQ is invisible to candidates.
"""

import logging
import httpx

from app.config import get_settings

logger = logging.getLogger("hireiq.email")

RESEND_API_URL = "https://api.resend.com/emails"


async def send_candidate_email(
    to_email: str,
    to_name: str,
    subject: str,
    body: str,
    company_name: str = "",
) -> bool:
    """
    Send a candidate notification email via Resend.
    The from display name is the company name only — HireIQ is not mentioned.
    Returns True on success, False if API key is missing or the send fails.
    """
    settings = get_settings()

    if not settings.resend_api_key:
        logger.warning(
            "RESEND_API_KEY not configured — candidate email not sent",
            extra={"to": to_email, "subject": subject},
        )
        return False

    # Company name in the from field — candidate sees who contacted them, not the platform
    sender_name  = company_name if company_name else "Hiring Team"
    from_address = f"{sender_name} <{settings.resend_from_email}>"
    to_address   = f"{to_name} <{to_email}>" if to_name else to_email

    # HTML body — clean, no platform branding, no footer attribution
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
        "</body></html>"
    )

    payload = {
        "from":    from_address,
        "to":      [to_address],
        "subject": subject,
        "text":    body,
        "html":    html,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                RESEND_API_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.resend_api_key}",
                    "Content-Type":  "application/json",
                },
            )

        if response.status_code in (200, 201):
            logger.info(
                "Candidate email sent via Resend",
                extra={"to": to_email, "subject": subject},
            )
            return True

        logger.error(
            "Resend API returned an error",
            extra={
                "to":     to_email,
                "status": response.status_code,
                "body":   response.text[:300],
            },
        )
        return False

    except Exception as error:
        logger.error(
            "Failed to send candidate email via Resend",
            extra={"to": to_email, "error": str(error)},
        )
        return False
