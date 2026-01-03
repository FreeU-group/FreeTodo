"""迁移 audio_recordings 表，添加新字段"""

import sys
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from lifetrace.storage.database_base import DatabaseBase

if __name__ == "__main__":
    print("开始迁移 audio_recordings 表...")
    db = DatabaseBase()
    print("✅ 数据库迁移完成！新字段已添加。")
