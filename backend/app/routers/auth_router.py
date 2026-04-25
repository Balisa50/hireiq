"""
HireIQ authentication router.
Handles company signup and login via Supabase Auth.
"""

import logging
from fastapi import APIRouter, HTTPException, status
from app.models.company import (
    CompanySignupRequest,
    CompanyLoginRequest,
    AuthResponse,
    CompanyResponse,
)
from app.database import supabase

logger = logging.getLogger("hireiq.auth_router")
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def sign_up_company(request: CompanySignupRequest) -> AuthResponse:
    """
    Register a new company account.
    Creates a Supabase Auth user and a matching companies row.
    """
    try:
        auth_response = supabase.auth.sign_up({
            "email": request.email,
            "password": request.password,
        })

        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create account. Please check your email address.",
            )

        company_id = auth_response.user.id

        # Create the company profile row
        company_data = {
            "id": company_id,
            "email": request.email,
            "company_name": request.company_name,
        }

        result = supabase.table("companies").insert(company_data).execute()

        if not result.data:
            logger.error(
                "Failed to insert company profile after auth signup",
                extra={"company_id": company_id},
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Account created but profile setup failed. Please contact support.",
            )

        company = CompanyResponse(**result.data[0])

        return AuthResponse(
            access_token=auth_response.session.access_token if auth_response.session else "",
            company=company,
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error(
            "Signup error",
            extra={"email": request.email[:3] + "***", "error": str(error)},
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sign up failed. This email address may already be registered.",
        ) from error


@router.post("/login", response_model=AuthResponse)
async def log_in_company(request: CompanyLoginRequest) -> AuthResponse:
    """
    Authenticate an existing company account.
    Returns a JWT access token and the company profile.
    """
    try:
        auth_response = supabase.auth.sign_in_with_password({
            "email": request.email,
            "password": request.password,
        })

        if not auth_response.user or not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        company_id = auth_response.user.id
        result = supabase.table("companies").select("*").eq("id", company_id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Company profile not found.",
            )

        company = CompanyResponse(**result.data[0])

        return AuthResponse(
            access_token=auth_response.session.access_token,
            company=company,
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error(
            "Login error",
            extra={"email": request.email[:3] + "***", "error": str(error)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Login failed. Please check your credentials.",
        ) from error


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def log_out_company() -> None:
    """Sign out the current session."""
    try:
        supabase.auth.sign_out()
    except Exception as error:
        logger.warning("Logout error (non-fatal)", extra={"error": str(error)})
