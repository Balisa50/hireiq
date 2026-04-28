"""
Pydantic models for job-related requests and responses.
"""

from pydantic import BaseModel, field_validator
from typing import Optional, Literal
from uuid import UUID
from datetime import datetime, date


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


class CandidateRequirement(BaseModel):
    """A single document or link requirement companies set for candidates."""
    id: str
    label: str
    type: Literal["file", "link"]
    preset_key: Optional[str] = None   # e.g. "cv", "linkedin", "github"
    required: bool = True


class GeneratedQuestion(BaseModel):
    id: str
    question: str
    type: str                    # text | yes_no | number | rating | behavioral | experience | file | link
    focus_area: str
    what_it_reveals: str = ""
    severity: str = "standard"   # surface | standard | deep
    # Knockout / screening fields (optional)
    knockout_enabled: bool = False
    knockout_expected_answer: Optional[str] = None   # yes_no questions: "yes" or "no"
    knockout_min_value: Optional[float] = None       # number questions: inclusive minimum
    knockout_max_value: Optional[float] = None       # number questions: inclusive maximum
    knockout_rejection_reason: str = ""


class CreateJobRequest(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str
    job_description: str
    question_count: int = 8
    focus_areas: list[str]
    candidate_requirements: list[CandidateRequirement] = []

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

    @field_validator("candidate_requirements")
    @classmethod
    def validate_requirements(cls, reqs: list[CandidateRequirement]) -> list[CandidateRequirement]:
        if len(reqs) > 20:
            raise ValueError("Maximum 20 candidate requirements allowed.")
        return reqs


VALID_EXPERIENCE_LEVELS = {"any", "entry", "mid", "senior", "lead", "executive"}
VALID_WORK_ARRANGEMENTS = {"remote", "hybrid", "on_site"}
VALID_SALARY_CURRENCIES  = {"USD", "EUR", "GBP", "CAD", "AUD", "GHS", "GMD", "NGN", "KES", "ZAR"}
VALID_SALARY_PERIODS     = {"hour", "month", "year"}


class AIPrefillRequest(BaseModel):
    title: str
    department: str

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Job title is required.")
        return v

    @field_validator("department")
    @classmethod
    def validate_department(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Department is required.")
        return v


class PublishJobRequest(BaseModel):
    title: str
    department: str
    location: str
    employment_type: str
    job_description: str
    question_count: int = 8
    focus_areas: list[str] = []
    questions: list[GeneratedQuestion] = []
    candidate_requirements: list[CandidateRequirement] = []

    # ── Section 1 ───────────────────────────────────────────────────────────
    job_visibility: str = "public"
    experience_level: str = "any"
    work_arrangement: str = "on_site"
    openings: int = 1
    job_code: Optional[str] = None
    hiring_manager: Optional[str] = None
    # ── Location ────────────────────────────────────────────────────────────
    relocation_considered: bool = False
    travel_required: bool = False
    # ── Compensation ────────────────────────────────────────────────────────
    skills: list[str] = []
    nice_to_have_skills: list[str] = []
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: str = "USD"
    salary_period: str = "year"
    salary_disclosed: bool = False
    equity_offered: bool = False
    benefits_summary: Optional[str] = None
    # ── Eligibility ─────────────────────────────────────────────────────────
    eligibility_criteria: dict = {}
    # ── Candidate info config ───────────────────────────────────────────────
    candidate_info_config: dict = {}
    # ── DEI ─────────────────────────────────────────────────────────────────
    dei_config: dict = {}
    # ── AI deterrent ────────────────────────────────────────────────────────
    ai_deterrent_enabled: bool = True
    ai_deterrent_placement: str = "before_questions"
    ai_deterrent_message: Optional[str] = None
    # ── Job-level controls ──────────────────────────────────────────────────
    application_deadline: Optional[date] = None
    application_limit: int = 0   # 0 = unlimited
    is_paused: bool = False

    @field_validator("experience_level")
    @classmethod
    def validate_experience_level(cls, v: str) -> str:
        if v not in VALID_EXPERIENCE_LEVELS:
            raise ValueError(f"experience_level must be one of: {VALID_EXPERIENCE_LEVELS}")
        return v

    @field_validator("work_arrangement")
    @classmethod
    def validate_work_arrangement(cls, v: str) -> str:
        if v not in VALID_WORK_ARRANGEMENTS:
            raise ValueError(f"work_arrangement must be one of: {VALID_WORK_ARRANGEMENTS}")
        return v

    @field_validator("openings")
    @classmethod
    def validate_openings(cls, v: int) -> int:
        if v < 1 or v > 99:
            raise ValueError("openings must be between 1 and 99.")
        return v

    @field_validator("skills")
    @classmethod
    def validate_skills(cls, v: list[str]) -> list[str]:
        cleaned = [s.strip() for s in v if s.strip()]
        if len(cleaned) > 30:
            raise ValueError("Maximum 30 skills allowed.")
        return cleaned

    @field_validator("salary_currency")
    @classmethod
    def validate_salary_currency(cls, v: str) -> str:
        if v not in VALID_SALARY_CURRENCIES:
            raise ValueError(f"Unsupported currency: {v}")
        return v

    @field_validator("salary_period")
    @classmethod
    def validate_salary_period(cls, v: str) -> str:
        if v not in VALID_SALARY_PERIODS:
            raise ValueError(f"salary_period must be one of: {VALID_SALARY_PERIODS}")
        return v


class JobResponse(BaseModel):
    id: UUID
    company_id: UUID
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    job_description: str
    question_count: int = 8
    focus_areas: list[str] = []
    questions: list[dict]
    candidate_requirements: list[dict] = []
    interview_link_token: UUID
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    interview_count: int = 0
    average_score: Optional[float] = None
    # Section 1
    job_visibility: str = "public"
    experience_level: str = "any"
    work_arrangement: str = "on_site"
    openings: int = 1
    job_code: Optional[str] = None
    hiring_manager: Optional[str] = None
    # Location
    relocation_considered: bool = False
    travel_required: bool = False
    # Compensation
    skills: list[str] = []
    nice_to_have_skills: list[str] = []
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    salary_currency: str = "USD"
    salary_period: str = "year"
    salary_disclosed: bool = False
    equity_offered: bool = False
    benefits_summary: Optional[str] = None
    # Eligibility
    eligibility_criteria: dict = {}
    # Candidate info config
    candidate_info_config: dict = {}
    # DEI
    dei_config: dict = {}
    # AI deterrent
    ai_deterrent_enabled: bool = True
    ai_deterrent_placement: str = "before_questions"
    ai_deterrent_message: Optional[str] = None
    # Job-level controls
    application_deadline: Optional[date] = None
    application_limit: int = 0
    is_paused: bool = False


class JobSummary(BaseModel):
    id: UUID
    title: str
    department: Optional[str] = None
    status: str
    created_at: datetime
    interview_count: int = 0
    average_score: Optional[float] = None
    interview_link_token: UUID
