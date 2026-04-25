"""
HireIQ Supabase client initialisation.
Uses the service role key so the backend can bypass Row Level Security
for all authorised operations. The backend is responsible for enforcing
company-level data isolation at the application layer.
"""

from supabase import create_client, Client
from app.config import get_settings


def create_supabase_service_client() -> Client:
    """Create a Supabase client with the service role key (bypasses RLS)."""
    settings = get_settings()
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


# Module-level singleton — shared across the application
supabase: Client = create_supabase_service_client()
