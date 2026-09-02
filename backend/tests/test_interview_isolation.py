"""
Data isolation tests: companies must not be able to reach each other's data,
and must not be able to tell whether another company's record exists.

These previously asserted 403. The routers now scope ownership into the query
instead of fetching a row and comparing afterwards, so a record owned by
someone else is indistinguishable from one that does not exist. Both are 404.

Each test asserts two things:
  1. the response is 404, so nothing leaks, including existence
  2. the query actually carried a company_id filter

The second assertion is the one that matters. Without it these tests still
pass if someone deletes the ownership filter, because the mock would return
nothing either way.
"""

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


def _scoped_supabase():
    """
    A Supabase mock whose query builder chains, and whose scoped lookup finds
    nothing. That is what the real database returns when the caller filters by
    a company_id that does not own the row.
    """
    chain = MagicMock()
    chain.select.return_value = chain
    chain.eq.return_value = chain
    chain.order.return_value = chain
    chain.limit.return_value = chain
    chain.execute.return_value.data = []

    client = MagicMock()
    client.table.return_value = chain
    return client, chain


def _filtered_by_company(chain, company_id: str) -> bool:
    """True when the query included an equality filter on company_id."""
    return any(
        call.args[:2] == ("company_id", company_id)
        for call in chain.eq.call_args_list
    )


def test_company_a_cannot_read_company_b_job():
    """GET /api/jobs/{id} must 404, not 403, for a job owned by another company."""
    from main import app
    from app.auth import get_authenticated_company_id

    client_mock, chain = _scoped_supabase()
    app.dependency_overrides[get_authenticated_company_id] = _make_auth_override(COMPANY_A)

    with patch("app.routers.jobs_router.supabase", client_mock):
        with TestClient(app) as client:
            response = client.get(f"/api/jobs/{JOB_OWNED_BY_B}")

    app.dependency_overrides.clear()

    assert response.status_code == 404, (
        "A job owned by another company must be indistinguishable from one that "
        f"does not exist; got {response.status_code}"
    )
    assert _filtered_by_company(chain, COMPANY_A), (
        "The query did not filter on company_id. Ownership must be scoped into "
        "the query, not checked after the row has already been fetched."
    )


def test_company_a_cannot_change_status_of_company_b_job():
    """PATCH /api/jobs/{id}/status must 404 for a job owned by another company."""
    from main import app
    from app.auth import get_authenticated_company_id

    client_mock, chain = _scoped_supabase()
    app.dependency_overrides[get_authenticated_company_id] = _make_auth_override(COMPANY_A)

    with patch("app.routers.jobs_router.supabase", client_mock):
        with TestClient(app) as client:
            response = client.patch(
                f"/api/jobs/{JOB_OWNED_BY_B}/status",
                json={"status": "closed"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 404, (
        f"Expected 404 for another company's job; got {response.status_code}"
    )
    assert _filtered_by_company(chain, COMPANY_A), (
        "The status update did not filter on company_id."
    )


def test_company_a_cannot_read_company_b_interview():
    """GET /api/interviews/{id} must 404 for an interview owned by another company."""
    from main import app
    from app.auth import get_authenticated_company_id

    client_mock, chain = _scoped_supabase()
    app.dependency_overrides[get_authenticated_company_id] = _make_auth_override(COMPANY_A)

    with patch("app.routers.interviews_router.supabase", client_mock):
        with TestClient(app) as client:
            response = client.get("/api/interviews/interview-owned-by-company-b")

    app.dependency_overrides.clear()

    assert response.status_code == 404, (
        f"Expected 404 for another company's interview; got {response.status_code}"
    )
    assert _filtered_by_company(chain, COMPANY_A), (
        "The interview lookup did not filter on company_id."
    )
