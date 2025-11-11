"""计划编辑器相关路由"""

import json
import os
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.plan import PlanContent

router = APIRouter(prefix="/api/plan", tags=["plan"])

# 创建plans目录
PLANS_DIR = None
PLAN_IMAGES_DIR = None


def init_plan_dirs():
    """初始化计划目录"""
    global PLANS_DIR, PLAN_IMAGES_DIR
    if PLANS_DIR is None:
        PLANS_DIR = Path(deps.config.plans_dir)
        PLANS_DIR.mkdir(exist_ok=True)
    if PLAN_IMAGES_DIR is None:
        PLAN_IMAGES_DIR = Path(deps.config.plan_images_dir)
        PLAN_IMAGES_DIR.mkdir(exist_ok=True)


@router.post("/save")
async def save_plan(plan: PlanContent):
    """保存计划到文件"""
    try:
        init_plan_dirs()
        plan_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = PLANS_DIR / f"{plan_id}.json"

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(plan.dict(), f, ensure_ascii=False, indent=2)

        deps.logger.info(f"计划已保存: {plan_id}")
        return {"plan_id": plan_id, "message": "保存成功"}
    except Exception as e:
        deps.logger.error(f"保存计划失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存计划失败: {str(e)}") from e


@router.get("/load")
async def load_plan(plan_id: str):
    """加载指定计划"""
    try:
        init_plan_dirs()
        file_path = PLANS_DIR / f"{plan_id}.json"
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="计划不存在")

        with open(file_path, encoding="utf-8") as f:
            data = json.load(f)

        return data
    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"加载计划失败: {e}")
        raise HTTPException(status_code=500, detail=f"加载计划失败: {str(e)}") from e


@router.get("/list")
async def list_plans():
    """列出所有计划"""
    try:
        init_plan_dirs()
        plans = []
        for file_path in PLANS_DIR.glob("*.json"):
            with open(file_path, encoding="utf-8") as f:
                data = json.load(f)
                plans.append(
                    {
                        "plan_id": file_path.stem,
                        "title": data.get("title", "未命名计划"),
                        "created_at": file_path.stem,  # 从文件名提取时间
                    }
                )

        plans.sort(key=lambda x: x["created_at"], reverse=True)
        return {"plans": plans}
    except Exception as e:
        deps.logger.error(f"列出计划失败: {e}")
        raise HTTPException(status_code=500, detail=f"列出计划失败: {str(e)}") from e


@router.post("/upload-image")
async def upload_plan_image(image: UploadFile = File(...)):
    """上传计划中的图片"""
    try:
        init_plan_dirs()
        # 生成唯一文件名
        file_ext = image.filename.split(".")[-1] if "." in image.filename else "png"
        file_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{os.urandom(4).hex()}"
        filename = f"{file_id}.{file_ext}"
        file_path = PLAN_IMAGES_DIR / filename

        # 保存文件
        content = await image.read()
        with open(file_path, "wb") as f:
            f.write(content)

        deps.logger.info(f"图片已上传: {filename}")
        return {"url": f"/api/plan/images/{filename}"}
    except Exception as e:
        deps.logger.error(f"上传图片失败: {e}")
        raise HTTPException(status_code=500, detail=f"上传图片失败: {str(e)}") from e


@router.get("/images/{filename}")
async def get_plan_image(filename: str):
    """获取计划图片"""
    init_plan_dirs()
    file_path = PLAN_IMAGES_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="图片不存在")
    return FileResponse(file_path)
