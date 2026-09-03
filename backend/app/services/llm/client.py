"""
Transport. One place that talks to the model endpoint over httpx.

Requests walk a model chain rather than retrying one id, because a retired
model answers 410 forever. See _call_groq_with_retry.
"""

import json
import asyncio
import logging
import httpx
from typing import AsyncIterator
from app.config import get_settings
from app.services.llm.parsing import _extract_json_from_text


logger = logging.getLogger("hireiq.groq")



GROQ_URL = "https://integrate.api.nvidia.com/v1/chat/completions"




def _default_model() -> str:
    """Heavyweight Groq model for one-shot tasks (scoring, prefill, email)."""
    return get_settings().groq_model_default




def _chat_model() -> str:
    """Fast, lighter Groq model for the live conversation stream."""
    return get_settings().groq_model_chat




# Back-compat alias for any imports/tests that referenced GROQ_MODEL directly.
GROQ_MODEL = "llama-3.3-70b-versatile"




# ── Core Groq caller ────────────────────────────────────────────────────────


def _model_chain(primary: str) -> list[str]:
    """Primary first, then the configured fallback if it is a different id."""
    fallback = get_settings().groq_model_fallback
    return [primary] if fallback in ("", primary) else [primary, fallback]




async def _call_groq_with_retry(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    json_mode: bool = False,
    model: str | None = None,
) -> str | None:
    """
    Call Groq via direct httpx REST (OpenAI-compatible endpoint).
    Retries once on failure. Returns text or None on total failure.
    Defaults to the heavyweight model; pass model="..." to override.
    """
    settings = get_settings()

    payload: dict = {
        "model":       model or settings.groq_model_default,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {"Authorization": f"Bearer {settings.nvidia_api_key}"}

    # Walk a model chain rather than hammering one id. A retired model answers
    # 410 forever, so the previous "retry the same model twice" loop was two
    # guaranteed failures followed by a silent None, which is how every AI
    # feature here went dark when mistral-medium reached end of life.
    for model_id in _model_chain(model or settings.groq_model_default):
        payload["model"] = model_id
        for attempt in range(1, 3):
            try:
                async with httpx.AsyncClient(timeout=settings.groq_timeout_seconds) as client:
                    response = await client.post(GROQ_URL, json=payload, headers=headers)

                if response.status_code == 200:
                    data = response.json()
                    text = data["choices"][0]["message"]["content"].strip()
                    return _extract_json_from_text(text) if json_mode else text

                logger.error(
                    "NVIDIA HTTP %s (model %s, attempt %d): %s",
                    response.status_code, model_id, attempt, response.text[:400],
                )
                # 404/410 mean the id itself is gone. Retrying cannot help, and
                # the next model in the chain is the only useful move.
                if response.status_code in (404, 410):
                    break
            except Exception as error:
                logger.error("NVIDIA request failed (model %s, attempt %d): %s",
                             model_id, attempt, error)

            if attempt == 1:
                await asyncio.sleep(settings.groq_retry_delay_seconds)

    logger.error("All models exhausted: %s", _model_chain(model or settings.groq_model_default))
    return None




# ── Streaming Groq caller ───────────────────────────────────────────────────

async def _stream_groq(
    messages: list[dict],
    max_tokens: int = 2048,
    temperature: float = 0.7,
    model: str | None = None,
) -> AsyncIterator[str]:
    """
    Stream content tokens from Groq. Yields plain-text deltas as they arrive.
    Raises on transport errors so the caller can decide how to surface them.

    Uses generous explicit timeouts: connect=10s, write=30s, pool=10s, but
    read=None (i.e. no per-chunk read timeout) so the stream is never killed
    while Groq is mid-generation.
    """
    settings = get_settings()
    payload: dict = {
        "model":       model or settings.groq_model_chat,
        "messages":    messages,
        "max_tokens":  max_tokens,
        "temperature": temperature,
        "stream":      True,
    }
    headers = {
        "Authorization": f"Bearer {settings.nvidia_api_key}",
        "Accept":        "text/event-stream",
    }
    log = logging.getLogger("hireiq.stream")

    timeout = httpx.Timeout(connect=10.0, write=30.0, pool=10.0, read=None)

    # The live interview is the worst place to discover the model id is dead,
    # so the stream walks the same chain as the one-shot caller. Only the
    # initial connection falls back: once tokens are flowing a mid-stream
    # failure cannot be retried without replaying text the candidate already saw.
    chain = _model_chain(model or settings.groq_model_chat)
    last_error: str | None = None

    for index, model_id in enumerate(chain):
        payload["model"] = model_id
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", GROQ_URL, json=payload, headers=headers) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    snippet = body[:500].decode("utf-8", "replace")
                    log.error("nvidia_http_error model=%s status=%s body=%s",
                              model_id, resp.status_code, snippet)
                    last_error = f"NVIDIA HTTP {resp.status_code}: {snippet}"
                    if index < len(chain) - 1:
                        continue
                    raise RuntimeError(last_error)
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    if not line.startswith("data: "):
                        continue
                    data_str = line[len("data: "):].strip()
                    if data_str == "[DONE]":
                        return
                    try:
                        obj = json.loads(data_str)
                    except json.JSONDecodeError:
                        log.debug("groq_bad_json line=%s", data_str[:200])
                        continue
                    try:
                        delta = obj["choices"][0]["delta"].get("content")
                    except (KeyError, IndexError, TypeError):
                        delta = None
                    if delta:
                        yield delta
            return  # stream completed on this model, do not fall through
