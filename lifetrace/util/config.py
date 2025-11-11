import copy
import logging
import os
import sys
import threading
import time
from collections.abc import Callable
from pathlib import Path

import yaml

# 尝试导入watchdog，如果不可用则优雅降级
try:
    from watchdog.events import FileSystemEventHandler
    from watchdog.observers import Observer

    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False


class LifeTraceConfig:
    """LifeTrace配置管理类"""

    def __init__(self, config_path: str | None = None):
        self.config_path = config_path or self._get_default_config_path()

        # 初始化配置文件（如果不存在则从默认配置复制）
        self._init_config_file()

        self._config = self._load_config()

        # 配置热重载相关
        self._callbacks = []  # 配置变更回调列表
        self._config_lock = threading.RLock()  # 线程安全锁
        self._observer = None  # watchdog观察者
        self._watching = False  # 是否正在监听
        self._last_reload_time = 0  # 最后重载时间（用于防抖）
        self._debounce_delay = 0.5  # 防抖延迟（秒）

    def _get_application_path(self) -> str:
        """获取应用程序路径，兼容PyInstaller打包"""
        if getattr(sys, "frozen", False):
            # 如果是PyInstaller打包的应用，使用可执行文件所在目录
            return os.path.dirname(sys.executable)
        else:
            # 开发环境，使用项目根目录
            return Path(__file__).parent.parent

    def _get_default_config_path(self) -> str:
        """获取默认配置文件路径"""
        # 确保config目录存在
        app_path = self._get_application_path()
        config_dir = os.path.join(app_path, "config")
        os.makedirs(config_dir, exist_ok=True)

        # 使用项目目录下的config/config.yaml作为配置文件
        project_config = os.path.join(config_dir, "config.yaml")
        if os.path.exists(project_config):
            return project_config
        # 如果config.yaml不存在，检查default_config.yaml是否存在
        default_config = os.path.join(config_dir, "default_config.yaml")
        if os.path.exists(default_config):
            # 如果default_config.yaml存在，返回config.yaml的路径（即使不存在）
            return project_config
        # 如果两者都不存在，返回config.yaml的路径
        return project_config

    def _init_config_file(self):
        """初始化配置文件
        检查config.yaml是否存在，如果不存在则从default_config.yaml复制
        """
        # 如果config.yaml已存在，无需初始化
        if os.path.exists(self.config_path):
            logging.debug(f"配置文件已存在: {self.config_path}")
            return

        # 获取default_config.yaml路径
        config_dir = os.path.dirname(self.config_path)
        default_config_path = os.path.join(config_dir, "default_config.yaml")

        # 检查default_config.yaml是否存在
        if not os.path.exists(default_config_path):
            logging.warning(f"默认配置文件不存在: {default_config_path}，将使用内置默认配置")
            return

        try:
            # 复制default_config.yaml到config.yaml
            import shutil

            shutil.copy2(default_config_path, self.config_path)
            logging.info(f"已从默认配置创建配置文件: {self.config_path}")
        except Exception as e:
            logging.error(f"初始化配置文件失败: {e}")

    def _load_config(self) -> dict:
        """加载配置文件
        直接加载配置文件，不进行配置合并
        """
        # 如果配置文件存在，直接加载
        if os.path.exists(self.config_path):
            with open(self.config_path, encoding="utf-8") as f:
                config = yaml.safe_load(f) or {}
                return config

        # 如果配置文件不存在，返回默认配置
        return self._get_default_config()

    def _merge_configs(self, default_config: dict, user_config: dict):
        """递归合并配置，用户配置会覆盖默认配置中的同名项"""
        for key, value in user_config.items():
            if (
                isinstance(value, dict)
                and key in default_config
                and isinstance(default_config[key], dict)
            ):
                # 如果两边都是字典，递归合并
                self._merge_configs(default_config[key], value)
            else:
                # 否则直接覆盖
                default_config[key] = value

    def _get_default_config(self) -> dict:
        """默认配置"""
        return {
            "base_dir": "lifetrace/data",
            "database_path": "lifetrace.db",
            "screenshots_dir": "screenshots/",
            "plans_dir": "plans/",
            "plan_images_dir": "plan_images/",
            "server": {"host": "127.0.0.1", "port": 8000},
            "logging": {
                "level": "INFO",
                "log_path": "logs/",
            },
            "scheduler": {
                "enabled": True,  # 启用调度器
                "database_path": "scheduler.db",  # 调度器数据库路径
                "max_workers": 10,  # 最大工作线程数
                "coalesce": True,  # 合并错过的任务
                "max_instances": 1,  # 同一任务同时只能有一个实例
                "misfire_grace_time": 60,  # 错过触发时间的容忍度（秒）
                "timezone": "Asia/Shanghai",  # 时区
            },
            "jobs": {
                "recorder": {
                    "enabled": True,
                    "interval": 1,  # 截图间隔（秒）
                    "screens": "all",  # 截图屏幕：all 或屏幕编号列表
                    "auto_exclude_self": True,  # 自动排除LifeTrace自身窗口
                    "blacklist": {
                        "enabled": False,  # 是否启用黑名单功能
                        "apps": [],  # 应用黑名单
                        "windows": [],  # 窗口标题黑名单
                    },
                },
                "ocr": {
                    "enabled": True,
                    "use_gpu": False,
                    "language": ["ch", "en"],
                    "interval": 5,  # 数据库检查间隔（秒）
                    "confidence_threshold": 0.5,
                },
            },
            "storage": {
                "max_days": 30,  # 数据保留天数
                "deduplicate": True,  # 启用去重
            },
            "processing": {"batch_size": 10, "queue_size": 100},
            "consistency_check": {"interval": 300},  # 一致性检查间隔（秒）
            "vector_db": {
                "enabled": True,  # 启用向量数据库
                "collection_name": "lifetrace_ocr",  # 集合名称
                "embedding_model": "shibing624/text2vec-base-chinese",  # 嵌入模型
                "rerank_model": "BAAI/bge-reranker-base",  # 重排序模型
                "persist_directory": "vector_db",  # 持久化目录
                "chunk_size": 512,  # 文本块大小
                "chunk_overlap": 50,  # 文本块重叠
                "batch_size": 32,  # 批处理大小
                "auto_sync": True,  # 自动同步
                "sync_interval": 300,  # 同步间隔（秒）
            },
            "sync_service": {
                "enable_file_monitor": True,  # 启用文件监控
                "enable_consistency_check": True,  # 启用一致性检查
                "consistency_check_interval": 300,  # 一致性检查间隔（秒）
                "vector_sync_interval": 600,  # 向量数据库同步间隔（秒）
                "file_monitor_delay": 2.0,  # 文件监控延迟（秒）
                "cleanup_orphaned_files": True,  # 清理孤立文件
                "log_level": "INFO",  # 日志级别
            },
        }

    def save_config(self):
        """保存配置文件
        如果配置文件不存在，则创建默认配置文件
        配置文件保存在config目录下，而不是~目录
        """
        # 获取默认配置文件路径
        default_config_path = os.path.join(
            self._get_application_path(), "config", "default_config.yaml"
        )

        # 确保配置目录存在
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

        # 如果默认配置文件存在，复制并修改
        if os.path.exists(default_config_path):
            import shutil

            shutil.copy2(default_config_path, self.config_path)

            # 读取复制后的配置文件
            with open(self.config_path, encoding="utf-8") as f:
                config_data = yaml.safe_load(f)

            # 修改路径设置（路径应该相对于base_dir）
            config_data["base_dir"] = "lifetrace/data"
            config_data["database_path"] = "lifetrace.db"
            config_data["screenshots_dir"] = "screenshots/"
            if "logging" not in config_data:
                config_data["logging"] = {}
            config_data["logging"]["log_path"] = "logs/"
            if "scheduler" in config_data:
                config_data["scheduler"]["database_path"] = "scheduler.db"

            # 保存修改后的配置
            with open(self.config_path, "w", encoding="utf-8") as f:
                yaml.dump(config_data, f, allow_unicode=True, sort_keys=False)

            # 重新加载配置
            self._config = self._load_config()
            return

        # 如果默认配置文件不存在，创建默认配置
        default_config = self._get_default_config()
        # 确保base_dir、database_path和screenshots_dir使用相对路径（相对于base_dir）
        default_config["base_dir"] = "lifetrace/data"
        default_config["database_path"] = "lifetrace.db"
        default_config["screenshots_dir"] = "screenshots/"

        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.dump(default_config, f, allow_unicode=True, sort_keys=False)

    def get(self, key: str, default=None):
        """获取配置值"""
        keys = key.split(".")
        value = self._config
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        return value

    def set(self, key: str, value):
        """设置配置值"""
        keys = key.split(".")
        config = self._config
        for k in keys[:-1]:
            if k not in config:
                config[k] = {}
            config = config[k]
        config[keys[-1]] = value

    @property
    def base_dir(self) -> str:
        base_dir = self.get("base_dir")
        # 如果是相对路径，转换为绝对路径
        if not os.path.isabs(base_dir):
            base_dir = os.path.join(self._get_application_path(), base_dir)
        # 确保路径末尾没有多余的斜杠
        return base_dir.rstrip(os.sep)

    @property
    def database_path(self) -> str:
        """数据库路径"""
        db_path = self.get("database_path", "lifetrace.db")
        # 如果是相对路径，基于base_dir拼接
        if not os.path.isabs(db_path):
            db_path = os.path.join(self.base_dir, db_path)
        return db_path

    @property
    def screenshots_dir(self) -> str:
        """截图目录路径"""
        screenshots_dir = self.get("screenshots_dir", "screenshots")
        if not os.path.isabs(screenshots_dir):
            # 如果是相对路径，先转换为相对于项目根目录的路径
            screenshots_dir = os.path.join(self.base_dir, screenshots_dir)
        return screenshots_dir

    @property
    def log_path(self) -> str:
        """日志目录路径"""
        log_path = self.get("logging.log_path", "logs/")
        if not os.path.isabs(log_path):
            # 如果是相对路径，基于base_dir拼接
            log_path = os.path.join(self.base_dir, log_path)
        return log_path

    @property
    def plans_dir(self) -> str:
        """计划文件目录路径"""
        plans_dir = self.get("plans_dir", "plans/")
        if not os.path.isabs(plans_dir):
            # 如果是相对路径，基于base_dir拼接
            plans_dir = os.path.join(self.base_dir, plans_dir)
        return plans_dir

    @property
    def plan_images_dir(self) -> str:
        """计划图片目录路径"""
        plan_images_dir = self.get("plan_images_dir", "plan_images/")
        if not os.path.isabs(plan_images_dir):
            # 如果是相对路径，基于base_dir拼接
            plan_images_dir = os.path.join(self.base_dir, plan_images_dir)
        return plan_images_dir

    @property
    def vector_db_enabled(self) -> bool:
        return self.get("vector_db.enabled", True)

    @property
    def vector_db_collection_name(self) -> str:
        return self.get("vector_db.collection_name", "lifetrace_ocr")

    @property
    def vector_db_embedding_model(self) -> str:
        return self.get("vector_db.embedding_model", "shibing624/text2vec-base-chinese")

    @property
    def vector_db_rerank_model(self) -> str:
        return self.get("vector_db.rerank_model", "BAAI/bge-reranker-base")

    @property
    def vector_db_persist_directory(self) -> str:
        persist_dir = self.get("vector_db.persist_directory", "vector_db")
        if not os.path.isabs(persist_dir):
            return os.path.join(self.base_dir, persist_dir)
        return persist_dir

    @property
    def vector_db_chunk_size(self) -> int:
        return self.get("vector_db.chunk_size", 512)

    @property
    def vector_db_chunk_overlap(self) -> int:
        return self.get("vector_db.chunk_overlap", 50)

    @property
    def vector_db_batch_size(self) -> int:
        return self.get("vector_db.batch_size", 32)

    @property
    def vector_db_auto_sync(self) -> bool:
        return self.get("vector_db.auto_sync", True)

    @property
    def vector_db_sync_interval(self) -> int:
        return self.get("vector_db.sync_interval", 300)

    # 同步服务配置属性
    @property
    def enable_file_monitor(self) -> bool:
        return self.get("sync_service.enable_file_monitor", True)

    @property
    def enable_consistency_check(self) -> bool:
        return self.get("sync_service.enable_consistency_check", True)

    @property
    def consistency_check_interval(self) -> int:
        return self.get("sync_service.consistency_check_interval", 300)

    @property
    def vector_sync_interval(self) -> int:
        return self.get("sync_service.vector_sync_interval", 600)

    @property
    def file_monitor_delay(self) -> float:
        return self.get("sync_service.file_monitor_delay", 2.0)

    @property
    def cleanup_orphaned_files(self) -> bool:
        return self.get("sync_service.cleanup_orphaned_files", True)

    @property
    def sync_service_log_level(self) -> str:
        return self.get("sync_service.log_level", "INFO")

    # LLM配置属性
    @property
    def llm_api_key(self) -> str:
        """LLM 密钥"""
        return self.get("llm.api_key", "")

    @property
    def llm_base_url(self) -> str:
        """LLM API基础URL"""
        return self.get("llm.base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")

    @property
    def llm_model(self) -> str:
        """LLM模型名称"""
        return self.get("llm.model", "qwen3-max")

    @property
    def llm_temperature(self) -> float:
        """LLM温度参数"""
        return self.get("llm.temperature", 0.7)

    @property
    def llm_max_tokens(self) -> int:
        """LLM最大token数"""
        return self.get("llm.max_tokens", 2048)

    # 服务器配置属性
    @property
    def server_host(self) -> str:
        """服务器主机地址"""
        return self.get("server.host", "127.0.0.1")

    @property
    def server_port(self) -> int:
        """服务器端口"""
        return self.get("server.port", 8000)

    # 聊天配置属性
    @property
    def chat_local_history(self) -> bool:
        """是否启用本地历史记录"""
        return self.get("chat.local_history", True)

    @property
    def chat_history_limit(self) -> int:
        """历史记录条数限制"""
        return self.get("chat.history_limit", 6)

    # 调度器配置属性
    @property
    def scheduler_enabled(self) -> bool:
        """是否启用调度器"""
        return self.get("scheduler.enabled", True)

    @property
    def scheduler_database_path(self) -> str:
        """调度器数据库路径"""
        db_path = self.get("scheduler.database_path", "scheduler.db")
        # 如果是相对路径，基于base_dir拼接
        if not os.path.isabs(db_path):
            db_path = os.path.join(self.base_dir, db_path)
        return db_path

    @property
    def scheduler_max_workers(self) -> int:
        """调度器最大工作线程数"""
        return self.get("scheduler.max_workers", 10)

    @property
    def scheduler_timezone(self) -> str:
        """调度器时区"""
        return self.get("scheduler.timezone", "Asia/Shanghai")

    def is_configured(self) -> bool:
        """检查LLM配置是否已完成

        Returns:
            bool: 如果llm_key和base_url都已配置（不是占位符或空），返回True
        """
        llm_key = self.llm_api_key
        base_url = self.llm_base_url
        # 检查是否为空或占位符
        invalid_values = [
            "",
            "xxx",
            "YOUR_API_KEY_HERE",
            "YOUR_BASE_URL_HERE",
            "YOUR_LLM_KEY_HERE",
        ]
        return llm_key not in invalid_values and base_url not in invalid_values

    # ==================== 配置热重载相关方法 ====================

    def reload(self) -> bool:
        """重新加载配置文件

        Returns:
            bool: 是否成功重载
        """
        try:
            with self._config_lock:
                # 保存旧配置的深拷贝
                old_config = copy.deepcopy(self._config)

                # 重新加载配置
                new_config = self._load_config()

                # 检查配置是否有变化
                if new_config == old_config:
                    logging.debug("配置文件未发生变化，跳过重载")
                    return True

                # 更新配置
                self._config = new_config

                logging.info("配置文件已重新加载")

                # 触发回调
                for callback in self._callbacks:
                    try:
                        callback(old_config, new_config)
                    except Exception as e:
                        logging.error(f"配置变更回调执行失败: {e}")

                return True

        except Exception as e:
            logging.error(f"配置重载失败: {e}")
            return False

    def register_callback(self, callback: Callable[[dict, dict], None]):
        """注册配置变更回调

        Args:
            callback: 回调函数，接收两个参数：(old_config, new_config)
        """
        if callback not in self._callbacks:
            self._callbacks.append(callback)
            logging.debug(f"已注册配置变更回调: {callback.__name__}")

    def unregister_callback(self, callback: Callable[[dict, dict], None]):
        """取消注册配置变更回调

        Args:
            callback: 要取消的回调函数
        """
        if callback in self._callbacks:
            self._callbacks.remove(callback)
            logging.debug(f"已取消配置变更回调: {callback.__name__}")

    def start_watching(self):
        """启动配置文件监听"""
        if not WATCHDOG_AVAILABLE:
            logging.warning("watchdog库不可用，无法启动配置文件监听")
            return False

        if self._watching:
            logging.debug("配置文件监听已在运行")
            return True

        try:
            # 创建配置文件监听处理器
            event_handler = ConfigFileEventHandler(self)

            # 创建观察者
            self._observer = Observer()

            # 监听配置文件所在目录
            config_dir = os.path.dirname(self.config_path)
            if not config_dir:
                config_dir = "."

            self._observer.schedule(event_handler, config_dir, recursive=False)
            self._observer.start()

            self._watching = True
            logging.info(f"已启动配置文件监听: {self.config_path}")
            return True

        except Exception as e:
            logging.error(f"启动配置文件监听失败: {e}")
            return False

    def stop_watching(self):
        """停止配置文件监听"""
        if not self._watching:
            return

        try:
            if self._observer:
                self._observer.stop()
                self._observer.join(timeout=2)
                self._observer = None

            self._watching = False
            logging.info("已停止配置文件监听")

        except Exception as e:
            logging.error(f"停止配置文件监听失败: {e}")

    def _should_reload(self) -> bool:
        """检查是否应该重载配置（防抖）"""
        current_time = time.time()
        if current_time - self._last_reload_time < self._debounce_delay:
            return False
        self._last_reload_time = current_time
        return True


class ConfigFileEventHandler(FileSystemEventHandler):
    """配置文件变更事件处理器"""

    def __init__(self, config: LifeTraceConfig):
        super().__init__()
        self.config = config

    def on_modified(self, event):
        """文件修改事件"""
        if event.is_directory:
            return

        # 只处理配置文件的修改
        if os.path.abspath(event.src_path) == os.path.abspath(self.config.config_path):
            if self.config._should_reload():
                logging.info(f"检测到配置文件变更: {event.src_path}")
                # 延迟一小段时间，确保文件写入完成
                threading.Timer(0.1, self.config.reload).start()


# 全局配置实例
config = LifeTraceConfig()
