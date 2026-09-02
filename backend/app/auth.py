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

    PREFER SCOPING OWNERSHIP INTO THE QUERY. Add `.eq("company_id", company_id)`
    to the lookup so a row belonging to someone else is simply not returned.
    This helper exists for the cases where a resource is reached indirectly and
    cannot be filtered at the source.

    Raises 404, not 403. Answering 403 for a row that exists but belongs to
    another company, while answering 404 for one that does not exist, tells the
    caller which ids are real. That is an enumeration oracle, and it is the
    reason every router here now filters instead of comparing. The log line
    still records the attempt, so a real probing attempt is visible to us even
    though the caller learns nothing.
    """
    if resource_company_id != authenticated_company_id:
        logger.warning(
            "Unauthorised access: company %s tried to access %s owned by %s",
            authenticated_company_id,
            resource_name,
            resource_company_id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{resource_name.capitalize()} not found.",
        )
