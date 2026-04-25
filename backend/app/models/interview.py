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
        if len(answer) < 50:
            raise ValueError("Answer must be at least 50 characters.")
        if len(answer) > 5_000:
            raise ValueError("Answer must be 5,000 characters or fewer.")
        return answer


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
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    last_saved_at: datetime


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
        valid_statuses = {"shortlisted", "rejected", "in_progress", "completed", "scored"}
        if status not in valid_statuses:
            raise ValueError(f"Status must be one of: {valid_statuses}")
        return status


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
