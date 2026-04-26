"""
HireIQ authentication utilities.
Verifies Supabase JWT tokens by calling supabase.auth.get_user(),
which validates server-side without needing the raw JWT secret.
"""

import logging
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.database import supabase

logger = logging.getLogger("hireiq.auth")
security = HTTPBearer()


async def get_authenticated_company_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Validate the Bearer token via Supabase and return the authenticated company ID (user UUID).
    Raises HTTP 401 if the token is missing, expired, or invalid.
    """
    token = credentials.credentials

    try:
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )
        return str(user_response.user.id)

    except HTTPException:
        raise
    except Exception as error:
        logger.warning("Auth verification failed: %s", str(error))
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
    Raises HTTP 403 if ownership doesn't match.
    """
    if resource_company_id != authenticated_company_id:
        logger.warning(
            "Unauthorised access: company %s tried to access %s owned by %s",
            authenticated_company_id,
            resource_name,
            resource_company_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You do not have permission to access this {resource_name}.",
        )
