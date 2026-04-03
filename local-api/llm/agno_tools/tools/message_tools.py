"""Message Drafting Tools

Draft structured reply messages for social coordination.
"""

from __future__ import annotations

from llm.agno_tools.base import get_message
from util.logging_config import get_logger

logger = get_logger()


class MessageTools:
    """Message drafting tools mixin"""

    lang: str

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def draft_reply_message(
        self,
        recipient: str,
        message_body: str,
        reason: str | None = None,
    ) -> str:
        """Draft a reply message for the user to review before sending

        Formats a structured message card containing the recipient,
        message body, and optional context/reason. The user can then
        confirm, edit, or cancel.

        Args:
            recipient: Who the message is for (e.g. "Lisa")
            message_body: The message content to send
            reason: Optional context explaining why this reply is suggested

        Returns:
            Formatted message card ready for user review
        """
        try:
            return self._msg(
                "draft_message_card",
                recipient=recipient,
                body=message_body,
                reason=reason or "",
            )
        except Exception as e:
            logger.error(f"Failed to draft message: {e}")
            return self._msg("draft_message_failed", error=str(e))
