"""
Pytest configuration and shared fixtures for HireIQ backend tests.
"""

import os
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

# Set test environment variables before importing app modules
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("SECRET_KEY", "a" * 64)


@pytest.fixture(scope="session")
def mock_supabase():
    """Return a MagicMock standing in for the Supabase client."""
    return MagicMock()


@pytest.fixture(scope="session")
def client(mock_supabase):
    """Provide a TestClient with Supabase patched out."""
    with patch("app.database.supabase", mock_supabase):
        from main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def sample_company_id() -> str:
    return "11111111-1111-1111-1111-111111111111"


@pytest.fixture
def sample_job_id() -> str:
    return "22222222-2222-2222-2222-222222222222"


@pytest.fixture
def sample_interview_id() -> str:
    return "33333333-3333-3333-3333-333333333333"


@pytest.fixture
def valid_jwt_headers(sample_company_id: str) -> dict:
    """
    Return Authorization headers with a mock JWT.
    In tests, the auth dependency is patched to return sample_company_id directly.
    """
    return {"Authorization": f"Bearer mock-token-for-{sample_company_id}"}
