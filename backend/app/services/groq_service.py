"""
HireIQ Groq AI service.
Handles all interactions with the Groq API:
  - Interview question generation
  - Adaptive follow-up question generation during live interviews
  - Candidate scoring and assessment report generation
"""

import json
import asyncio
import logging
from groq import AsyncGroq
from app.config import get_settings

logger = logging.getLogger("hireiq.groq")

MODEL = "llama-3.3-70b-versatile"


def _build_groq_client() -> AsyncGroq:
    settings = get_settings()
    return AsyncGroq(api_key=settings.groq_api_key)


async def _call_groq_with_retry(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
) -> str | None:
    """
    Call Groq with one automatic retry on failure.
    Returns the text content or None if both attempts fail.
    """
    settings = get_settings()
    client = _build_groq_client()

    kwargs: dict = {
        "model": MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "timeout": settings.groq_timeout_seconds,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(1, 3):
        try:
            response = await client.chat.completions.create(**kwargs)
            return response.choices[0].message.content
        except Exception as error:
            logger.error(
                "Groq API call failed",
                extra={
                    "attempt": attempt,
                    "error": str(error),
                    "model": MODEL,
                },
            )
            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

    return None


async def generate_interview_questions(
    job_title: str,
    job_description: str,
    focus_areas: list[str],
    question_count: int,
) -> list[dict] | None:
    """
    Generate structured interview questions for a job posting.
    Returns a list of question objects or None if generation fails.
    """
    system_prompt = (
        "You are the world's most respected executive recruiter with 30 years of experience "
        "placing top talent at the world's leading companies. You have a McKinsey analytical "
        "mind, deep behavioural psychology training, and an instinct for identifying genuine "
        "talent versus rehearsed performance. You are generating interview questions for the "
        "following role. Your questions must be specific to this exact role and job description "
        "— not generic. Mix question types: behavioural (tell me about a time), situational "
        "(how would you handle), technical (specific to this role), and motivational. "
        "The first question must always be a warm professional opener. The last question must "
        "always be an open invitation for the candidate to share anything else. "
        "Never ask questions answerable with yes or no. Never ask clichés. "
        "Every question must reveal something meaningful about the candidate's genuine capability. "
        "Return a JSON object with a single key 'questions' containing an array of question "
        "objects each with fields: id (string, q1/q2/etc), question (string), type (string), "
        "focus_area (string), what_it_reveals (string)."
    )

    user_prompt = (
        f"Job Title: {job_title}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas for this Interview: {', '.join(focus_areas)}\n\n"
        f"Generate exactly {question_count} interview questions."
    )

    raw_response = await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=3000,
        temperature=0.7,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        parsed = json.loads(raw_response)
        questions = parsed.get("questions", [])
        if not isinstance(questions, list):
            logger.error("Groq returned unexpected questions format", extra={"raw": raw_response[:200]})
            return None
        return questions
    except json.JSONDecodeError as error:
        logger.error(
            "Failed to parse Groq question generation response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None


async def generate_adaptive_next_question(
    job_title: str,
    company_name: str,
    job_description: str,
    transcript: list[dict],
    last_answer: str,
) -> str | None:
    """
    Generate the single best next interview question based on the conversation so far.
    Adapts to the candidate's previous answers — probes vague responses, explores
    interesting specifics, and moves to new areas when coverage is complete.
    """
    transcript_text = "\n".join(
        f"Q: {entry.get('question', '')}\nA: {entry.get('answer', '')}"
        for entry in transcript
    )

    system_prompt = (
        "You are conducting a live professional interview. You have the expertise of the "
        "world's best executive recruiter combined with a McKinsey analyst's structured thinking. "
        "Your job is to generate the single most valuable next question. "
        "If their answer was vague or lacked specifics — probe deeper and ask for a concrete example. "
        "If they mentioned something specific and interesting — explore it further. "
        "If they covered the topic thoroughly — move to the next important area for this role. "
        "One question only. No preamble. No intro. No 'Great answer!' No 'Thank you'. "
        "Just the question itself. The question must feel like a natural continuation of a real "
        "human conversation. Address the candidate by first name occasionally. "
        "Never reveal you are an AI."
    )

    user_prompt = (
        f"Role: {job_title} at {company_name}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Interview so far:\n{transcript_text}\n\n"
        f"Candidate's last answer: {last_answer}\n\n"
        "Generate the single best next question:"
    )

    return await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=200,
        temperature=0.75,
    )


async def score_candidate(
    job_title: str,
    company_name: str,
    job_description: str,
    focus_areas: list[str],
    transcript: list[dict],
) -> dict | None:
    """
    Generate a complete candidate assessment from the full interview transcript.
    Returns a structured JSON assessment or None if scoring fails.
    """
    transcript_text = "\n".join(
        f"Question {i+1}: {entry.get('question', '')}\n"
        f"Answer: {entry.get('answer', '')}\n"
        for i, entry in enumerate(transcript)
    )

    system_prompt = (
        "You are a senior talent assessment specialist with the analytical rigour of McKinsey "
        "and the human insight of a world class executive recruiter. "
        "You have just reviewed a complete interview transcript. "
        "Produce a professional candidate assessment with absolute honesty — "
        "no softening, no hedging, no generic praise. "
        "Base everything only on what the candidate actually said. "
        "Zero assumptions. Zero hallucination. "
        "If the candidate was vague, evasive, or unconvincing — say so explicitly. "
        "If they were exceptional — say so with specific evidence. "
        "Return valid JSON only. No preamble. No explanation. No markdown."
    )

    focus_area_scores = {area: 0 for area in focus_areas}

    user_prompt = (
        f"Job Title: {job_title}\n"
        f"Company: {company_name}\n\n"
        f"Job Description:\n{job_description}\n\n"
        f"Focus Areas Assessed: {', '.join(focus_areas)}\n\n"
        f"Complete Interview Transcript:\n{transcript_text}\n\n"
        "Produce a JSON assessment with these exact fields:\n"
        '- overall_score: integer 0-100\n'
        f'- score_breakdown: object with integer score 0-100 for each of: {list(focus_area_scores.keys())}\n'
        '- executive_summary: string — 4-5 sentences, specific, honest, written at McKinsey standard\n'
        '- key_strengths: array of exactly 3 strings — each must cite specific evidence from the transcript\n'
        '- areas_of_concern: array of 2-3 strings — honest, specific, no softening\n'
        '- recommended_follow_up_questions: array of exactly 3 strings for the human interview\n'
        '- hiring_recommendation: exactly one of: Strong Yes, Yes, Maybe, No, Strong No\n'
    )

    raw_response = await _call_groq_with_retry(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=2000,
        temperature=0.3,
        json_mode=True,
    )

    if not raw_response:
        return None

    try:
        return json.loads(raw_response)
    except json.JSONDecodeError as error:
        logger.error(
            "Failed to parse Groq scoring response",
            extra={"error": str(error), "raw": raw_response[:200]},
        )
        return None
