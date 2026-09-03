"""
HireIQ AI service.

Calls NVIDIA's OpenAI-compatible endpoint over httpx directly. There is no
vendor SDK involved: the Groq SDK was dropped in the migration, and the config
keys that still say groq_* are historical because they are already set in
Render. The module names no longer are.

This was one 2,008-line groq_service.py. It is now split along the seams that
were already there:

  client        talks to the endpoint, walks the model chain, retries
  parsing       pulls JSON out of prose and validates the field contract
  prompts       builds prompt text, makes no network calls
  questions     interview sets, job prefill, adaptive follow-ups
  scoring       four-dimension candidate assessment
  email         candidate notification drafts
  conversation  the live application conversation, buffered and streamed

Import the public functions from this package rather than from the modules,
so the internal layout can move without touching the routers.
"""

from app.services.llm.client import GROQ_MODEL, GROQ_URL
from app.services.llm.conversation import (
    generate_conversation_response,
    stream_conversation_response,
)
from app.services.llm.email import generate_candidate_email
from app.services.llm.parsing import COLLECTED_FIELD_IDS
from app.services.llm.prompts import get_first_interview_message
from app.services.llm.questions import (
    generate_adaptive_next_question,
    generate_interview_questions,
    generate_job_prefill,
)
from app.services.llm.scoring import score_candidate

__all__ = [
    "COLLECTED_FIELD_IDS",
    "GROQ_MODEL",
    "GROQ_URL",
    "generate_adaptive_next_question",
    "generate_candidate_email",
    "generate_conversation_response",
    "generate_interview_questions",
    "generate_job_prefill",
    "get_first_interview_message",
    "score_candidate",
    "stream_conversation_response",
]
