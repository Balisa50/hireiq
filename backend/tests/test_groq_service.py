"""
Unit tests for the LLM service layer. No real network traffic.

These are mocked at the HTTP boundary (httpx.AsyncClient) rather than at an
SDK client object. The module talks to NVIDIA's OpenAI-compatible endpoint
with httpx directly and has no SDK client to patch; the previous tests patched
`AsyncGroq`, which stopped existing when the service moved off Groq, and had
been failing ever since.

Mocking at the transport also means the retry loop and the model-chain
fallback are exercised for real. That logic is the reason every AI feature in
this app went dark when mistral-medium reached end of life, so it is worth
covering rather than stubbing past.

The module keeps its groq_* names for back-compat. They are historical.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


SAMPLE_QUESTIONS_RESPONSE = {
    "questions": [
        {
            "id": "q1",
            "question": "Walk me through a recent technical challenge you solved.",
            "type": "behavioral",
            "focus_area": "Technical Skills",
            "what_it_reveals": "Problem-solving ability and technical depth.",
        },
        {
            "id": "q2",
            "question": "Describe a time you had to deliver under tight deadlines.",
            "type": "situational",
            "focus_area": "Communication",
            "what_it_reveals": "Time management and communication under pressure.",
        },
    ]
}

SAMPLE_SCORE_RESPONSE = {
    "overall_score": 82,
    "score_breakdown": {
        "Technical Skills": 85,
        "Communication": 79,
    },
    "executive_summary": "Strong candidate with solid technical depth.",
    "key_strengths": ["Clear communicator", "Strong problem solver"],
    "areas_of_concern": ["Limited leadership experience"],
    "recommended_follow_up_questions": ["Tell me more about your team leadership experience."],
    "hiring_recommendation": "Yes",
}


def _ok(content: dict) -> MagicMock:
    """A 200 from the chat completions endpoint carrying JSON in the message."""
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {
        "choices": [{"message": {"content": json.dumps(content)}}]
    }
    response.text = ""
    return response


def _error(status_code: int) -> MagicMock:
    """A non-200 from the endpoint."""
    response = MagicMock()
    response.status_code = status_code
    response.text = f"simulated {status_code}"
    return response


def _patch_transport(*responses):
    """
    Patch httpx.AsyncClient so each POST returns the next queued response.

    The service opens the client as an async context manager per attempt, so
    the mock has to support __aenter__/__aexit__ rather than just being awaited.
    Returns (patcher, post_mock) so a test can assert the call count.
    """
    post = AsyncMock(side_effect=list(responses))

    session = MagicMock()
    session.post = post

    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=session)
    context.__aexit__ = AsyncMock(return_value=False)

    return patch("app.services.groq_service.httpx.AsyncClient", return_value=context), post


@pytest.mark.asyncio
async def test_generate_interview_questions():
    from app.services.groq_service import generate_interview_questions

    transport, post = _patch_transport(_ok(SAMPLE_QUESTIONS_RESPONSE))
    with transport:
        result = await generate_interview_questions(
            job_title="Software Engineer",
            job_description="Build scalable backend services. " * 20,
            focus_areas=["Technical Skills", "Communication"],
            question_count=2,
        )

    assert isinstance(result, list), "the function returns the questions directly"
    assert len(result) == 2
    assert result[0]["id"] == "q1"
    assert result[1]["focus_area"] == "Communication"
    assert post.await_count == 1, "a successful first call must not be retried"


@pytest.mark.asyncio
async def test_score_candidate():
    from app.services.groq_service import score_candidate

    transcript = [
        {
            "question": "Tell me about yourself.",
            "answer": "I am a software engineer with 5 years of experience.",
        },
    ]

    transport, _ = _patch_transport(_ok(SAMPLE_SCORE_RESPONSE))
    with transport:
        result = await score_candidate(
            job_title="Software Engineer",
            company_name="Acme",
            job_description="Build scalable backend services. " * 20,
            focus_areas=["Technical Skills", "Communication"],
            transcript=transcript,
        )

    assert result["overall_score"] == 82
    assert result["hiring_recommendation"] == "Yes"
    assert "Technical Skills" in result["score_breakdown"]


@pytest.mark.asyncio
async def test_retries_once_before_succeeding():
    """A transient failure is retried on the same model rather than given up on."""
    from app.services.groq_service import generate_interview_questions

    transport, post = _patch_transport(
        _error(500),                      # first attempt fails transiently
        _ok(SAMPLE_QUESTIONS_RESPONSE),   # retry succeeds
    )
    with transport:
        with patch("app.services.groq_service.asyncio.sleep", new_callable=AsyncMock):
            result = await generate_interview_questions(
                job_title="Engineer",
                job_description="Build things. " * 25,
                focus_areas=["Technical Skills"],
                question_count=2,
            )

    assert result and len(result) == 2
    assert post.await_count == 2, "expected one retry after a 500"


@pytest.mark.asyncio
async def test_retired_model_falls_through_to_the_fallback():
    """
    A 410 means the model id itself is gone, so retrying it is two guaranteed
    failures. The caller must move to the next model in the chain instead.

    This is exactly what happened when mistral-medium reached end of life: the
    old code retried the dead id and returned None, and every AI feature went
    quiet without an error anyone saw.
    """
    from app.services.groq_service import generate_interview_questions

    transport, post = _patch_transport(
        _error(410),                      # primary model is retired
        _ok(SAMPLE_QUESTIONS_RESPONSE),   # fallback model answers
    )
    with transport:
        with patch("app.services.groq_service.asyncio.sleep", new_callable=AsyncMock):
            result = await generate_interview_questions(
                job_title="Engineer",
                job_description="Build things. " * 25,
                focus_areas=["Technical Skills"],
                question_count=2,
            )

    assert result and len(result) == 2
    assert post.await_count == 2, (
        "a 410 must not be retried on the same model; it should fall straight "
        "through to the fallback"
    )
