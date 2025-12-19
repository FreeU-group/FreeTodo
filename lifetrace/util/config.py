import os
import re
import shutil
import sys
import threading

import yaml

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def backend_to_frontend_key(backend_key: str) -> str:
    """将后端配置键转换为前端格式（驼峰命名）

    将点和下划线都视为分隔符，转换为驼峰命名。
    例如：
    - jobs.recorder.params.auto_exclude_self -> jobsRecorderParamsAutoExcludeSelf
    - llm.api_key -> llmApiKey
    - ui.theme -> uiTheme

    Args:
        backend_key: 后端配置键（如 jobs.recorder.params.auto_exclude_self）

    Returns:
        前端配置键（驼峰形式，如 jobsRecorderParamsAutoExcludeSelf）
    """
    # 将点和下划线都替换为空格，然后分割
    parts = re.split(r"[._]", backend_key)
    # 第一个部分保持小写，其余部分首字母大写
    if not parts:
        return backend_key
    return parts[0].lower() + "".join(word.capitalize() for word in parts[1:])


def _process_nested_path_parts(parts: list[str], i: int, result: list[str]) -> int:
    """处理嵌套的配置路径部分"""
    # 如果是 clean_data，特殊处理
    if i < len(parts) and i > 0 and parts[i - 1] == "clean" and parts[i] == "data":
        result[-1] = result[-1] + "_data"
        i += 1

    # 第三级路径（如 params）
    if i < len(parts) and parts[i] in ["params"]:
        result.append("." + parts[i])
        i += 1

        # 第四级路径（如 blacklist）
        if i < len(parts) and parts[i] in ["blacklist", "auto"]:
            result.append("." + parts[i])
            i += 1
            # 剩余部分用下划线连接
            if i < len(parts):
                result[-1] = result[-1] + "_" + "_".join(parts[i:])
        # 剩余部分用下划线连接
        elif i < len(parts):
            result.append("." + "_".join(parts[i:]))
    # 剩余部分用下划线连接
    elif i < len(parts):
        result.append("." + "_".join(parts[i:]))

    return i


def frontend_to_backend_key(frontend_key: str) -> str:
    """将前端配置键转换为后端格式（下划线命名）

    将驼峰命名转换回下划线命名，同时识别原本是点分隔的路径部分。
    例如：
    - jobsRecorderParamsAutoExcludeSelf -> jobs.recorder.params.auto_exclude_self
    - llmApiKey -> llm.api_key
    - uiTheme -> ui.theme
    """
    # 在大写字母前插入下划线，然后转小写
    s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", frontend_key)
    snake_case = re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()

    # 常见的顶级路径段
    path_segments = ["jobs", "llm", "ui", "server", "chat", "vector", "logging", "scheduler"]
    # 常见的二级路径
    second_level_segments = ["recorder", "clean", "ocr", "task"]

    for segment in path_segments:
        if not snake_case.startswith(segment + "_"):
            continue

        parts = snake_case.split("_")
        result = [parts[0]]  # 第一部分（如 jobs）

        i = 1
        if i >= len(parts):
            return "".join(result)

        # 特殊处理 auto_todo_detection（复合二级路径）
        if (
            i + 2 < len(parts)
            and parts[i] == "auto"
            and parts[i + 1] == "todo"
            and parts[i + 2] == "detection"
        ):
            result.append(".auto_todo_detection")
            i += 3
            # 剩余部分用下划线连接作为配置项
            if i < len(parts):
                result.append("." + "_".join(parts[i:]))
        # 第二级路径（如 recorder）
        elif parts[i] in second_level_segments:
            result.append("." + parts[i])
            i += 1
            i = _process_nested_path_parts(parts, i, result)
        else:
            # 第二级直接是配置项
            result.append("." + "_".join(parts[i:]))

        return "".join(result)

    return snake_case


def _resolve_model_price(
    model: str,
    price_config: dict,
    config_path: str,
    input_tokens: int | None = None,
) -> tuple[float, float]:
    """根据价格配置解析模型的单价（元/千token）

    支持分层定价（tiers）和旧版的 input_price/output_price 直配。
    """

    # 支持分层定价：tiers 为列表，按 max_input_tokens 升序匹配
    if "tiers" in price_config:
        tiers = price_config.get("tiers") or []
        if not isinstance(tiers, list) or not tiers:
            raise ValueError(f"模型 '{model}' 的 tiers 配置无效，请检查配置文件 {config_path}")

        sorted_tiers = sorted(
            tiers,
            key=lambda tier: tier.get("max_input_tokens", float("inf")),
        )
        tokens = input_tokens if input_tokens is not None else 0
        selected_tier = None
        for tier in sorted_tiers:
            max_tokens = tier.get("max_input_tokens")
            # 如果未设置上限或在上限内，则匹配到该档
            if max_tokens is None or tokens <= max_tokens:
                selected_tier = tier
                break
        if selected_tier is None:
            selected_tier = sorted_tiers[-1]

        if "input_price" not in selected_tier or "output_price" not in selected_tier:
            raise KeyError(f"模型 '{model}' 的 tiers 配置缺少 input_price 或 output_price。")
        return float(selected_tier["input_price"]), float(selected_tier["output_price"])

    # 兼容旧配置：直接使用 input_price/output_price
    if "input_price" not in price_config or "output_price" not in price_config:
        raise KeyError(
            f"模型 '{model}' 的价格配置不完整。请确保配置了 input_price 和 output_price。"
        )
    return float(price_config["input_price"]), float(price_config["output_price"])


class LifeTraceConfig:
    """LifeTrace配置管理类"""

    def __init__(self, config_path: str | None = None):
        self.config_path = config_path or self._get_default_config_path()

        # 初始化配置文件（如果不存在则从默认配置复制）
        self._init_config_file()

        self._config = self._load_config()

        # 线程安全锁（用于 set 方法）
        self._config_lock = threading.RLock()

    def _get_application_path(self) -> str:
        """获取应用程序路径，兼容PyInstaller打包"""
        from lifetrace.util.path_utils import get_app_root

        return str(get_app_root())

    def _get_data_directory(self) -> str | None:
        """获取数据目录路径（从环境变量或命令行参数）"""
        # 优先使用环境变量
        data_dir = os.environ.get("LIFETRACE_DATA_DIR")
        if data_dir:
            return os.path.abspath(data_dir)
        return None

    def _get_default_config_path(self) -> str:
        """获取默认配置文件路径"""
        # 如果指定了数据目录，使用数据目录下的config
        data_dir = self._get_data_directory()
        if data_dir:
            config_dir = os.path.join(data_dir, "config")
            os.makedirs(config_dir, exist_ok=True)
            config_path = os.path.join(config_dir, "config.yaml")
            logger.info(f"Using data directory config: {config_path}")
            return config_path

        # 否则使用应用目录下的config
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

    def _get_all_keys(self, config_dict: dict, prefix: str = "") -> set:
        """递归获取配置字典中的所有键（使用点分隔的完整路径）

        Args:
            config_dict: 配置字典
            prefix: 键前缀（用于递归）

        Returns:
            包含所有键路径的集合
        """
        keys = set()
        for key, value in config_dict.items():
            full_key = f"{prefix}.{key}" if prefix else key
            keys.add(full_key)
            if isinstance(value, dict):
                # 递归获取嵌套字典的键
                keys.update(self._get_all_keys(value, full_key))
        return keys

    def _validate_config_completeness(self):
        """验证 config.yaml 是否包含 default_config.yaml 中的所有键

        如果 config.yaml 缺少某些键，则抛出异常并停止程序
        """
        # 获取 default_config.yaml 路径
        config_dir = os.path.dirname(self.config_path)
        default_config_path = os.path.join(config_dir, "default_config.yaml")

        # 检查 default_config.yaml 是否存在
        if not os.path.exists(default_config_path):
            logger.warning(f"默认配置文件不存在: {default_config_path}，跳过完整性检查")
            return

        try:
            # 加载 default_config.yaml
            with open(default_config_path, encoding="utf-8") as f:
                default_config = yaml.safe_load(f)
                if not default_config:
                    logger.warning("默认配置文件为空，跳过完整性检查")
                    return

            # 加载 config.yaml
            with open(self.config_path, encoding="utf-8") as f:
                current_config = yaml.safe_load(f)
                if not current_config:
                    raise ValueError(f"配置文件内容为空: {self.config_path}")

            # 获取所有键
            default_keys = self._get_all_keys(default_config)
            current_keys = self._get_all_keys(current_config)

            # 检查缺失的键
            missing_keys = default_keys - current_keys

            # 对于新增的可选配置（例如分层定价），允许缺失以兼容旧版 config.yaml
            optional_prefixes = [
                "llm.model_prices.qwen3-vl-plus.tiers",
            ]
            missing_keys = {
                key
                for key in missing_keys
                if not any(key.startswith(prefix) for prefix in optional_prefixes)
            }

            if missing_keys:
                # 按字母顺序排序缺失的键，便于阅读
                sorted_missing_keys = sorted(missing_keys)
                error_message = (
                    f"❌ 配置文件不完整！\n\n"
                    f"config.yaml 缺少以下配置项（共 {len(missing_keys)} 个）：\n\n"
                )
                for key in sorted_missing_keys:
                    error_message += f"  - {key}\n"
                error_message += (
                    f"\n请检查并更新 config.yaml（参考 default_config.yaml），"
                    f"或删除 config.yaml 让系统重新生成。\n\n"
                    f">> 默认配置文件路径: {default_config_path}\n"
                    f">> 当前配置文件路径: {self.config_path}\n"
                )

                logger.error(error_message)
                sys.exit(1)

            logger.info(f"✅ 配置文件完整性检查通过，共 {len(default_keys)} 个配置项")

        except yaml.YAMLError as e:
            raise ValueError(f"配置文件格式错误: {e}") from e
        except Exception as e:
            if isinstance(e, ValueError) and "配置文件不完整" in str(e):
                # 重新抛出我们自己的错误
                sys.exit(1)
            raise RuntimeError(f"配置完整性检查失败: {e}") from e

    def _init_config_file(self):
        """初始化配置文件
        检查config.yaml是否存在，如果不存在则从default_config.yaml复制
        在打包环境下，如果数据目录中缺少 default_config.yaml，会尝试从内置配置复制。
        """
        # 获取 default_config.yaml 路径（优先使用数据目录）
        config_dir = os.path.dirname(self.config_path)
        default_config_path = os.path.join(config_dir, "default_config.yaml")

        # 如果数据目录中的 default_config.yaml 不存在，尝试从应用内置配置复制一份
        if not os.path.exists(default_config_path):
            # 在打包环境下，默认配置位于应用目录的 `config` 中（与 _internal 同级别）
            from lifetrace.util.path_utils import get_config_dir

            app_config_dir = get_config_dir()
            candidate_paths = [
                str(app_config_dir / "default_config.yaml"),
            ]

            source_default = None
            for candidate in candidate_paths:
                if os.path.exists(candidate):
                    source_default = candidate
                    logger.info(
                        "Missing data directory default_config.yaml, "
                        f"using bundled default from: {candidate}"
                    )
                    break

            if source_default is not None:
                # 确保配置目录存在，然后复制一份到数据目录
                os.makedirs(config_dir, exist_ok=True)
                shutil.copy2(source_default, default_config_path)
                logger.info(
                    f"Copied bundled default_config.yaml to data directory: {default_config_path}"
                )
            else:
                # 如果连内置默认配置也不存在，再报错
                raise FileNotFoundError(
                    f"默认配置文件不存在: {default_config_path}\n"
                    "请确保 default_config.yaml 文件存在于数据目录的 config 目录中，"
                    "或在应用目录下的 _internal/config 或 config 目录中。"
                )

        # 如果config.yaml已存在，检查完整性
        if os.path.exists(self.config_path):
            logger.debug(f"配置文件已存在: {self.config_path}")
            # 验证配置文件完整性
            self._validate_config_completeness()
            return

        # 如果config.yaml不存在，从default_config.yaml复制
        try:
            shutil.copy2(default_config_path, self.config_path)
            logger.info(f"已从默认配置创建配置文件: {self.config_path}")
        except Exception as e:
            raise RuntimeError(f"初始化配置文件失败: {e}") from e

    def _load_config(self) -> dict:
        """加载配置文件
        只从 config.yaml 加载配置，不存在则报错
        """
        # 检查配置文件是否存在
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(
                f"配置文件不存在: {self.config_path}\n"
                "请确保 config.yaml 文件存在，或运行系统初始化从 default_config.yaml 复制"
            )

        # 加载配置文件
        try:
            with open(self.config_path, encoding="utf-8") as f:
                config = yaml.safe_load(f)
                if not config:
                    raise ValueError(f"配置文件内容为空: {self.config_path}")
                return config
        except yaml.YAMLError as e:
            raise ValueError(f"配置文件格式错误: {e}") from e
        except Exception as e:
            raise RuntimeError(f"读取配置文件失败: {e}") from e

    def save_config(self):
        """保存配置文件
        如果配置文件不存在，则从 default_config.yaml 复制
        配置文件保存在config目录下，而不是~目录
        """
        # 获取默认配置文件路径
        from lifetrace.util.path_utils import get_config_dir

        default_config_path = str(get_config_dir() / "default_config.yaml")

        # 检查默认配置文件是否存在
        if not os.path.exists(default_config_path):
            raise FileNotFoundError(
                f"默认配置文件不存在: {default_config_path}\n"
                "请确保 default_config.yaml 文件存在于 config 目录中"
            )

        # 确保配置目录存在
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)

        try:
            import shutil

            # 从 default_config.yaml 复制到 config.yaml
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
        except Exception as e:
            raise RuntimeError(f"保存配置文件失败: {e}") from e

    def get(self, key: str):
        """获取配置值

        Args:
            key: 配置键（支持点号分隔的嵌套键）

        Returns:
            配置值

        Raises:
            KeyError: 如果配置键不存在
        """
        keys = key.split(".")
        value = self._config
        for i, k in enumerate(keys):
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                # 构建已访问的路径，用于错误提示
                visited_path = ".".join(keys[:i]) if i > 0 else "root"
                raise KeyError(
                    f"配置键 '{key}' 不存在。"
                    f"在路径 '{visited_path}' 中找不到键 '{k}'。"
                    f"请检查配置文件 {self.config_path}"
                )
        return value

    def set(self, key: str, value, persist: bool = True):
        """设置配置值

        Args:
            key: 配置键（支持点号分隔的嵌套键）
            value: 配置值
            persist: 是否持久化到配置文件，默认为True
        """
        with self._config_lock:
            keys = key.split(".")
            config = self._config
            for k in keys[:-1]:
                if k not in config:
                    config[k] = {}
                config = config[k]
            config[keys[-1]] = value

            # 如果需要持久化，保存到配置文件
            if persist:
                try:
                    with open(self.config_path, "w", encoding="utf-8") as f:
                        yaml.dump(self._config, f, allow_unicode=True, sort_keys=False)
                    logger.debug(f"配置已保存到文件: {key} = {value}")
                except Exception as e:
                    logger.error(f"保存配置到文件失败: {e}")
                    raise

    @property
    def base_dir(self) -> str:
        # 如果指定了数据目录，使用数据目录下的data子目录
        data_dir = self._get_data_directory()
        if data_dir:
            base_dir = os.path.join(data_dir, "data")
            os.makedirs(base_dir, exist_ok=True)
            return base_dir.rstrip(os.sep)

        # 否则使用配置中的base_dir
        base_dir = self.get("base_dir")
        # 如果是相对路径，转换为绝对路径
        if not os.path.isabs(base_dir):
            base_dir = os.path.join(self._get_application_path(), base_dir)
        # 确保路径末尾没有多余的斜杠
        return base_dir.rstrip(os.sep)

    @property
    def database_path(self) -> str:
        """数据库路径"""
        db_path = self.get("database_path")
        # 如果是相对路径，基于base_dir拼接
        if not os.path.isabs(db_path):
            db_path = os.path.join(self.base_dir, db_path)
        return db_path

    @property
    def screenshots_dir(self) -> str:
        """截图目录路径"""
        screenshots_dir = self.get("screenshots_dir")
        if not os.path.isabs(screenshots_dir):
            # 如果是相对路径，先转换为相对于项目根目录的路径
            screenshots_dir = os.path.join(self.base_dir, screenshots_dir)
        return screenshots_dir

    @property
    def log_path(self) -> str:
        """日志目录路径"""
        # 如果指定了数据目录，使用数据目录下的logs子目录
        data_dir = self._get_data_directory()
        if data_dir:
            log_path = os.path.join(data_dir, "logs")
            os.makedirs(log_path, exist_ok=True)
            # 确保路径以 / 结尾，以便 logging_config 识别为目录
            return log_path + os.sep if not log_path.endswith(os.sep) else log_path

        # 否则使用配置中的log_path
        log_path = self.get("logging.log_path")
        if not os.path.isabs(log_path):
            # 如果是相对路径，基于base_dir拼接
            log_path = os.path.join(self.base_dir, log_path)
        # 确保路径以 / 结尾，以便 logging_config 识别为目录
        return log_path + os.sep if not log_path.endswith(os.sep) else log_path

    @property
    def vector_db_persist_directory(self) -> str:
        persist_dir = self.get("vector_db.persist_directory")
        if not os.path.isabs(persist_dir):
            return os.path.join(self.base_dir, persist_dir)
        return persist_dir

    # LLM价格相关属性（需要特殊处理逻辑）
    @property
    def llm_input_token_price(self) -> float:
        """LLM输入token价格（元/千token）

        根据当前使用的模型从model_prices中获取价格，
        如果找不到对应模型的价格，则使用default价格
        """
        input_price, _ = self.get_model_price(self.get("llm.model"), input_tokens=0)
        return input_price

    @property
    def llm_output_token_price(self) -> float:
        """LLM输出token价格（元/千token）

        根据当前使用的模型从model_prices中获取价格，
        如果找不到对应模型的价格，则使用default价格
        """
        _, output_price = self.get_model_price(self.get("llm.model"), input_tokens=0)
        return output_price

    def get_model_price(self, model: str, input_tokens: int | None = None) -> tuple[float, float]:
        """获取指定模型的单价（元/千token），支持按输入token区间分层计价"""

        model_prices = self.get("llm.model_prices")

        # 先尝试获取指定模型的价格
        if model in model_prices:
            return _resolve_model_price(
                model, model_prices[model], self.config_path, input_tokens=input_tokens
            )

        # 如果没有找到，使用默认价格
        if "default" not in model_prices:
            raise KeyError(
                f"找不到模型 '{model}' 的价格配置，也没有配置默认价格。"
                f"请在配置文件中添加该模型的价格或配置 default 价格。"
            )

        return _resolve_model_price(
            model, model_prices["default"], self.config_path, input_tokens=input_tokens
        )

    # 调度器配置属性（需要路径拼接）
    @property
    def scheduler_database_path(self) -> str:
        """调度器数据库路径"""
        db_path = self.get("scheduler.database_path")
        # 如果是相对路径，基于base_dir拼接
        if not os.path.isabs(db_path):
            db_path = os.path.join(self.base_dir, db_path)
        return db_path

    def is_configured(self) -> bool:
        """检查LLM配置是否已完成

        Returns:
            bool: 如果llm_key和base_url都已配置（不是占位符或空），返回True
        """
        llm_key = self.get("llm.api_key")
        base_url = self.get("llm.base_url")
        # 检查是否为空或占位符
        invalid_values = [
            "",
            "xxx",
            "YOUR_API_KEY_HERE",
            "YOUR_BASE_URL_HERE",
            "YOUR_LLM_KEY_HERE",
        ]
        return llm_key not in invalid_values and base_url not in invalid_values

    def reload(self) -> bool:
        """重新加载配置文件
        注意：仅用于前端主动刷新配置，不会自动监听文件变化

        Returns:
            bool: 是否成功重载
        """
        try:
            with self._config_lock:
                # 验证配置文件完整性
                self._validate_config_completeness()

                # 重新加载配置
                new_config = self._load_config()

                # 更新配置
                self._config = new_config

                logger.info("配置文件已重新加载")
                return True

        except Exception as e:
            logger.error(f"配置重载失败: {e}")
            return False


# 全局配置实例
config = LifeTraceConfig()
