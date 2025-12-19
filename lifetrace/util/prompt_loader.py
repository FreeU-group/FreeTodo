"""提示词加载器模块

从配置文件中加载 LLM 提示词
"""

import yaml

from lifetrace.util.logging_config import get_logger

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
        """从 YAML 文件加载提示词"""
        try:
            # 获取配置文件路径
            from lifetrace.util.path_utils import get_config_dir

            config_dir = get_config_dir()
            prompt_file = config_dir / "prompt.yaml"

            if not prompt_file.exists():
                logger.error(f"提示词配置文件不存在: {prompt_file}")
                self._prompts = {}
                return

            # 读取 YAML 文件
            with open(prompt_file, encoding="utf-8") as f:
                self._prompts = yaml.safe_load(f) or {}

            logger.info(f"提示词配置加载成功，共 {len(self._prompts)} 个分类")

        except Exception as e:
            logger.error(f"加载提示词配置失败: {e}")
            self._prompts = {}

    def get_prompt(self, category: str, key: str, **kwargs) -> str:
        """
        获取提示词

        Args:
            category: 提示词分类（如 'rag', 'llm_client', 'event_summary'）
            key: 提示词键名
            **kwargs: 格式化参数（用于替换提示词模板中的占位符）

        Returns:
            格式化后的提示词字符串
        """
        try:
            # 获取提示词模板
            prompt_template = self._prompts.get(category, {}).get(key, "")

            if not prompt_template:
                logger.warning(f"未找到提示词: {category}.{key}")
                return ""

            # 如果有格式化参数，进行格式化
            if kwargs:
                return prompt_template.format(**kwargs)

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
