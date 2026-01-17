"""Prompt 模板工具模块

提供严格的模板变量验证和替换功能
"""

import re

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def template_string(template: str, inputs: dict) -> str:
    """
    严格验证模板变量并执行替换

    验证模板中所有占位符是否都有对应的输入参数，如果缺少则抛出详细的错误信息。

    Args:
        template: 模板字符串，使用 {variable} 格式的占位符
        inputs: 输入参数字典，包含用于替换占位符的值

    Returns:
        替换后的字符串

    Raises:
        ValueError: 如果模板中有占位符在 inputs 中不存在

    Example:
        >>> template_string("Hello {name}, today is {date}", {"name": "Alice", "date": "2024-01-01"})
        'Hello Alice, today is 2024-01-01'

        >>> template_string("Hello {name}", {})
        ValueError: Template validation failed: Missing required parameters: {'name'}...
    """
    if not template:
        return ""

    # 查找所有占位符（格式：{variable_name}）
    placeholder_regex = r"\{(\w+)\}"
    placeholders = re.findall(placeholder_regex, template)

    if not placeholders:
        # 没有占位符，直接返回模板
        return template

    # 检查所有必需的键
    required_keys = set(placeholders)
    input_keys = set(inputs.keys())
    missing_keys = required_keys - input_keys

    if missing_keys:
        # 缺少必需的参数，抛出详细的错误信息
        error_msg = (
            f"Template validation failed: Missing required parameters: {sorted(missing_keys)}. "
            f"Available inputs: {sorted(input_keys)}"
        )
        logger.error(f"{error_msg}. Template: {template[:100]}...")
        raise ValueError(error_msg)

    # 所有必需的键都存在，执行替换
    try:
        return template.format(**inputs)
    except KeyError as e:
        # 理论上不应该到这里，因为我们已经验证过了
        # 但 format() 可能因为其他原因失败（如格式化错误）
        error_msg = f"Template format failed: {e}. Template: {template[:100]}..."
        logger.error(error_msg)
        raise ValueError(error_msg) from e
    except Exception as e:
        # 其他意外错误
        error_msg = f"Template replacement failed: {e}. Template: {template[:100]}..."
        logger.error(error_msg)
        raise ValueError(error_msg) from e
