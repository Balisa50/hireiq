"""
Unit tests for the Groq service layer.
All Groq API calls are mocked, no real network traffic.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock


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


def _make_groq_response(content: dict) -> MagicMock:
    """Build a mock Groq chat completion response containing JSON."""
    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(content)
    return mock_response


@pytest.mark.asyncio
async def test_generate_interview_questions():
    from app.services.groq_service import generate_interview_questions

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        return_value=_make_groq_response(SAMPLE_QUESTIONS_RESPONSE)
    )

    with patch("app.services.groq_service.AsyncGroq", return_value=mock_client):
        result = await generate_interview_questions(
            job_title="Software Engineer",
            department="Engineering",
            location="Remote",
            employment_type="full_time",
            job_description="Build scalable backend services. " * 20,
            question_count=2,
            focus_areas=["Technical Skills", "Communication"],
        )

    assert len(result["questions"]) == 2
    assert result["questions"][0]["id"] == "q1"
    assert result["questions"][1]["focus_area"] == "Communication"


@pytest.mark.asyncio
async def test_score_candidate():
    from app.services.groq_service import score_candidate

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        return_value=_make_groq_response(SAMPLE_SCORE_RESPONSE)
    )

    sample_transcript = [
        {"question": "Tell me about yourself.", "answer": "I am a software engineer with 5 years of experience."},
    ]

    with patch("app.services.groq_service.AsyncGroq", return_value=mock_client):
        result = await score_candidate(
            job_title="Software Engineer",
            job_description="Build scalable backend services. " * 20,
            focus_areas=["Technical Skills", "Communication"],
            transcript=sample_transcript,
        )

    assert result["overall_score"] == 82
    assert result["hiring_recommendation"] == "Yes"
    assert "Technical Skills" in result["score_breakdown"]


@pytest.mark.asyncio
async def test_generate_questions_retries_on_failure():
    """Groq service should retry once on failure before raising."""
    from app.services.groq_service import generate_interview_questions
    from groq import APITimeoutError

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(
        side_effect=[
            APITimeoutError(request=MagicMock()),  # first call fails
            _make_groq_response(SAMPLE_QUESTIONS_RESPONSE),  # second call succeeds
        ]
    )

    with patch("app.services.groq_service.AsyncGroq", return_value=mock_client):
        with patch("app.services.groq_service.asyncio.sleep", new_callable=AsyncMock):
            result = await generate_interview_questions(
                job_title="Engineer",
                department="Eng",
                location="Remote",
                employment_type="full_time",
                job_description="Build things. " * 25,
                question_count=2,
                focus_areas=["Technical Skills"],
            )

    assert "questions" in result
    assert mock_client.chat.completions.create.call_count == 2
