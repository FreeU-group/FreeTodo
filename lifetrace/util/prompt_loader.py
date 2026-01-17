"""提示词加载器模块

从配置文件中加载 LLM 提示词
"""

import os

import yaml

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_template import template_string

logger = get_logger()


class PromptLoader:
    """提示词加载器"""

    _instance = None
    _prompts = None

    def __new__(cls):
        """单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化提示词加载器"""
        if self._prompts is None:
            self._load_prompts()

    def _load_prompts(self):
        """从 prompts/ 目录或 prompt.yaml 文件加载提示词

        优先从 prompts/ 目录加载所有 yaml 文件，如果目录不存在则回退到单个 prompt.yaml 文件。
        """
        try:
            # 获取配置文件路径
            from lifetrace.util.path_utils import get_config_dir

            config_dir = get_config_dir()
            prompts_dir = config_dir / "prompts"
            self._prompts = {}

            if prompts_dir.exists() and prompts_dir.is_dir():
                # 新方案：从 prompts/ 目录加载所有 yaml 文件
                yaml_files = list(prompts_dir.glob("*.yaml"))
                if yaml_files:
                    for yaml_file in yaml_files:
                        try:
                            with open(yaml_file, encoding="utf-8") as f:
                                data = yaml.safe_load(f) or {}
                                self._prompts.update(data)
                        except Exception as e:
                            logger.error(f"加载提示词文件失败 ({yaml_file.name}): {e}")

                    logger.info(
                        f"提示词配置加载成功，从 {len(yaml_files)} 个文件中加载了 {len(self._prompts)} 个分类"
                    )
                    return

            # 回退方案：加载单个 prompt.yaml 文件
            prompt_file = config_dir / "prompt.yaml"
            if not prompt_file.exists():
                logger.error(f"提示词配置文件不存在: {prompt_file}")
                return

            with open(prompt_file, encoding="utf-8") as f:
                self._prompts = yaml.safe_load(f) or {}

            logger.info(f"提示词配置加载成功，共 {len(self._prompts)} 个分类")

        except Exception as e:
            logger.error(f"加载提示词配置失败: {e}")
            self._prompts = {}

    def _is_prompt_enabled(self, category: str, key: str) -> bool:
        """
        检查 prompt 模块是否启用

        通过环境变量 LIFETRACE_PROMPT_{CATEGORY}_{KEY} 控制模块启用/禁用
        格式：LIFETRACE_PROMPT_{CATEGORY}_{KEY}=0/1 或 false/true

        Args:
            category: 提示词分类
            key: 提示词键名

        Returns:
            True 如果模块启用（默认），False 如果被禁用
        """
        # 构建环境变量名：LIFETRACE_PROMPT_{CATEGORY}_{KEY}
        env_var_name = f"LIFETRACE_PROMPT_{category.upper()}_{key.upper()}"
        env_var = os.environ.get(env_var_name)

        if env_var is None:
            # 没有设置环境变量，默认启用
            return True

        # 检查环境变量的值
        env_var_lower = env_var.strip().lower()
        # 如果值为 '0' 或 'false'，则禁用
        if env_var_lower in ("0", "false"):
            return False

        # 其他值（'1', 'true', 或任意值）都视为启用
        return True

    def get_prompt(self, category: str, key: str, **kwargs) -> str:
        """
        获取提示词

        Args:
            category: 提示词分类（如 'rag', 'llm_client', 'event_summary'）
            key: 提示词键名
            **kwargs: 格式化参数（用于替换提示词模板中的占位符）

        Returns:
            格式化后的提示词字符串

        Note:
            - 如果模块被环境变量禁用，返回空字符串
            - 使用严格的模板验证（template_string）替代 format()
        """
        try:
            # 检查模块是否启用
            if not self._is_prompt_enabled(category, key):
                logger.debug(f"提示词模块已禁用: {category}.{key} (环境变量)")
                return ""

            # 获取提示词模板
            prompt_template = self._prompts.get(category, {}).get(key, "")

            if not prompt_template:
                logger.warning(f"未找到提示词: {category}.{key}")
                return ""

            # 如果有格式化参数，使用严格的模板验证
            if kwargs:
                return template_string(prompt_template, kwargs)

            return prompt_template

        except Exception as e:
            logger.error(f"获取提示词失败 ({category}.{key}): {e}")
            return ""

    def reload(self):
        """重新加载提示词配置"""
        logger.info("重新加载提示词配置...")
        self._load_prompts()


# 创建全局单例实例
prompt_loader = PromptLoader()


def get_prompt(category: str, key: str, **kwargs) -> str:
    """
    便捷函数：获取提示词

    Args:
        category: 提示词分类
        key: 提示词键名
        **kwargs: 格式化参数

    Returns:
        格式化后的提示词字符串
    """
    return prompt_loader.get_prompt(category, key, **kwargs)
