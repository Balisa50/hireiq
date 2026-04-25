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
