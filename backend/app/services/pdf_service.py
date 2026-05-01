"""
HireIQ PDF report generation service.
Generates professional candidate assessment reports using WeasyPrint.
"""

import logging
import re
from datetime import datetime
from typing import Optional

logger = logging.getLogger("hireiq.pdf")

# Personal detail keywords, exchanges that collected these are filtered out
# of the transcript so the PDF only shows substantive role Q&A.
_PERSONAL_RE = re.compile(
    r"\b(your name|full name|email address|phone number|phone|"
    r"location|where are you|currently based|currently employed|"
    r"employment status|working at)\b",
    re.IGNORECASE,
)


def _extract_qa_pairs(transcript: list[dict]) -> list[dict]:
    """
    Convert conversation-format transcript [{role, content, action}]
    into clean Q&A pairs, filtering out personal-detail collection exchanges.
    Falls back gracefully to the old {question, answer} format.
    """
    if not transcript:
        return []

    first = transcript[0]

    # New format: {role: 'ai'|'candidate', content, action?}
    if first.get("role"):
        pairs = []
        for i, msg in enumerate(transcript):
            if msg.get("role") != "ai":
                continue
            action = msg.get("action", "continue")
            if action in ("request_file", "request_link"):
                continue  # skip document-request messages
            content = str(msg.get("content", "")).strip()
            if not content:
                continue
            # Skip personal detail collection exchanges
            if _PERSONAL_RE.search(content) and len(content) < 150:
                continue
            # Find next candidate reply
            next_msg = transcript[i + 1] if i + 1 < len(transcript) else None
            if next_msg and next_msg.get("role") == "candidate":
                answer = str(next_msg.get("content", "")).strip()
                if len(answer.split()) >= 5:   # skip very short replies
                    pairs.append({"question": content, "answer": answer})
        return pairs

    # Old format: {question_index, question, answer}
    return [
        {"question": str(e.get("question", "")), "answer": str(e.get("answer", ""))}
        for e in transcript
        if e.get("question") and e.get("answer")
    ]


_DIM_LABELS: dict[str, str] = {
    "relevance":        "Relevance",
    "completeness":     "Completeness",
    "clarity":          "Clarity",
    "red_flag_penalty": "Red Flag Penalty",
}


def _build_score_bars_html(score_breakdown: dict) -> str:
    """Build HTML for per-dimension score bars."""
    bars = ""
    for raw_key, score in score_breakdown.items():
        try:
            score_int = int(score)
        except (TypeError, ValueError):
            score_int = 0

        label = _DIM_LABELS.get(raw_key) or raw_key.replace("_", " ").title()

        if raw_key == "red_flag_penalty":
            # Penalty bar, red, shown inverted (higher is worse)
            pct   = min(score_int * 2, 100)   # scale 0-50 to 0-100 for display
            color = "#ef4444"
            bars += f"""
            <div class="score-bar-item">
                <div class="score-bar-label">
                    <span>{label}</span>
                    <span class="score-badge" style="color: {color};">-{score_int} pts</span>
                </div>
                <div class="score-bar-track">
                    <div class="score-bar-fill" style="width: {pct}%; background: {color}; opacity: 0.7;"></div>
                </div>
            </div>
            """
        else:
            color = "#22c55e" if score_int >= 80 else "#f59e0b" if score_int >= 60 else "#ef4444"
            bars += f"""
            <div class="score-bar-item">
                <div class="score-bar-label">
                    <span>{label}</span>
                    <span class="score-badge" style="color: {color};">{score_int}/100</span>
                </div>
                <div class="score-bar-track">
                    <div class="score-bar-fill" style="width: {score_int}%; background: {color};"></div>
                </div>
            </div>
            """
    return bars


def _format_list_items(items: list[str]) -> str:
    """Build HTML list items from a list of strings."""
    return "".join(f"<li>{item}</li>" for item in items)


def _build_docs_html(submitted_files: list[dict], submitted_links: list[dict]) -> str:
    """Build HTML for submitted documents section."""
    if not submitted_files and not submitted_links:
        return "<p style='color:#9ca3af;font-size:13px;'>No documents submitted.</p>"

    items = ""
    for f in submitted_files:
        label = f.get("requirement_label") or f.get("label") or "Document"
        name  = f.get("file_name") or f.get("original_name") or "File"
        items += f"""
        <div class="doc-item">
            <span class="doc-check">✓</span>
            <div>
                <span class="doc-label">{label}</span>
                <span class="doc-name">{name}</span>
            </div>
        </div>
        """
    for lnk in submitted_links:
        label = lnk.get("requirement_label") or lnk.get("label") or "Link"
        url   = lnk.get("url") or ""
        items += f"""
        <div class="doc-item">
            <span class="doc-check">✓</span>
            <div>
                <span class="doc-label">{label}</span>
                <span class="doc-name">{url}</span>
            </div>
        </div>
        """
    return items


def generate_candidate_report_pdf(
    candidate_name: str,
    candidate_email: str,
    job_title: str,
    company_name: str,
    started_at: datetime,
    completed_at: Optional[datetime],
    overall_score: int,
    score_breakdown: dict,
    executive_summary: str,
    key_strengths: list[str],
    areas_of_concern: list[str],
    recommended_follow_up_questions: list[str],
    hiring_recommendation: str,
    transcript: list[dict],
    submitted_files: list[dict] | None = None,
    submitted_links: list[dict] | None = None,
) -> bytes:
    """
    Generate a professional PDF candidate report.
    Returns the PDF as bytes.
    """
    try:
        from weasyprint import HTML, CSS

        submitted_files  = submitted_files  or []
        submitted_links  = submitted_links  or []

        score_color = (
            "#22c55e" if overall_score >= 80
            else "#f59e0b" if overall_score >= 60
            else "#ef4444"
        )

        rec_colors = {
            "Strong Yes": "#22c55e",
            "Yes": "#86efac",
            "Maybe": "#f59e0b",
            "No": "#f87171",
            "Strong No": "#ef4444",
        }
        rec_color = rec_colors.get(hiring_recommendation, "#6b7280")

        duration_text = ""
        if completed_at and started_at:
            minutes = int((completed_at - started_at).total_seconds() / 60)
            duration_text = f"<span class='detail-item'>⏱ {minutes} minutes</span>"

        interview_date = (completed_at or started_at).strftime("%B %d, %Y")

        qa_pairs = _extract_qa_pairs(transcript)
        if qa_pairs:
            transcript_html = "".join(
                f"""
                <div class="transcript-entry">
                    <p class="transcript-question">Q{i+1}. {pair['question']}</p>
                    <p class="transcript-answer">{pair['answer']}</p>
                </div>
                """
                for i, pair in enumerate(qa_pairs)
            )
        else:
            transcript_html = "<p style='color:#9ca3af;font-size:13px;'>No substantive transcript available.</p>"

        html_content = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
        <meta charset="UTF-8">
        <title>HireIQ Candidate Report, {candidate_name}</title>
        <style>
            * {{ margin: 0; padding: 0; box-sizing: border-box; }}

            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.6;
                color: #111827;
                background: #fff;
            }}

            .header {{
                background: #0f172a;
                color: white;
                padding: 32px 40px;
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
            }}

            .header-brand {{
                font-size: 22px;
                font-weight: 700;
                letter-spacing: -0.5px;
                color: #60a5fa;
            }}

            .header-meta {{ text-align: right; font-size: 11px; color: #94a3b8; }}
            .header-meta strong {{ color: white; font-size: 13px; }}

            .hero {{
                background: #f8fafc;
                padding: 32px 40px;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                gap: 28px;
            }}

            .score-ring {{
                width: 100px; height: 100px;
                border-radius: 50%;
                background: {score_color}18;
                border: 3px solid {score_color};
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                flex-shrink: 0;
            }}

            .score-number {{
                font-size: 28px; font-weight: 700;
                color: {score_color};
                line-height: 1;
            }}

            .score-label {{ font-size: 10px; color: #6b7280; margin-top: 2px; }}

            .hero-info h1 {{ font-size: 20px; font-weight: 700; color: #0f172a; }}
            .hero-info h2 {{ font-size: 14px; font-weight: 500; color: #374151; margin-top: 2px; }}
            .hero-details {{ margin-top: 8px; display: flex; gap: 16px; flex-wrap: wrap; }}
            .detail-item {{ font-size: 11px; color: #6b7280; }}

            .rec-badge {{
                display: inline-block;
                padding: 4px 12px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 600;
                background: {rec_color}20;
                color: {rec_color};
                border: 1px solid {rec_color}40;
                margin-top: 8px;
            }}

            .section {{
                padding: 28px 40px;
                border-bottom: 1px solid #f1f5f9;
            }}

            .section h3 {{
                font-size: 13px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.8px;
                color: #64748b;
                margin-bottom: 14px;
            }}

            .executive-summary {{
                font-size: 14px;
                line-height: 1.75;
                color: #1e293b;
            }}

            .score-bar-item {{ margin-bottom: 12px; }}
            .score-bar-label {{
                display: flex; justify-content: space-between;
                font-size: 12px; margin-bottom: 5px; color: #374151;
            }}
            .score-badge {{ font-weight: 700; }}
            .score-bar-track {{
                height: 8px; background: #f1f5f9;
                border-radius: 4px; overflow: hidden;
            }}
            .score-bar-fill {{ height: 100%; border-radius: 4px; }}

            .bullet-list {{ list-style: none; padding: 0; }}
            .bullet-list li {{
                padding: 8px 12px;
                margin-bottom: 6px;
                border-radius: 6px;
                font-size: 13px;
                line-height: 1.5;
            }}

            .strengths-list li {{
                background: #f0fdf4; border-left: 3px solid #22c55e;
                color: #14532d;
            }}

            .concerns-list li {{
                background: #fff7ed; border-left: 3px solid #f59e0b;
                color: #78350f;
            }}

            .followup-list li {{
                background: #eff6ff; border-left: 3px solid #3b82f6;
                color: #1e3a5f;
            }}

            .transcript-entry {{
                margin-bottom: 20px;
                padding: 14px 16px;
                background: #f8fafc;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }}

            .transcript-question {{
                font-size: 12px; font-weight: 600;
                color: #374151; margin-bottom: 6px;
            }}

            .transcript-answer {{
                font-size: 13px; color: #4b5563;
                line-height: 1.6;
                white-space: pre-wrap;
            }}

            .doc-item {{
                display: flex; align-items: flex-start;
                gap: 10px; padding: 8px 0;
                border-bottom: 1px solid #f1f5f9;
            }}
            .doc-item:last-child {{ border-bottom: none; }}
            .doc-check {{
                color: #22c55e; font-weight: 700;
                font-size: 14px; flex-shrink: 0; margin-top: 1px;
            }}
            .doc-label {{
                display: block; font-size: 11px;
                font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.5px; color: #6b7280; margin-bottom: 2px;
            }}
            .doc-name {{
                display: block; font-size: 12px; color: #374151;
                word-break: break-all;
            }}

            .footer {{
                background: #f8fafc;
                padding: 20px 40px;
                text-align: center;
                font-size: 11px;
                color: #9ca3af;
                border-top: 1px solid #e2e8f0;
            }}

            @page {{
                margin: 0;
                size: A4;
            }}
        </style>
        </head>
        <body>
            <div class="header">
                <div class="header-brand">HireIQ</div>
                <div class="header-meta">
                    <strong>{company_name}</strong><br>
                    Application Report<br>
                    {interview_date}
                </div>
            </div>

            <div class="hero">
                <div class="score-ring">
                    <span class="score-number">{overall_score}</span>
                    <span class="score-label">out of 100</span>
                </div>
                <div class="hero-info">
                    <h1>{candidate_name}</h1>
                    <h2>{job_title}, {company_name}</h2>
                    <div class="hero-details">
                        <span class="detail-item">✉ {candidate_email}</span>
                        <span class="detail-item">📅 {interview_date}</span>
                        {duration_text}
                    </div>
                    <div class="rec-badge">Recommendation: {hiring_recommendation}</div>
                </div>
            </div>

            <div class="section">
                <h3>AI Executive Summary</h3>
                <p class="executive-summary">{executive_summary}</p>
            </div>

            <div class="section">
                <h3>Documents Submitted</h3>
                {_build_docs_html(submitted_files, submitted_links)}
            </div>

            <div class="section">
                <h3>Score Breakdown</h3>
                {_build_score_bars_html(score_breakdown)}
            </div>

            <div class="section">
                <h3>Key Strengths</h3>
                <ul class="bullet-list strengths-list">
                    {_format_list_items(key_strengths)}
                </ul>
            </div>

            <div class="section">
                <h3>Areas of Concern</h3>
                <ul class="bullet-list concerns-list">
                    {_format_list_items(areas_of_concern)}
                </ul>
            </div>

            <div class="section">
                <h3>Suggested In-Person Questions</h3>
                <ul class="bullet-list followup-list">
                    {_format_list_items(recommended_follow_up_questions)}
                </ul>
            </div>

            <div class="section">
                <h3>Full Application Transcript</h3>
                {transcript_html}
            </div>

            <div class="footer">
                Generated by HireIQ AI Hiring Platform, hireiq.app<br>
                This report is confidential and intended solely for the hiring team at {company_name}.
            </div>
        </body>
        </html>
        """

        pdf_bytes = HTML(string=html_content).write_pdf()
        return pdf_bytes

    except Exception as error:
        logger.error(
            "PDF generation failed",
            extra={"candidate": candidate_name, "error": str(error)},
        )
        raise RuntimeError(f"Failed to generate PDF report: {str(error)}") from error
