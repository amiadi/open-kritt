"""Internal local-model selection for air-gapped, non-target workflows.

This module selects configuration only. It does not call a provider and cannot
fall back to cloud credentials. Future callers must explicitly opt in and keep
all provider traffic on the deployment's internal network.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True)
class LocalModelConfiguration:
    provider: str
    endpoint: str
    model: str


_CLOUD_CREDENTIALS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY", "CODEX_API_KEY")


def local_model_configuration(env: dict[str, str] | None = None) -> LocalModelConfiguration | None:
    """Return a validated internal provider configuration or ``None``.

    Local-model use is disabled unless explicitly configured. A configured cloud
    credential is rejected to prevent an accidental cloud fallback in air-gap mode.
    """

    values = os.environ if env is None else env
    provider = values.get("OPEN_KRITT_LOCAL_MODEL_PROVIDER", "").strip().lower()
    endpoint = values.get("OPEN_KRITT_LOCAL_MODEL_ENDPOINT", "").strip()
    model = values.get("OPEN_KRITT_LOCAL_MODEL_ID", "").strip()
    if not provider and not endpoint and not model:
        return None
    if provider not in {"openai_compatible", "ollama"} or not endpoint or not model:
        return None
    parsed = urlparse(endpoint)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        return None
    if values.get("OPEN_KRITT_DEPLOYMENT_MODE", "online").strip().lower() == "airgap" and any(
        values.get(name, "").strip() for name in _CLOUD_CREDENTIALS
    ):
        return None
    return LocalModelConfiguration(provider, endpoint, model)
