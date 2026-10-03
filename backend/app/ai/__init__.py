"""Pluggable AI providers. Off unless FORKCAST_AI_ENABLED=true."""
import json
import os
import re
from abc import ABC, abstractmethod

import httpx


def enabled() -> bool:
    return os.environ.get("FORKCAST_AI_ENABLED", "false").lower() in ("1", "true", "yes", "on")


RECIPE_SCHEMA_HINT = ('Return ONLY JSON: {"title":str,"description":str,"servings":int|null,"prep_min":int|null,"cook_min":int|null,'
                      '"category":"breakfast|lunch|dinner|snack|dessert|drink|other","ingredients":[str],"steps":[str]}')


class Provider(ABC):
    @abstractmethod
    def complete(self, system: str, user: str) -> str: ...

    def extract_recipe(self, text: str) -> dict:
        return _json(self.complete("You extract recipes from messy text. " + RECIPE_SCHEMA_HINT, text[:12000]))

    def suggest(self, kind: str, existing_titles: list[str]) -> list[dict]:
        out = _json(self.complete(
            "You suggest family-friendly recipes. Return ONLY a JSON array of 5 objects shaped as "
            + RECIPE_SCHEMA_HINT.replace("Return ONLY JSON: ", ""),
            f"Suggest {kind} ideas. Avoid duplicating: {', '.join(existing_titles[:40])}"))
        return out if isinstance(out, list) else out.get("items", [])


def _json(s: str):
    m = re.search(r"[\[{].*[\]}]", s, re.S)
    return json.loads(m.group(0) if m else s)


class OpenAICompatibleProvider(Provider):
    """Works with OpenAI, Ollama (http://host:11434/v1), LM Studio, etc."""

    def __init__(self):
        self.base = os.environ.get("FORKCAST_AI_BASE_URL", "http://localhost:11434/v1").rstrip("/")
        self.model = os.environ.get("FORKCAST_AI_MODEL", "llama3.1")
        self.key = os.environ.get("FORKCAST_AI_KEY", "")

    def complete(self, system, user):
        h = {"Authorization": f"Bearer {self.key}"} if self.key else {}
        r = httpx.post(f"{self.base}/chat/completions", headers=h, timeout=120, json={
            "model": self.model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]})
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


class AnthropicProvider(Provider):
    """Stub: set FORKCAST_AI_KEY and FORKCAST_AI_MODEL; uses the Messages API over plain HTTP."""

    def complete(self, system, user):
        key, model = os.environ.get("FORKCAST_AI_KEY", ""), os.environ.get("FORKCAST_AI_MODEL", "")
        if not key or not model:
            raise RuntimeError("AnthropicProvider needs FORKCAST_AI_KEY and FORKCAST_AI_MODEL")
        r = httpx.post("https://api.anthropic.com/v1/messages", timeout=120,
                       headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
                       json={"model": model, "max_tokens": 4000, "system": system,
                             "messages": [{"role": "user", "content": user}]})
        r.raise_for_status()
        return r.json()["content"][0]["text"]


def get_provider() -> Provider:
    return AnthropicProvider() if os.environ.get("FORKCAST_AI_PROVIDER", "openai").lower() == "anthropic" else OpenAICompatibleProvider()
