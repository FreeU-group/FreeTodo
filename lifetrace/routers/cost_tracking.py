"""费用统计相关路由"""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.token_usage_logger import get_token_logger

router = APIRouter(prefix="/api/cost-tracking", tags=["cost-tracking"])
logger = get_logger()


@router.get("/stats")
async def get_cost_stats(days: int = Query(30, description="统计天数")):
    """
    获取费用统计数据

    Args:
        days: 统计最近多少天的数据
    """
    try:
        token_logger = get_token_logger()
        if not token_logger:
            raise HTTPException(status_code=500, detail="Token日志记录器未初始化")

        # 获取token使用统计（已包含成本计算）
        stats = token_logger.get_usage_stats(days=days)

        # 获取当前模型配置
        current_model = settings.llm.model

        # 获取价格配置
        token_logger = get_token_logger()
        try:
            input_price, output_price = token_logger._get_model_price(current_model)
        except Exception:
            input_price, output_price = 0.0, 0.0

        # 整理功能类型费用数据
        feature_costs = {}
        for feature_type, feature_stats in stats.get("feature_stats", {}).items():
            feature_costs[feature_type] = {
                "input_tokens": feature_stats.get("input_tokens", 0),
                "output_tokens": feature_stats.get("output_tokens", 0),
                "total_tokens": feature_stats.get("total_tokens", 0),
                "requests": feature_stats.get("requests", 0),
                "cost": round(feature_stats.get("total_cost", 0), 4),
            }

        # 整理模型费用数据
        model_costs = {}
        for model, model_stats in stats.get("model_stats", {}).items():
            model_costs[model] = {
                "input_tokens": model_stats.get("input_tokens", 0),
                "output_tokens": model_stats.get("output_tokens", 0),
                "total_tokens": model_stats.get("total_tokens", 0),
                "requests": model_stats.get("requests", 0),
                "input_cost": round(model_stats.get("input_cost", 0), 4),
                "output_cost": round(model_stats.get("output_cost", 0), 4),
                "total_cost": round(model_stats.get("total_cost", 0), 4),
            }

        # 整理每日费用数据
        daily_costs = {}
        for date_str, daily_stats in stats.get("daily_stats", {}).items():
            daily_costs[date_str] = {
                "input_tokens": daily_stats.get("input_tokens", 0),
                "output_tokens": daily_stats.get("output_tokens", 0),
                "total_tokens": daily_stats.get("total_tokens", 0),
                "requests": daily_stats.get("requests", 0),
                "cost": round(daily_stats.get("total_cost", 0), 4),
            }

        return {
            "success": True,
            "data": {
                "total_cost": round(stats.get("total_cost", 0), 4),
                "total_tokens": stats.get("total_tokens", 0),
                "total_requests": stats.get("total_requests", 0),
                "current_model": current_model,
                "input_token_price": input_price,
                "output_token_price": output_price,
                "feature_costs": feature_costs,
                "model_costs": model_costs,
                "daily_costs": daily_costs,
                "start_date": (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d"),
                "end_date": datetime.now().strftime("%Y-%m-%d"),
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取费用统计失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取费用统计失败: {str(e)}") from e


@router.get("/config")
async def get_cost_config():
    """获取费用统计配置"""
    try:
        current_model = settings.llm.model
        token_logger = get_token_logger()
        try:
            input_price, output_price = token_logger._get_model_price(current_model)
        except Exception:
            input_price, output_price = 0.0, 0.0

        return {
            "success": True,
            "data": {
                "model": current_model,
                "input_token_price": input_price,
                "output_token_price": output_price,
            },
        }
    except Exception as e:
        logger.error(f"获取费用配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取费用配置失败: {str(e)}") from e
