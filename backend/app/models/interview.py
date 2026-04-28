"""
Pydantic models for interview-related requests and responses.
"""

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


class StartInterviewRequest(BaseModel):
    candidate_name: str
    candidate_email: EmailStr

    @field_validator("candidate_name")
    @classmethod
    def validate_candidate_name(cls, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("Full name is required.")
        if len(name) > 100:
            raise ValueError("Name must be 100 characters or fewer.")
        if len(name) < 2:
            raise ValueError("Please enter your full name.")
        return name


class TranscriptEntry(BaseModel):
    question_index: int
    question: str
    answer: str
    timestamp: str


class SaveAnswerRequest(BaseModel):
    interview_id: UUID
    question_index: int
    question: str
    answer: str

    @field_validator("answer")
    @classmethod
    def validate_answer_length(cls, answer: str) -> str:
        answer = answer.strip()
        if len(answer) > 5_000:
            raise ValueError("Answer must be 5,000 characters or fewer.")
        return answer


class GetNextQuestionRequest(BaseModel):
    interview_id: UUID
    job_id: UUID
    transcript: list[TranscriptEntry]
    last_answer: str

    @field_validator("last_answer")
    @classmethod
    def validate_last_answer(cls, answer: str) -> str:
        answer = answer.strip()
        # Empty last_answer is valid for the first question (no prior answer yet)
        if answer and len(answer) < 50:
            raise ValueError("Answer must be at least 50 characters.")
        if len(answer) > 5_000:
            raise ValueError("Answer must be 5,000 characters or fewer.")
        return answer


class SubmitLinkRequest(BaseModel):
    """Candidate submitting a URL (LinkedIn, GitHub, portfolio, etc.)."""
    interview_id: UUID
    requirement_id: str
    requirement_label: str
    url: str

    @field_validator("url")
    @classmethod
    def validate_url(cls, url: str) -> str:
        url = url.strip()
        if not url.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        if len(url) > 2048:
            raise ValueError("URL is too long.")
        return url

    @field_validator("requirement_id", "requirement_label")
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field is required.")
        return v


class SubmitInterviewRequest(BaseModel):
    interview_id: UUID
    transcript: list[TranscriptEntry]


class CandidateAssessment(BaseModel):
    overall_score: int
    score_breakdown: dict[str, int]
    executive_summary: str
    key_strengths: list[str]
    areas_of_concern: list[str]
    recommended_follow_up_questions: list[str]
    hiring_recommendation: str
    document_interview_alignment: Optional[str] = None


class InterviewResponse(BaseModel):
    id: UUID
    job_id: UUID
    company_id: UUID
    candidate_name: str
    candidate_email: str
    transcript: list[dict]
    overall_score: Optional[int] = None
    score_breakdown: Optional[dict] = None
    executive_summary: Optional[str] = None
    key_strengths: Optional[list[str]] = None
    areas_of_concern: Optional[list[str]] = None
    recommended_follow_up_questions: Optional[list[str]] = None
    hiring_recommendation: Optional[str] = None
    document_interview_alignment: Optional[str] = None
    submitted_files: list[dict] = []
    submitted_links: list[dict] = []
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_saved_at: datetime
    knockout_reason: Optional[str] = None


class CandidateSummary(BaseModel):
    id: UUID
    candidate_name: str
    candidate_email: str
    job_title: str
    overall_score: Optional[int] = None
    hiring_recommendation: Optional[str] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    interview_duration_minutes: Optional[int] = None


class UpdateCandidateStatusRequest(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, status: str) -> str:
        valid_statuses = {"shortlisted", "rejected", "accepted", "in_progress", "pending_review", "completed", "scored"}
        if status not in valid_statuses:
            raise ValueError(f"Status must be one of: {valid_statuses}")
        return status


class GenerateCandidateEmailRequest(BaseModel):
    status: str   # shortlisted | rejected | accepted
    tone: str = "professional"  # professional | warm | direct

    @field_validator("status")
    @classmethod
    def validate_email_status(cls, v: str) -> str:
        if v not in {"shortlisted", "rejected", "accepted"}:
            raise ValueError("status must be shortlisted, rejected, or accepted")
        return v

    @field_validator("tone")
    @classmethod
    def validate_tone(cls, v: str) -> str:
        if v not in {"professional", "warm", "direct"}:
            return "professional"
        return v


class SendCandidateEmailRequest(BaseModel):
    subject: str
    body: str

    @field_validator("subject", "body")
    @classmethod
    def validate_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Field cannot be empty.")
        return v


class SendMessageRequest(BaseModel):
    """Candidate sends a message in the conversational interview."""
    interview_id: UUID
    candidate_message: str = ""

    @field_validator("candidate_message")
    @classmethod
    def validate_message(cls, msg: str) -> str:
        if len(msg) > 8_000:
            raise ValueError("Message is too long.")
        return msg.strip()


class JobPublicInfo(BaseModel):
    id: UUID
    title: str
    company_name: str
    company_logo_url: Optional[str] = None
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    question_count: int
    custom_intro_message: Optional[str] = None
    candidate_requirements: list[dict] = []
