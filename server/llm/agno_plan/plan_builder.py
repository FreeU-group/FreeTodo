"""Plan Builder - create executable plan specs."""

from __future__ import annotations

import json
import uuid
from typing import Any

from llm.llm_client import LLMClient
from schemas.agent_plan import PlanSpec
from util.logging_config import get_logger
from util.prompt_loader import get_prompt

logger = get_logger()


DEFAULT_SYSTEM_PROMPT = (
    "You are an execution plan generator. Output a JSON object {plan_id, title, steps}."
    "Each step must include: step_id, name, type, inputs, depends_on."
    "Output JSON only."
)

DEFAULT_USER_PROMPT = (
    "Goal: {message}\n\n"
    "Context: {context_info}\n\n"
    "Tools:\n{tools_json}\n\n"
    "Generate an executable plan JSON."
)


class PlanBuilder:
    """Plan Builder"""

    def __init__(self, llm_client: LLMClient | None = None):
        self.llm_client = llm_client or LLMClient()

    def build_plan(
        self,
        *,
        message: str,
        context_info: str | None,
        tools_catalog: list[dict[str, Any]],
    ) -> PlanSpec:
        """Build plan spec via LLM."""
        system_prompt = get_prompt("plan_exec", "system") or DEFAULT_SYSTEM_PROMPT
        tools_json = json.dumps(tools_catalog, ensure_ascii=False, indent=2)
        user_prompt = get_prompt(
            "plan_exec",
            "user",
            message=message,
            context_info=context_info or "none",
            tools_json=tools_json,
        )
        if not user_prompt:
            user_prompt = DEFAULT_USER_PROMPT.format(
                message=message, context_info=context_info or "none", tools_json=tools_json
            )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = self.llm_client.chat(messages=messages, temperature=0.2)
        plan_data = self._parse_json(response)
        plan_data = self._normalize_plan(plan_data)
        return PlanSpec.model_validate(plan_data)

    def _parse_json(self, text: str) -> dict[str, Any]:
        clean = text.strip()
        if clean.startswith("```json"):
            clean = clean[7:]
        if clean.startswith("```"):
            clean = clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()
        try:
            return json.loads(clean)
        except json.JSONDecodeError as exc:
            logger.error(f"Failed to parse plan JSON: {exc}")
            raise

    def _normalize_plan(self, plan: dict[str, Any]) -> dict[str, Any]:
        if not plan.get("plan_id"):
            plan["plan_id"] = f"pln_{uuid.uuid4().hex[:12]}"
        if not plan.get("title"):
            plan["title"] = plan.get("plan_id", "Plan")

        steps = plan.get("steps") or []
        normalized_steps: list[dict[str, Any]] = []
        for idx, step in enumerate(steps, start=1):
            if not step.get("step_id"):
                step["step_id"] = f"s{idx}"
            if "depends_on" not in step or step["depends_on"] is None:
                step["depends_on"] = []
            if "inputs" not in step or step["inputs"] is None:
                step["inputs"] = {}
            if "on_fail" not in step or not step["on_fail"]:
                step["on_fail"] = "stop"
            normalized_steps.append(step)
        plan["steps"] = normalized_steps
        return plan
