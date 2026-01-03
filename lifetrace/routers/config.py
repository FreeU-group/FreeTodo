"""配置相关路由"""

from typing import Any

from fastapi import APIRouter, HTTPException
from openai import OpenAI

from lifetrace.services.config_service import ConfigService, is_llm_configured
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

router = APIRouter(prefix="/api", tags=["config"])


# 初始化配置服务
config_service = ConfigService()


def _validate_aliyun_api_key(llm_key: str) -> dict[str, Any] | None:
    """验证阿里云 API Key 格式"""
    MIN_ALIYUN_KEY_LENGTH = 20

    if not llm_key.startswith("sk-"):
        return {
            "success": False,
            "error": "阿里云 API Key 格式错误，应该以 'sk-' 开头",
        }
    if len(llm_key) < MIN_ALIYUN_KEY_LENGTH:
        return {
            "success": False,
            "error": f"阿里云 API Key 长度异常（当前: {len(llm_key)} 字符），请检查是否完整",
        }
    return None


def _handle_llm_test_error(error_msg: str, model: str) -> dict[str, Any]:
    """处理LLM测试错误，返回友好的错误信息"""
    if "401" in error_msg or "invalid_api_key" in error_msg:
        return {
            "success": False,
            "error": f"API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n2. API Key 是否已启用\n3. API Key 是否有权限访问所选模型\n\n原始错误: {error_msg}",
        }
    if "404" in error_msg:
        return {
            "success": False,
            "error": f"模型 '{model}' 不存在或无权访问，请检查模型名称是否正确\n\n原始错误: {error_msg}",
        }
    return {"success": False, "error": error_msg}


def _get_config_value(config_data: dict[str, Any], camel_key: str, snake_key: str) -> Any:
    """从配置数据中获取值，同时支持 camelCase 和 snake_case 格式

    Args:
        config_data: 配置字典
        camel_key: camelCase 格式的键（如 llmApiKey）
        snake_key: snake_case 格式的键（如 llm_api_key）

    Returns:
        配置值，如果都不存在则返回 None
    """
    return config_data.get(camel_key) or config_data.get(snake_key)


@router.post("/test-llm-config")
async def test_llm_config(config_data: dict[str, str]):
    """测试LLM配置是否可用（仅验证认证）"""
    try:
        # 同时支持 camelCase 和 snake_case 格式（前端 fetcher 会自动转换为 snake_case）
        llm_key = _get_config_value(config_data, "llmApiKey", "llm_api_key")
        base_url = _get_config_value(config_data, "llmBaseUrl", "llm_base_url")
        model = _get_config_value(config_data, "llmModel", "llm_model")

        if not llm_key or not base_url:
            return {"success": False, "error": "LLM Key 和 Base URL 不能为空"}

        # 验证 API Key 格式（针对阿里云）
        if base_url and "aliyun" in base_url.lower():
            validation_error = _validate_aliyun_api_key(llm_key)
            if validation_error:
                return validation_error

        logger.info(f"开始测试 LLM 配置 - 模型: {model}, Key前缀: {llm_key[:10]}...")

        # 创建临时客户端进行测试
        client = OpenAI(api_key=llm_key, base_url=base_url)

        # 发送最小化测试请求验证认证
        try:
            client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": "test"}], max_tokens=5
            )
            logger.info(f"LLM配置测试成功 - 模型: {model}")
            return {"success": True, "message": "配置验证成功"}
        except Exception as e:
            logger.error(f"LLM配置测试失败: {e} - 模型: {model}, Key前缀: {llm_key[:10]}...")
            return {"success": False, "error": str(e)}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"LLM配置测试失败: {error_msg}")
        return _handle_llm_test_error(error_msg, model)


@router.post("/test-tavily-config")
async def test_tavily_config(config_data: dict[str, str]):
    """测试Tavily配置是否可用（仅验证认证）"""
    try:
        from tavily import TavilyClient

        # 同时支持 camelCase 和 snake_case 格式（前端 fetcher 会自动转换为 snake_case）
        tavily_key = _get_config_value(config_data, "tavilyApiKey", "tavily_api_key")

        if not tavily_key:
            return {"success": False, "error": "Tavily API Key 不能为空"}

        # 检查是否为占位符
        invalid_values = [
            "xxx",
            "YOUR_API_KEY_HERE",
            "YOUR_TAVILY_API_KEY_HERE",
        ]
        if tavily_key in invalid_values:
            return {"success": False, "error": "请填写有效的 Tavily API Key"}

        logger.info(f"开始测试 Tavily 配置 - Key前缀: {tavily_key[:10]}...")

        # 创建临时客户端进行测试
        try:
            client = TavilyClient(api_key=tavily_key)
            # 执行一个简单的搜索请求来验证 API key
            client.search(query="test", max_results=1)
            logger.info("Tavily配置测试成功")
            return {"success": True, "message": "配置验证成功"}
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Tavily配置测试失败: {error_msg} - Key前缀: {tavily_key[:10]}...")
            # 处理常见的错误
            if "401" in error_msg or "unauthorized" in error_msg.lower():
                return {
                    "success": False,
                    "error": "API Key 无效，请检查：\n1. 是否从 Tavily 控制台正确复制了完整的 API Key\n2. API Key 是否已启用\n\n原始错误: "
                    + error_msg,
                }
            return {"success": False, "error": error_msg}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Tavily配置测试失败: {error_msg}")
        return {"success": False, "error": error_msg}


@router.get("/get-config")
async def get_config_detailed():
    """获取当前配置（返回驼峰格式的配置键）"""
    try:
        # 使用配置服务获取前端格式的配置
        config_dict = config_service.get_config_for_frontend()

        return {
            "success": True,
            "config": config_dict,
        }
    except Exception as e:
        logger.error(f"获取配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}") from e


def _validate_config_fields(config_data: dict[str, str]) -> dict[str, Any] | None:
    """验证配置字段，返回错误信息或 None"""
    # 同时支持 camelCase 和 snake_case 格式
    llm_key = _get_config_value(config_data, "llmApiKey", "llm_api_key")
    base_url = _get_config_value(config_data, "llmBaseUrl", "llm_base_url")
    model = _get_config_value(config_data, "llmModel", "llm_model")

    # 检查必需字段
    missing_fields = []
    if not llm_key:
        missing_fields.append("llmApiKey")
    if not base_url:
        missing_fields.append("llmBaseUrl")
    if not model:
        missing_fields.append("llmModel")

    if missing_fields:
        return {
            "success": False,
            "error": f"缺少必需字段: {', '.join(missing_fields)}",
        }

    # 验证字段类型和内容
    if not isinstance(llm_key, str) or not llm_key.strip():
        return {"success": False, "error": "LLM Key必须是非空字符串"}

    if not isinstance(base_url, str) or not base_url.strip():
        return {"success": False, "error": "Base URL必须是非空字符串"}

    if not isinstance(model, str) or not model.strip():
        return {"success": False, "error": "模型名称必须是非空字符串"}

    return None


@router.post("/save-and-init-llm")
async def save_and_init_llm(config_data: dict[str, str]):
    """保存配置并重新初始化LLM服务"""
    try:
        # 验证必需字段
        validation_error = _validate_config_fields(config_data)
        if validation_error:
            return validation_error

        # 1. 先测试配置
        test_result = await test_llm_config(config_data)
        if not test_result["success"]:
            return test_result

        # 2. 保存配置到文件（save_config 内部已经会重载配置并智能判断是否需要重新初始化 LLM）
        save_result = await save_config(config_data)

        if not save_result.get("success"):
            return {"success": False, "error": "保存配置失败"}

        # 3. 更新配置状态（配置重载和 LLM 重新初始化已在 save_config 中完成）
        llm_configured = is_llm_configured()
        status = "已配置" if llm_configured else "未配置"
        logger.info(f"LLM配置状态已更新为：{status}")

        return {"success": True, "message": "配置保存成功，正在跳转..."}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"保存并初始化LLM失败: {error_msg}")
        return {"success": False, "error": error_msg}


@router.post("/save-config")
async def save_config(settings: dict[str, Any]):
    """保存配置到config.yaml文件"""
    try:
        # 定义更新 LLM 配置状态的回调函数（配置状态已通过 config.is_configured() 实时获取）
        def update_llm_configured_status():
            # 配置状态现在通过 config.is_configured() 实时获取
            pass

        # 调用配置服务保存配置
        result = config_service.save_config(settings, update_llm_configured_status)
        return result

    except Exception as e:
        logger.error(f"保存配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}") from e


@router.get("/get-chat-prompts")
async def get_chat_prompts(locale: str = "zh"):
    """获取前端聊天功能所需的 prompt

    Args:
        locale: 语言代码，'zh' 或 'en'，默认为 'zh'

    Returns:
        包含 editSystemPrompt 和 planSystemPrompt 的字典
    """
    try:
        # 根据语言选择对应的 prompt key
        edit_key = "edit_system_prompt_zh" if locale == "zh" else "edit_system_prompt_en"
        plan_key = "plan_system_prompt_zh" if locale == "zh" else "plan_system_prompt_en"

        edit_prompt = get_prompt("chat_frontend", edit_key)
        plan_prompt = get_prompt("chat_frontend", plan_key)

        if not edit_prompt or not plan_prompt:
            logger.warning(f"无法加载 prompt，locale={locale}")
            raise HTTPException(
                status_code=500,
                detail="无法加载 prompt 配置，请检查 prompt.yaml",
            )

        return {
            "success": True,
            "editSystemPrompt": edit_prompt,
            "planSystemPrompt": plan_prompt,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取聊天 prompt 失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"获取聊天 prompt 失败: {str(e)}",
        ) from e
