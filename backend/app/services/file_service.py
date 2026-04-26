"""
HireIQ file service.
Handles candidate document uploads to Supabase Storage:
  - Magic-byte file type validation
  - Size enforcement (10 MB per file)
  - Upload to private 'interview-documents' bucket
  - Text extraction from PDF and DOCX for AI context
  - 7-day signed URL generation for company downloads
"""

import io
import uuid
import logging
from typing import Optional

import filetype

from app.database import supabase

logger = logging.getLogger("hireiq.file_service")

BUCKET = "interview-documents"
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024          # 10 MB
TEXT_EXCERPT_CHARS  = 3_000                      # chars sent to Groq per document
SIGNED_URL_TTL      = 7 * 24 * 60 * 60          # 7 days in seconds

# Allowed MIME types (validated by magic bytes, not extension)
ALLOWED_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

def validate_file(file_bytes: bytes, filename: str) -> tuple[bool, str]:
    """
    Validate file size and type.
    Returns (ok, error_message). error_message is "" when ok=True.
    """
    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        return False, "File exceeds the 10 MB limit."

    kind = filetype.guess(file_bytes)

    if kind is None:
        # filetype can't detect — allow plain text (.txt) by extension only
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext == "txt":
            return True, ""
        return False, "File type not recognised. Please upload a PDF, Word document, JPEG, or PNG."

    if kind.mime not in ALLOWED_MIMES:
        return False, "File type not allowed. Please upload a PDF, Word document, JPEG, or PNG."

    return True, ""


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text(file_bytes: bytes, filename: str) -> Optional[str]:
    """
    Extract readable text from PDF, DOCX, or plain-text files.
    Returns None for images or if extraction fails.
    Caps output at TEXT_EXCERPT_CHARS to keep Groq prompts lean.
    """
    lower = filename.lower()
    try:
        if lower.endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(file_bytes))
            pages_text = []
            for page in reader.pages:
                t = page.extract_text()
                if t:
                    pages_text.append(t)
            combined = "\n".join(pages_text).strip()
            return combined[:TEXT_EXCERPT_CHARS] if combined else None

        if lower.endswith(".docx"):
            from docx import Document
            doc = Document(io.BytesIO(file_bytes))
            paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            combined = "\n".join(paragraphs).strip()
            return combined[:TEXT_EXCERPT_CHARS] if combined else None

        if lower.endswith(".txt"):
            return file_bytes.decode("utf-8", errors="ignore")[:TEXT_EXCERPT_CHARS]

    except Exception as exc:
        logger.warning(
            "Text extraction failed",
            extra={"filename": filename, "error": str(exc)},
        )

    return None  # images and unrecognised types


# ---------------------------------------------------------------------------
# Storage operations
# ---------------------------------------------------------------------------

def upload_file(
    job_id: str,
    interview_id: str,
    requirement_id: str,
    filename: str,
    file_bytes: bytes,
    content_type: str,
) -> str:
    """
    Upload a file to Supabase Storage.
    Path: {job_id}/{interview_id}/{requirement_id}/{uuid}-{filename}
    Returns the full storage path.
    """
    safe_filename = f"{uuid.uuid4().hex}-{filename}"
    path = f"{job_id}/{interview_id}/{requirement_id}/{safe_filename}"

    supabase.storage.from_(BUCKET).upload(
        path,
        file_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )
    logger.info("File uploaded", extra={"path": path, "size": len(file_bytes)})
    return path


def get_signed_url(file_path: str, expires_in: int = SIGNED_URL_TTL) -> Optional[str]:
    """
    Generate a signed download URL for a private Storage file.
    Returns None if generation fails (e.g. file deleted).
    """
    try:
        result = supabase.storage.from_(BUCKET).create_signed_url(file_path, expires_in)
        # supabase-py 2.x returns a dict with 'signedURL'
        return result.get("signedURL") or result.get("signed_url")
    except Exception as exc:
        logger.error(
            "Failed to generate signed URL",
            extra={"path": file_path, "error": str(exc)},
        )
        return None


def get_signed_urls_for_interview(submitted_files: list[dict]) -> list[dict]:
    """
    Enrich a list of submitted_files dicts with fresh signed URLs.
    Returns the same list with a 'signed_url' key added to each entry.
    """
    enriched = []
    for f in submitted_files:
        signed = get_signed_url(f.get("file_path", ""))
        enriched.append({**f, "signed_url": signed})
    return enriched


# ---------------------------------------------------------------------------
# Candidate context builder
# ---------------------------------------------------------------------------

def build_candidate_context(
    submitted_files: list[dict],
    submitted_links: list[dict],
) -> dict:
    """
    Build a structured candidate_context dict from submitted materials.
    This is sent to Groq for adaptive questioning and scoring.
    """
    context: dict = {}

    for f in submitted_files:
        key      = f.get("preset_key") or f.get("requirement_id", "file")
        label    = f.get("label", "Document")
        text     = f.get("extracted_text")
        filename = f.get("file_name", "")

        if key == "cv":
            context["cv_summary"] = text or f"CV submitted ({filename})"
        elif key == "cover_letter":
            context["cover_letter_summary"] = text or f"Cover letter submitted ({filename})"
        elif key == "certificates":
            context.setdefault("certificates", [])
            context["certificates"].append(text or f"Certificate submitted ({filename})")
        elif key == "portfolio":
            context["portfolio_note"] = text or f"Portfolio submitted ({filename})"
        else:
            context.setdefault("other_documents", [])
            context["other_documents"].append({
                "label": label,
                "text": text or f"File submitted ({filename})",
            })

    for lnk in submitted_links:
        key   = lnk.get("preset_key") or lnk.get("requirement_id", "link")
        label = lnk.get("label", "Link")
        url   = lnk.get("url", "")

        if key == "linkedin":
            context["linkedin_url"] = url
        elif key == "github":
            context["github_url"] = url
        elif key in ("dribbble", "behance"):
            context["portfolio_url"] = url
        elif key == "website":
            context["website_url"] = url
        else:
            context.setdefault("other_links", [])
            context["other_links"].append({"label": label, "url": url})

    return context
