"""
HireIQ GitHub analysis service.
When a candidate submits a GitHub link during their interview, this service:
  1. Fetches their public repositories via the GitHub API (no auth required)
  2. Pulls README snippets from the top 5 most-recently-updated repos
  3. Calls Groq to produce a structured skill analysis
  4. Returns a dict that gets merged into candidate_context for scoring
"""

import base64
import logging
from typing import Optional

import httpx

logger = logging.getLogger("hireiq.github")

GITHUB_API = "https://api.github.com"
HEADERS = {"Accept": "application/vnd.github.v3+json", "User-Agent": "HireIQ/1.0"}
TIMEOUT = 8.0   # seconds per request, fast-fail if GitHub is slow
MAX_REPOS = 6


def _extract_username(github_url: str) -> Optional[str]:
    """Pull the GitHub username out of any github.com URL."""
    try:
        cleaned = github_url.rstrip("/").lower()
        if "github.com/" not in cleaned:
            return None
        after = cleaned.split("github.com/")[-1]
        username = after.split("/")[0].strip()
        return username if username else None
    except Exception:
        return None


async def fetch_github_profile(github_url: str) -> dict:
    """
    Fetch public repo data for the given GitHub URL.
    Returns a structured dict, never raises; errors are logged and returned
    in the dict under the 'error' key.
    """
    username = _extract_username(github_url)
    if not username:
        return {"error": f"Could not extract username from URL: {github_url}"}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            # 1. Get user profile
            profile_resp = await client.get(f"{GITHUB_API}/users/{username}")
            if profile_resp.status_code == 404:
                return {"error": f"GitHub user '{username}' not found or profile is private."}
            if profile_resp.status_code != 200:
                return {"error": f"GitHub API returned {profile_resp.status_code}"}

            profile = profile_resp.json()
            public_repos = profile.get("public_repos", 0)

            # 2. Get repos sorted by most recently updated
            repos_resp = await client.get(
                f"{GITHUB_API}/users/{username}/repos",
                params={"sort": "updated", "per_page": MAX_REPOS},
            )
            if repos_resp.status_code != 200:
                return {
                    "username": username,
                    "public_repos": public_repos,
                    "repos": [],
                    "error": "Could not fetch repositories.",
                }

            repos = repos_resp.json()

            # 3. For each repo, pull a README snippet
            repo_details = []
            for repo in repos[:MAX_REPOS]:
                if repo.get("fork"):
                    continue  # skip forks, they inflate the profile

                detail: dict = {
                    "name":        repo.get("name", ""),
                    "description": repo.get("description") or "",
                    "language":    repo.get("language") or "unknown",
                    "stars":       repo.get("stargazers_count", 0),
                    "forks":       repo.get("forks_count", 0),
                    "updated_at":  repo.get("updated_at", "")[:10],
                    "topics":      repo.get("topics", []),
                    "readme":      "",
                }

                try:
                    readme_resp = await client.get(
                        f"{GITHUB_API}/repos/{username}/{repo['name']}/readme"
                    )
                    if readme_resp.status_code == 200:
                        content = readme_resp.json().get("content", "")
                        if content:
                            decoded = base64.b64decode(content).decode("utf-8", errors="ignore")
                            # First 600 chars of README is plenty for context
                            detail["readme"] = decoded[:600].strip()
                except Exception:
                    pass  # README missing, not a blocker

                repo_details.append(detail)

            return {
                "username":     username,
                "profile_url":  github_url,
                "public_repos": public_repos,
                "repos":        repo_details,
            }

    except httpx.TimeoutException:
        logger.warning("GitHub fetch timed out", extra={"username": username})
        return {"username": username, "error": "GitHub API timed out."}
    except Exception as exc:
        logger.error("GitHub fetch failed", extra={"username": username, "error": str(exc)})
        return {"username": username, "error": str(exc)}


def format_github_for_context(github_data: dict) -> str:
    """
    Convert raw GitHub fetch result into a concise text block
    for inclusion in candidate_context and Groq scoring prompts.
    """
    if github_data.get("error"):
        return f"GitHub analysis failed: {github_data['error']}"

    username = github_data.get("username", "unknown")
    public_repos = github_data.get("public_repos", 0)
    repos = github_data.get("repos", [])

    if not repos:
        return (
            f"GitHub profile: github.com/{username}, "
            f"{public_repos} public repos, none accessible or all are forks. "
            "No actual code evidence available."
        )

    lines = [f"GitHub: github.com/{username} ({public_repos} public repos)"]
    lines.append(f"Analysed top {len(repos)} non-fork repos:\n")

    for r in repos:
        lang = r.get("language", "unknown")
        stars = r.get("stars", 0)
        updated = r.get("updated_at", "")
        desc = r.get("description", "") or "no description"
        readme_snippet = r.get("readme", "")
        topics = ", ".join(r.get("topics", [])) if r.get("topics") else ""

        lines.append(f"  Repo: {r['name']} [{lang}] ★{stars}, last updated {updated}")
        lines.append(f"  Description: {desc}")
        if topics:
            lines.append(f"  Topics: {topics}")
        if readme_snippet:
            lines.append(f"  README: {readme_snippet[:300]}...")
        lines.append("")

    return "\n".join(lines)
