"""Base module for Agno Tools

Provides message loader and base utilities for all tools.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, ClassVar

import yaml

from util.base_paths import get_config_dir
from util.logging_config import get_logger

logger = get_logger()


class AgnoToolsMessageLoader:
    """Message loader for Agno Tools

    Loads localized messages from YAML files based on language.
    Supports caching for performance.
    """

    _instances: ClassVar[dict[str, AgnoToolsMessageLoader]] = {}
    _messages: ClassVar[dict[str, dict[str, Any]]] = {}

    def __new__(cls, lang: str = "en"):
        """Singleton per language"""
        if lang not in cls._instances:
            instance = super().__new__(cls)
            cls._instances[lang] = instance
        return cls._instances[lang]

    def __init__(self, lang: str = "en"):
        """Initialize message loader

        Args:
            lang: Language code ('zh' or 'en')
        """
        self.lang = lang
        if lang not in self._messages:
            self._load_messages()

    def _get_prompts_dir(self) -> Path:
        """Get the prompts directory path"""
        try:
            return get_config_dir() / "prompts" / "agno_tools" / self.lang
        except ImportError:
            # Fallback for testing
            return (
                Path(__file__).parent.parent.parent
                / "config"
                / "prompts"
                / "agno_tools"
                / self.lang
            )

    def _load_messages(self):
        """Load all YAML files from the language directory"""
        prompts_dir = self._get_prompts_dir()
        self._messages[self.lang] = {}

        if not prompts_dir.exists():
            logger.warning(f"Prompts directory not found: {prompts_dir}")
            return

        yaml_files = list(prompts_dir.glob("*.yaml"))
        for yaml_file in yaml_files:
            try:
                with open(yaml_file, encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                    self._messages[self.lang].update(data)
            except Exception as e:
                logger.error(f"Failed to load {yaml_file.name}: {e}")

        logger.info(
            f"AgnoTools messages loaded for '{self.lang}': "
            f"{len(yaml_files)} files, {len(self._messages[self.lang])} keys"
        )

    def get(self, key: str, **kwargs) -> str:
        """Get a localized message by key

        Args:
            key: Message key
            **kwargs: Format arguments

        Returns:
            Formatted message string
        """
        messages = self._messages.get(self.lang, {})
        template = messages.get(key, "")

        if not template:
            # Fallback to English
            if self.lang != "en":
                en_messages = self._messages.get("en", {})
                template = en_messages.get(key, "")

            if not template:
                logger.warning(f"Message not found: {key}")
                return f"[{key}]"

        try:
            if kwargs:
                return template.format(**kwargs)
            return template
        except KeyError as e:
            logger.error(f"Missing format key in message '{key}': {e}")
            return template

    def reload(self):
        """Reload messages from disk"""
        if self.lang in self._messages:
            del self._messages[self.lang]
        self._load_messages()


def get_message(lang: str, key: str, **kwargs) -> str:
    """Convenience function to get a localized message

    Args:
        lang: Language code
        key: Message key
        **kwargs: Format arguments

    Returns:
        Formatted message string
    """
    loader = AgnoToolsMessageLoader(lang)
    return loader.get(key, **kwargs)
