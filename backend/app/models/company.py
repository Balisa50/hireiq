"""
Pydantic models for company-related requests and responses.
"""

from pydantic import BaseModel, EmailStr, HttpUrl, field_validator
from typing import Optional
from uuid import UUID
from datetime import datetime


class CompanySignupRequest(BaseModel):
    email: EmailStr
    password: str
    company_name: str

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: str) -> str:
        if len(password) < 12:
            raise ValueError("Password must be at least 12 characters long.")
        if not any(c.isupper() for c in password):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(c.islower() for c in password):
            raise ValueError("Password must contain at least one lowercase letter.")
        if not any(c.isdigit() for c in password):
            raise ValueError("Password must contain at least one number.")
        special = set("!@#$%^&*()_+-=[]{}|;':\",./<>?")
        if not any(c in special for c in password):
            raise ValueError("Password must contain at least one special character.")
        return password

    @field_validator("company_name")
    @classmethod
    def validate_company_name(cls, name: str) -> str:
        name = name.strip()
        if not name:
            raise ValueError("Company name is required.")
        if len(name) > 100:
            raise ValueError("Company name must be 100 characters or fewer.")
        return name


class CompanyLoginRequest(BaseModel):
    email: EmailStr
    password: str


class CompanyProfileUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    default_question_count: Optional[int] = None
    default_focus_areas: Optional[list[str]] = None
    custom_intro_message: Optional[str] = None
    email_notifications: Optional[bool] = None

    @field_validator("default_question_count")
    @classmethod
    def validate_question_count(cls, count: Optional[int]) -> Optional[int]:
        if count is not None and (count < 5 or count > 15):
            raise ValueError("Question count must be between 5 and 15.")
        return count

    @field_validator("custom_intro_message")
    @classmethod
    def validate_intro_message(cls, message: Optional[str]) -> Optional[str]:
        if message and len(message) > 1000:
            raise ValueError("Custom intro message must be 1000 characters or fewer.")
        return message


class CompanyResponse(BaseModel):
    id: UUID
    email: str
    company_name: str
    industry: Optional[str] = None
    company_size: Optional[str] = None
    website_url: Optional[str] = None
    logo_url: Optional[str] = None
    default_question_count: int
    default_focus_areas: list[str]
    custom_intro_message: Optional[str] = None
    email_notifications: bool
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    company: CompanyResponse
