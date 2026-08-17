"""
HireIQ Backend Configuration
Centralises all environment variable access with validation.
"""

from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    environment: str = "development"
    frontend_url: str = "http://localhost:3000"
    # Comma-separated list of extra allowed origins (optional)
    allowed_origins: str = ""
    secret_key: str

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str

    # LLM provider: NVIDIA's free OpenAI-compatible endpoint (was Groq).
    # Optional-with-empty-default so the app still boots if the key is not yet
    # set (AI calls then fail cleanly with 401 instead of crash-looping).
    nvidia_api_key: str = ""
    # Heavyweight model for one-shot tasks (scoring, question generation,
    # candidate emails). Used at most a handful of times per candidate.
    groq_model_default: str = "nvidia/nemotron-3-super-120b-a12b"
    # Model for the live conversation stream (fires every turn). This drives a
    # long structured checklist with strict ordering + JSON field tagging, so it
    # needs strong instruction-following, not just speed — a light model drifts,
    # skips fields, and mis-tags. Nemotron is the same model the scoring path
    # uses and follows JSON reliably. Override with GROQ_MODEL_CHAT if you need
    # to trade rigour for latency.
    #
    # Both paths defaulted to mistralai/mistral-medium-3.5-128b until now. That
    # model reached end of life on 2026-08-07 and answers 410, so question
    # generation, scoring, the live interview stream and candidate emails were
    # all failing.
    #
    # Chosen by measurement on 2026-08-17, not from the catalogue: GET /v1/models
    # still lists mistral-nemotron and minimax-m3, but the first hangs past 150s
    # and the second answers 404. Listing is not availability on this endpoint.
    # What was actually verified for both paths this project needs:
    #   strict JSON (response_format=json_object)  parses clean, 6.4s
    #   SSE streaming                              61 chunks, 2s
    groq_model_chat:    str = "nvidia/nemotron-3-super-120b-a12b"

    # Second model to try when the primary is unavailable. A retired model
    # answers 410 forever, so retrying the same id is guaranteed to fail twice
    # and then give up. Slower (19s vs 6s on the JSON probe, 9 SSE chunks vs 61)
    # but a genuinely different family, which is the point of a fallback.
    groq_model_fallback: str = "nvidia/llama-3.3-nemotron-super-49b-v1.5"

    # Rate limiting
    rate_limit_general: int = 100
    rate_limit_ai: int = 20

    # Timeouts (seconds)
    # Conversation responses can take 15-25s on long transcripts. We size the
    # per-attempt timeout above the worst observed Groq latency so the user
    # doesn't see "AI temporarily unavailable" mid-conversation. Total budget
    # for one /public/message call: 30s + 1s + 30s = 61s worst case.
    groq_timeout_seconds: int = 30
    groq_retry_delay_seconds: int = 1

    # Content limits
    max_job_description_chars: int = 10_000
    max_answer_chars: int = 5_000
    max_name_chars: int = 100
    min_answer_chars: int = 50
    min_job_description_words: int = 100

    # Resend, candidate email notifications
    # Set RESEND_API_KEY in Render env vars. All platform emails route through it.
    resend_api_key: str = ""
    # Sending address on HireIQ's verified Resend domain.
    resend_from_email: str = "noreply@hireiq.app"

    # Interview settings
    interview_link_expiry_days: int = 7
    interview_resume_window_hours: int = 24

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
