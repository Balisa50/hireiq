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

    # Groq
    groq_api_key: str

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

    # Resend — candidate email notifications
    # Set RESEND_API_KEY in Render env vars. All platform emails route through it.
    resend_api_key: str = ""
    # Sending address on HireIQ's verified Resend domain.
    resend_from_email: str = "noreply@hireiq.app"

    # Gemini — interview conversation agent only (scoring + email stay on Groq)
    gemini_api_key: str = ""

    # Interview settings
    interview_link_expiry_days: int = 7
    interview_resume_window_hours: int = 24

    model_config = {"env_file": ".env", "case_sensitive": False}


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
