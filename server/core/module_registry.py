"""Backend module registry for lightweight plugin-style enablement."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from importlib import import_module
from importlib import util as importlib_util
from typing import TYPE_CHECKING

from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

if TYPE_CHECKING:
    from fastapi import FastAPI


@dataclass(frozen=True)
class ModuleDefinition:
    id: str
    router_module: str
    router_attr: str = "router"
    dependencies: tuple[str, ...] = ()
    requires: tuple[str, ...] = ()
    core: bool = False


MODULES: tuple[ModuleDefinition, ...] = (
    ModuleDefinition(id="health", router_module="routers.health", core=True),
    ModuleDefinition(id="config", router_module="routers.config", core=True),
    ModuleDefinition(id="system", router_module="routers.system", core=True),
    ModuleDefinition(id="logs", router_module="routers.logs"),
    ModuleDefinition(id="preview", router_module="routers.preview"),
    ModuleDefinition(id="chat", router_module="routers.chat"),
    ModuleDefinition(id="agent_plan", router_module="routers.agent_plan"),
    ModuleDefinition(id="activity", router_module="routers.activity"),
    ModuleDefinition(id="search", router_module="routers.search"),
    ModuleDefinition(id="screenshot", router_module="routers.screenshot"),
    ModuleDefinition(id="event", router_module="routers.event"),
    ModuleDefinition(
        id="vector",
        router_module="routers.vector",
        dependencies=("chromadb", "sentence_transformers", "hdbscan", "scipy"),
    ),
    ModuleDefinition(
        id="rag",
        router_module="routers.rag",
        dependencies=("chromadb", "sentence_transformers", "hdbscan", "scipy"),
        requires=("vector",),
    ),
    ModuleDefinition(id="scheduler", router_module="routers.scheduler"),
    ModuleDefinition(
        id="automation",
        router_module="routers.automation",
        requires=("scheduler",),
    ),
    ModuleDefinition(id="cost_tracking", router_module="routers.cost_tracking"),
    ModuleDefinition(id="time_allocation", router_module="routers.time_allocation"),
    ModuleDefinition(id="todo", router_module="routers.todo"),
    ModuleDefinition(id="todo_extraction", router_module="routers.todo_extraction"),
    ModuleDefinition(id="journal", router_module="routers.journal"),
    ModuleDefinition(id="vision", router_module="routers.vision"),
    ModuleDefinition(id="notification", router_module="routers.notification"),
    ModuleDefinition(id="floating_capture", router_module="routers.floating_capture"),
    ModuleDefinition(id="crawler", router_module="routers.crawler"),
    ModuleDefinition(id="audio", router_module="routers.audio"),
    ModuleDefinition(id="perception", router_module="routers.perception_ws"),
    ModuleDefinition(
        id="perception_ingest",
        router_module="routers.perception_ingest",
    ),
    ModuleDefinition(
        id="sensor_control",
        router_module="routers.sensor_control",
    ),
    ModuleDefinition(id="plugin", router_module="routers.plugin"),
    ModuleDefinition(
        id="memory",
        router_module="routers.memory",
        requires=("perception",),
    ),
    ModuleDefinition(
        id="omi_compat",
        router_module="routers.omi_compat",
    ),
    ModuleDefinition(id="location", router_module="routers.location"),
)

MODULE_INDEX = {module.id: module for module in MODULES}
CORE_MODULES = {module.id for module in MODULES if module.core}


@dataclass
class ModuleState:
    id: str
    enabled: bool
    available: bool
    missing_deps: list[str]


def _normalize_module_list(value: object | None) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        return {value}
    if isinstance(value, Iterable):
        return {str(item) for item in value}
    return set()


def _missing_dependencies(dependencies: tuple[str, ...]) -> list[str]:
    missing: list[str] = []
    for dep in dependencies:
        if importlib_util.find_spec(dep) is None:
            missing.append(dep)
    return missing


def _get_enabled_module_ids() -> set[str]:
    enabled = _normalize_module_list(settings.get("backend_modules.enabled"))
    disabled = _normalize_module_list(settings.get("backend_modules.disabled"))

    if not enabled:
        enabled = {module.id for module in MODULES}

    enabled = enabled.difference(disabled)
    enabled |= CORE_MODULES
    return enabled


def get_module_states() -> dict[str, ModuleState]:
    enabled_ids = _get_enabled_module_ids()
    states: dict[str, ModuleState] = {}
    forced_unavailable = _normalize_module_list(settings.get("backend_modules.unavailable"))

    for module in MODULES:
        missing = _missing_dependencies(module.dependencies)
        states[module.id] = ModuleState(
            id=module.id,
            enabled=module.id in enabled_ids,
            available=not missing,
            missing_deps=missing,
        )

    for module_id in forced_unavailable:
        state = states.get(module_id)
        if not state:
            continue
        if state.available:
            state.available = False
            state.missing_deps.append("config:unavailable")

    for module in MODULES:
        state = states[module.id]
        if state.available and module.requires:
            missing_requires = [
                f"module:{req}"
                for req in module.requires
                if req not in states or not states[req].available
            ]
            if missing_requires:
                state.available = False
                state.missing_deps.extend(missing_requires)

    return states


def log_module_summary(states: dict[str, ModuleState]) -> None:
    enabled_ids = sorted([mid for mid, state in states.items() if state.enabled])
    disabled_ids = sorted([mid for mid, state in states.items() if not state.enabled])
    unavailable_ids = sorted(
        [mid for mid, state in states.items() if state.enabled and not state.available]
    )

    logger.info(f"Backend modules enabled: {', '.join(enabled_ids) or 'none'}")
    logger.info(f"Backend modules disabled: {', '.join(disabled_ids) or 'none'}")
    if unavailable_ids:
        logger.warning(f"Backend modules unavailable: {', '.join(unavailable_ids)}")
        for module_id in unavailable_ids:
            missing = ", ".join(states[module_id].missing_deps) or "unknown"
            logger.warning(f"Backend module deps missing: {module_id} -> {missing}")
    else:
        logger.info("Backend modules unavailable: none")


def get_enabled_module_ids(states: dict[str, ModuleState] | None = None) -> list[str]:
    if states is None:
        states = get_module_states()
    return [module.id for module in MODULES if states[module.id].enabled]


def register_modules(
    app: FastAPI,
    module_ids: Iterable[str],
    states: dict[str, ModuleState] | None = None,
) -> list[str]:
    if states is None:
        states = get_module_states()

    module_id_set = set(module_ids)
    enabled_modules: list[str] = []

    for module in MODULES:
        if module.id not in module_id_set:
            continue
        state = states.get(module.id)
        if not state or not state.enabled:
            continue
        if not state.available:
            logger.warning(
                f"Module disabled due to missing deps: {module.id} -> {', '.join(state.missing_deps)}"
            )
            continue
        try:
            router_module = import_module(module.router_module)
            router = getattr(router_module, module.router_attr)
            app.include_router(router)
            enabled_modules.append(module.id)
        except Exception as exc:
            logger.error(f"Failed to register module {module.id}: {exc}")

    return enabled_modules


def register_enabled_modules(app: FastAPI) -> list[str]:
    states = get_module_states()
    log_module_summary(states)
    enabled_ids = get_enabled_module_ids(states)
    return register_modules(app, enabled_ids, states=states)


def get_capabilities_report() -> dict[str, object]:
    states = get_module_states()

    enabled_modules = [mid for mid, state in states.items() if state.enabled]
    available_modules = [mid for mid, state in states.items() if state.available]
    disabled_modules = [mid for mid, state in states.items() if not state.enabled]
    missing_deps = {mid: state.missing_deps for mid, state in states.items() if state.missing_deps}

    return {
        "enabled_modules": sorted(enabled_modules),
        "available_modules": sorted(available_modules),
        "disabled_modules": sorted(disabled_modules),
        "missing_deps": missing_deps,
    }
