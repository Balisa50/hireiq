"""
HireIQ authentication utilities.
Verifies Supabase JWT tokens and extracts the authenticated company ID.
"""

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from app.config import get_settings
from app.database import supabase
import logging

logger = logging.getLogger("hireiq.auth")
security = HTTPBearer()


async def get_authenticated_company_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Extract and verify the company ID from the JWT Bearer token.
    Raises HTTP 401 if the token is missing, expired, or invalid.
    """
    token = credentials.credentials
    settings = get_settings()

    try:
        # Verify the Supabase JWT using the project's JWT secret
        # Supabase signs tokens with the JWT_SECRET from project settings
        payload = jwt.decode(
            token,
            settings.supabase_anon_key,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        company_id: str | None = payload.get("sub")
        if not company_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )
        return company_id

    except JWTError as error:
        logger.warning(
            "JWT verification failed",
            extra={"error": str(error)},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token. Please log in again.",
        )


def verify_company_owns_resource(
    resource_company_id: str,
    authenticated_company_id: str,
    resource_name: str = "resource",
) -> None:
    """
    Verify the authenticated company owns the requested resource.
    Raises HTTP 403 if the company does not own the resource.
    This enforces data isolation at the application layer in addition to RLS.
    """
    if resource_company_id != authenticated_company_id:
        logger.warning(
            "Unauthorised resource access attempt",
            extra={
                "authenticated_company": authenticated_company_id,
                "resource_company": resource_company_id,
                "resource": resource_name,
            },
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to access this {resource_name}.",
        )
