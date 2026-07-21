"""
Tests for the health check endpoint.
"""

from fastapi.testclient import TestClient


def test_health_check(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "hireiq-api"
    assert "timestamp" in data


def test_health_db_reports_healthy_when_query_succeeds(client: TestClient, mock_supabase):
    """A successful round-trip to Supabase reports 200 + reachable."""
    mock_supabase.reset_mock(side_effect=True)
    response = client.get("/health/db")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "reachable"
    assert "latency_ms" in data
    # The whole point of this route: it must actually hit the database.
    mock_supabase.table.assert_called_with("companies")


def test_health_db_reports_503_when_database_unreachable(client: TestClient, mock_supabase):
    """
    A DNS/connection failure must surface as 503 so an uptime monitor alerts,
    rather than 500 (which reads as a bug) or 200 (which hides the outage).
    """
    mock_supabase.table.side_effect = OSError("[Errno -2] Name or service not known")
    try:
        response = client.get("/health/db")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["database"] == "unreachable"
    finally:
        mock_supabase.reset_mock(side_effect=True)


def test_security_headers_present(client: TestClient):
    """Every response must carry the required security headers."""
    response = client.get("/health")
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert "Referrer-Policy" in response.headers
    assert "X-Request-ID" in response.headers


def test_docs_unavailable_in_non_development(client: TestClient):
    """Swagger UI is disabled outside of development environment."""
    response = client.get("/docs")
    # In test environment (not "development") docs should return 404
    assert response.status_code == 404
