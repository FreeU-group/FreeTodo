"""先验注册表"""

from ..models import AppType
from .base import AppPrior
from .feishu import FeishuPrior
from .wechat import WeChatPrior

_prior_registry: dict[AppType, AppPrior] = {}


def _init_default_priors():
    register_prior(AppType.WECHAT, WeChatPrior())
    register_prior(AppType.FEISHU, FeishuPrior())


def register_prior(app_type: AppType, prior: AppPrior):
    _prior_registry[app_type] = prior


def get_prior(app_type: AppType) -> AppPrior | None:
    if not _prior_registry:
        _init_default_priors()
    return _prior_registry.get(app_type)


def list_priors() -> dict[AppType, AppPrior]:
    if not _prior_registry:
        _init_default_priors()
    return _prior_registry.copy()
