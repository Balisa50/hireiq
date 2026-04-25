"""
Pydantic models for job-related requests and responses.
"""

from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


VALID_EMPLOYMENT_TYPES = {"full_time", "part_time", "contract", "internship"}
VALID_FOCUS_AREAS = {
    "Technical Skills",
    "Problem Solving",
    "Communication",
    "Leadership",
    "Culture Fit",
    "Motivation and Ambition",
    "Experience Depth",
    "Situational Judgement",
}


class GeneratedQuestion(BaseModel):
    id: str
    question: str
    type: str
    focus_area: str
    what_it_reveals: str


class CreateJobRequest(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str
    job_description: str
    question_count: int = 8
    focus_areas: list[str]

    @field_validator("title")
    @classmethod
    def validate_title(cls, title: str) -> str:
        title = title.strip()
        if not title:
            raise ValueError("Job title is required.")
        if len(title) > 200:
            raise ValueError("Job title must be 200 characters or fewer.")
        return title

    @field_validator("department")
    @classmethod
    def validate_department(cls, department: str) -> str:
        department = department.strip()
        if not department:
            raise ValueError("Department is required.")
        return department

    @field_validator("job_description")
    @classmethod
    def validate_job_description(cls, description: str) -> str:
        description = description.strip()
        if len(description) > 10_000:
            raise ValueError("Job description must be 10,000 characters or fewer.")
        word_count = len(description.split())
        if word_count < 50:
            raise ValueError(
                f"Job description must be at least 100 words. "
                f"Currently: {word_count} words."
            )
        return description

    @field_validator("question_count")
    @classmethod
    def validate_question_count(cls, count: int) -> int:
        if count < 5 or count > 15:
            raise ValueError("Question count must be between 5 and 15.")
        return count

    @field_validator("focus_areas")
    @classmethod
    def validate_focus_areas(cls, areas: list[str]) -> list[str]:
        if not areas:
            raise ValueError("At least one focus area is required.")
        invalid = set(areas) - VALID_FOCUS_AREAS
        if invalid:
            raise ValueError(f"Invalid focus areas: {invalid}")
        return areas

    @field_validator("employment_type")
    @classmethod
    def validate_employment_type(cls, employment_type: str) -> str:
        if employment_type not in VALID_EMPLOYMENT_TYPES:
            raise ValueError(f"Employment type must be one of: {VALID_EMPLOYMENT_TYPES}")
        return employment_type


class PublishJobRequest(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str
    job_description: str
    question_count: int
    focus_areas: list[str]
    questions: list[GeneratedQuestion]

    @field_validator("questions")
    @classmethod
    def validate_questions(cls, questions: list[GeneratedQuestion]) -> list[GeneratedQuestion]:
        if not questions:
            raise ValueError("At least one question is required to publish a job.")
        if len(questions) > 20:
            raise ValueError("Maximum 20 questions allowed.")
        return questions


class JobResponse(BaseModel):
    id: UUID
    company_id: UUID
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    job_description: str
    question_count: int
    focus_areas: list[str]
    questions: list[dict]
    interview_link_token: UUID
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    interview_count: int = 0
    average_score: Optional[float] = None


class JobSummary(BaseModel):
    id: UUID
    title: str
    department: Optional[str] = None
    status: str
    created_at: datetime
    interview_count: int = 0
    average_score: Optional[float] = None
    interview_link_token: UUID
