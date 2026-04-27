"""
HireIQ authentication router.
Handles company signup and login via Supabase Auth.
"""

import logging
from fastapi import APIRouter, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.models.company import (
    CompanySignupRequest,
    CompanyLoginRequest,
    AuthResponse,
    CompanyResponse,
)
from app.database import supabase

logger = logging.getLogger("hireiq.auth_router")
router = APIRouter(prefix="/auth", tags=["Authentication"])
_security = HTTPBearer()


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def sign_up_company(request: CompanySignupRequest) -> AuthResponse:
    """
    Register a new company account.
    Creates a Supabase Auth user and a matching companies row.
    Handles the case where a previous signup attempt left an orphaned Auth user
    (auth row created but companies row missing) by completing the profile setup.
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

    except HTTPException:
        raise
    except Exception as error:
        error_str = str(error).lower()

        # "User already registered" — auth row exists, check if companies row also exists
        if "already registered" in error_str or "already been registered" in error_str:
            # Try to log them in to get their ID, then check for companies row
            try:
                login_resp = supabase.auth.sign_in_with_password({
                    "email": request.email,
                    "password": request.password,
                })
                if login_resp.user:
                    existing = supabase.table("companies").select("*").eq("id", login_resp.user.id).execute()
                    if existing.data:
                        # Full account exists — tell them to log in
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="An account with this email already exists. Please log in instead.",
                        )
                    # Orphaned auth user — complete the companies row now
                    company_id = login_resp.user.id
                    result = supabase.table("companies").insert({
                        "id": company_id,
                        "email": request.email,
                        "company_name": request.company_name,
                    }).execute()
                    if result.data:
                        logger.info("Recovered orphaned auth user %s", company_id)
                        return AuthResponse(
                            access_token=login_resp.session.access_token if login_resp.session else "",
                            company=CompanyResponse(**result.data[0]),
                        )
            except HTTPException:
                raise
            except Exception as inner:
                logger.error("Orphaned-user recovery failed: %s", str(inner))

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists. Please log in instead.",
            )

        logger.error("Signup error for %s***: %s", request.email[:3], str(error))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sign up failed: {str(error)}",
        ) from error

    # Fresh signup — create the companies row
    try:
        result = supabase.table("companies").insert({
            "id": company_id,
            "email": request.email,
            "company_name": request.company_name,
        }).execute()

        if not result.data:
            logger.error("Failed to insert company profile for %s", company_id)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Account created but profile setup failed. Please contact support.",
            )

        return AuthResponse(
            access_token=auth_response.session.access_token if auth_response.session else "",  # type: ignore[union-attr]
            company=CompanyResponse(**result.data[0]),
        )

    except HTTPException:
        raise
    except Exception as error:
        logger.error("Companies insert failed for %s: %s", company_id, str(error))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Account created but profile setup failed: {str(error)}",
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
                detail="Account exists but company profile is missing. Please sign up again to complete setup.",
            )

        company = CompanyResponse(**result.data[0])

        return AuthResponse(
            access_token=auth_response.session.access_token,
            company=company,
        )

    except HTTPException:
        raise
    except Exception as error:
        error_str = str(error)
        logger.error("Login error for %s***: %s", request.email[:3], error_str)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Login failed: {error_str}",
        ) from error


@router.post("/google", response_model=AuthResponse)
async def google_oauth_login(
    credentials: HTTPAuthorizationCredentials = Security(_security),
) -> AuthResponse:
    """
    Exchange a Supabase Google OAuth access token for a HireIQ company session.
    Auto-creates a company profile for first-time Google sign-ins.
    """
    token = credentials.credentials

    # Verify token with Supabase
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid OAuth token.",
            )
        user = user_response.user
        company_id = str(user.id)
        email = user.email or ""
    except HTTPException:
        raise
    except Exception as error:
        logger.error("Google OAuth verification failed: %s", str(error))
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth token verification failed. Please try again.",
        ) from error

    # Get or create the company profile
    result = supabase.table("companies").select("*").eq("id", company_id).execute()

    if result.data:
        company = CompanyResponse(**result.data[0])
    else:
        # First-time Google sign-in — auto-create a profile
        metadata = user.user_metadata or {}
        display_name = (
            metadata.get("full_name")
            or metadata.get("name")
            or email.split("@")[0]
        )
        insert = supabase.table("companies").insert({
            "id": company_id,
            "email": email,
            "company_name": display_name,
        }).execute()
        if not insert.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create company profile. Please try again.",
            )
        company = CompanyResponse(**insert.data[0])
        logger.info("Auto-created company profile for Google user %s", company_id)

    return AuthResponse(access_token=token, company=company)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def log_out_company() -> None:
    """Sign out the current session."""
    try:
        supabase.auth.sign_out()
    except Exception as error:
        logger.warning("Logout error (non-fatal)", extra={"error": str(error)})
