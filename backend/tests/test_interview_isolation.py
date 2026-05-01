"""
Data isolation tests, verify that companies cannot access each other's data.
"""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


COMPANY_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
COMPANY_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
JOB_OWNED_BY_B = "job-owned-by-company-b"


def _make_auth_override(company_id: str):
    """Return a dependency override that injects company_id without a real JWT."""
    async def _override():
        return company_id
    return _override


def test_company_a_cannot_read_company_b_job():
    """
    Company A should receive 403 when fetching a job owned by Company B.
    The router calls verify_company_owns_resource() which raises 403 on mismatch.
    """
    from main import app
    from app.auth import get_authenticated_company_id

    mock_supabase = MagicMock()
    # DB returns a job owned by Company B
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": JOB_OWNED_BY_B,
            "company_id": COMPANY_B,
            "title": "Secret Job",
            "department": "Engineering",
            "location": "Remote",
            "employment_type": "full_time",
            "job_description": "...",
            "question_count": 8,
            "focus_areas": [],
            "questions": [],
            "interview_link_token": "secret-token",
            "status": "active",
            "created_at": "2025-01-01T00:00:00Z",
            "updated_at": None,
        }
    ]

    app.dependency_overrides[get_authenticated_company_id] = _make_auth_override(COMPANY_A)

    with patch("app.routers.jobs_router.supabase", mock_supabase):
        with TestClient(app) as client:
            response = client.get(f"/api/jobs/{JOB_OWNED_BY_B}")

    app.dependency_overrides.clear()

    # Must be 403, company A accessing company B's resource
    assert response.status_code == 403


def test_company_a_cannot_close_company_b_job():
    """PATCH /api/jobs/{id}/status must 403 for non-owning companies."""
    from main import app
    from app.auth import get_authenticated_company_id

    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"company_id": COMPANY_B}
    ]

    app.dependency_overrides[get_authenticated_company_id] = _make_auth_override(COMPANY_A)

    with patch("app.routers.jobs_router.supabase", mock_supabase):
        with TestClient(app) as client:
            response = client.patch(
                f"/api/jobs/{JOB_OWNED_BY_B}/status",
                json={"status": "closed"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 403
