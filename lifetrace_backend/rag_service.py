import logging
import sys
from typing import Dict, Any, List, Optional, Generator
from datetime import datetime
import asyncio
from pathlib import Path

# 添加项目根目录到Python路径，以便直接运行此文件
if __name__ == '__main__':
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))

from lifetrace_backend.llm_client import LLMClient
from lifetrace_backend.retrieval_service import RetrievalService
from lifetrace_backend.context_builder import ContextBuilder
from lifetrace_backend.query_parser import QueryParser, QueryConditions
from lifetrace_backend.storage import DatabaseManager

logger = logging.getLogger(__name__)

class RAGService:
    """RAG (检索增强生成) 服务，整合查询解析、数据检索、上下文构建和LLM生成"""
    
    def __init__(self, db_manager: DatabaseManager, 
                 api_key: str = None, base_url: str = None, model: str = None):
        """
        初始化RAG服务
        
        Args:
            db_manager: 数据库管理器
            api_key: LLM API密钥
            base_url: LLM API基础URL
            model: LLM模型名称
        """
        self.db_manager = db_manager
        self.llm_client = LLMClient(api_key, base_url, model)
        self.retrieval_service = RetrievalService(db_manager)
        self.context_builder = ContextBuilder()
        self.query_parser = QueryParser(self.llm_client)
        
        logger.info("RAG服务初始化完成")
    
    async def process_query(self, user_query: str, max_results: int = 50) -> Dict[str, Any]:
        """
        处理用户查询的完整RAG流水线
        
        Args:
            user_query: 用户的自然语言查询
            max_results: 最大检索结果数量
            
        Returns:
            包含生成结果和相关信息的字典
        """
        start_time = datetime.now()
        
        try:
            # 1. 意图识别
            logger.info(f"开始处理查询: {user_query}")
            intent_result = self.llm_client.classify_intent(user_query)
            
            # 如果不需要数据库查询，直接使用LLM生成回复
            if not intent_result.get('needs_database', True):
                logger.info(f"用户意图不需要数据库查询: {intent_result['intent_type']}")
                if self.llm_client.is_available():
                    response_text = self._generate_direct_response(user_query, intent_result)
                else:
                    response_text = self._fallback_direct_response(user_query, intent_result)
                
                processing_time = (datetime.now() - start_time).total_seconds()
                return {
                    "success": True,
                    "response": response_text,
                    "query_info": {
                        "original_query": user_query,
                        "intent_classification": intent_result,
                        "requires_database": False
                    },
                    "performance": {
                        "processing_time_seconds": processing_time,
                        "timestamp": start_time.isoformat()
                    }
                }
            
            # 2. 查询解析（仅当需要数据库查询时）
            logger.info("需要数据库查询，开始查询解析")
            parsed_query = self.query_parser.parse_query(user_query)
            # 确定查询类型
            query_type = 'statistics' if '统计' in user_query else 'search'
            
            # 3. 数据检索 - 使用已解析的查询条件，避免重复解析
            logger.info("开始数据检索")
            print(parsed_query)
            
            retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, max_results)
            
            # 4. 获取统计信息（如果需要）
            stats = None
            if query_type == 'statistics' or '统计' in user_query:
                # 安全地访问parsed_query的属性
                if isinstance(parsed_query, QueryConditions):
                    start_date = parsed_query.start_date
                    end_date = parsed_query.end_date
                    app_names = parsed_query.app_names
                    keywords = parsed_query.keywords or []
                else:
                    # 如果parsed_query是字典，从字典中获取值
                    start_date = parsed_query.get('start_date')
                    end_date = parsed_query.get('end_date')
                    app_names = parsed_query.get('app_names', [])
                    keywords = parsed_query.get('keywords', [])
                
                conditions = QueryConditions(
                    start_date=start_date,
                    end_date=end_date,
                    app_names=app_names,
                    keywords=keywords
                )
                stats = self.retrieval_service.get_statistics(conditions)
            
            # 5. 上下文构建
            logger.info("开始构建上下文")
            if query_type == 'statistics':
                context_text = self.context_builder.build_statistics_context(
                    user_query, retrieved_data, stats
                )
            elif query_type == 'search':
                context_text = self.context_builder.build_search_context(
                    user_query, retrieved_data
                )
            else:
                context_text = self.context_builder.build_summary_context(
                    user_query, retrieved_data
                )
            
            # 6. LLM生成
            logger.info("开始LLM生成")
            if self.llm_client.is_available():
                response_text = self.llm_client.generate_summary(user_query, retrieved_data)
            else:
                response_text = self._fallback_response(user_query, retrieved_data, stats)
            
            # 7. 构建响应
            processing_time = (datetime.now() - start_time).total_seconds()
            
            result = {
                "success": True,
                "response": response_text,
                "query_info": {
                    "original_query": user_query,
                    "intent_classification": intent_result,
                    "parsed_query": parsed_query,
                    "query_type": query_type,
                    "requires_database": True
                },
                "retrieval_info": {
                    "total_found": len(retrieved_data),
                    "data_summary": self._summarize_retrieved_data(retrieved_data)
                },
                "context_info": {
                    "context_length": len(context_text),
                    "llm_available": self.llm_client.is_available()
                },
                "performance": {
                    "processing_time_seconds": processing_time,
                    "timestamp": start_time.isoformat()
                },
                "statistics": stats
            }
            
            logger.info(f"查询处理完成，耗时 {processing_time:.2f} 秒")
            return result
            
        except Exception as e:
            logger.error(f"RAG查询处理失败: {e}")
            # 安全地构建错误信息
            error_query_info = {"original_query": user_query}
            try:
                if 'parsed_query' in locals():
                    error_query_info["error"] = str(e)
            except:
                pass
            
            return {
                "success": False,
                "error": str(e),
                "response": "抱歉，处理您的查询时出现了错误。请稍后重试。",
                "query_info": error_query_info,
                "performance": {
                    "processing_time_seconds": (datetime.now() - start_time).total_seconds(),
                    "timestamp": start_time.isoformat()
                }
            }
    
    def process_query_sync(self, user_query: str, max_results: int = 50) -> Dict[str, Any]:
        """
        同步版本的查询处理
        
        Args:
            user_query: 用户的自然语言查询
            max_results: 最大检索结果数量
            
        Returns:
            包含生成结果和相关信息的字典
        """
        return asyncio.run(self.process_query(user_query, max_results))

    def post_stream_decision(self, user_query: str, output_text: str) -> None:
        """
        流式输出完成后的判定/记录钩子：
        - 用于执行那些“必须拿到完整输出才能判断”的逻辑（例如：是否需要追加免责声明、是否触发某些后续动作等）
        - 默认实现仅做日志记录，后续可按需扩展
        """
        try:
            if not output_text:
                return
            # 示例：如果输出包含特定提示词，则记录到日志或触发后续处理
            keywords = ["免责声明", "敏感内容", "注意", "总结"]
            if any(kw in output_text for kw in keywords):
                logger.info(f"[post_stream] 输出包含关键提示，query='{user_query[:50]}...' 触发标记")
            else:
                logger.debug("[post_stream] 无特殊标记")
        except Exception as e:
            logger.debug(f"[post_stream] 处理异常已忽略: {e}")

    def stream_query(self, user_query: str, max_results: int = 50, temperature_direct: float = 0.7, temperature_rag: float = 0.3) -> Generator[str, None, None]:
        """
        流式处理用户查询：执行完整的RAG流程，并在生成阶段逐token（或逐chunk）yield 文本。
        当底层LLM不支持真流式时，将按段返回；当不可用时，返回备用文本。
        在流式输出完成后，调用 post_stream_decision 进行后续判定/记录。
        """
        try:
            # 1) 意图识别
            intent_result = self.llm_client.classify_intent(user_query)
            needs_db = intent_result.get('needs_database', True)

            # 2) 不需要数据库：直接对话
            if not needs_db:
                if not self.llm_client.is_available():
                    # LLM不可用，直接返回备用文本
                    fallback_text = self._fallback_direct_response(user_query, intent_result)
                    yield fallback_text
                    # 完整输出后处理
                    self.post_stream_decision(user_query, fallback_text)
                    return
                # 系统提示与 _generate_direct_response 保持一致
                intent_type = intent_result.get('intent_type', 'general_chat')
                if intent_type == 'system_help':
                    system_prompt = """
你是LifeTrace的智能助手。LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：
1. 自动截图记录用户的屏幕活动
2. OCR文字识别和内容分析
3. 应用使用情况统计
4. 智能搜索和查询功能

请根据用户的问题提供有用的帮助信息。
"""
                else:
                    system_prompt = """
你是LifeTrace的智能助手，请以友好、自然的方式与用户对话。
如果用户需要查询数据或统计信息，请引导他们使用具体的查询语句。
"""
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_query}
                ]
                output_chunks: List[str] = []
                for text in self.llm_client.stream_chat(messages=messages, temperature=temperature_direct):
                    if text:
                        output_chunks.append(text)
                        yield text
                # 完整输出后处理
                self.post_stream_decision(user_query, "".join(output_chunks))
                return

            # 3) 需要数据库：解析 + 检索 + 构建上下文
            parsed_query = self.query_parser.parse_query(user_query)
            query_type = 'statistics' if '统计' in user_query else 'search'
            retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, max_results)

            stats = None
            if query_type == 'statistics' or '统计' in user_query:
                # 兼容 QueryConditions 或 dict
                if isinstance(parsed_query, QueryConditions):
                    conditions = parsed_query
                else:
                    conditions = QueryConditions(
                        start_date=parsed_query.get('start_date'),
                        end_date=parsed_query.get('end_date'),
                        app_names=parsed_query.get('app_names'),
                        keywords=parsed_query.get('keywords', [])
                    )
                try:
                    stats = self.retrieval_service.get_statistics(conditions)
                except Exception:
                    stats = None

            # 上下文构建
            if query_type == 'statistics':
                context_text = self.context_builder.build_statistics_context(
                    user_query, retrieved_data, stats
                )
            elif query_type == 'search':
                context_text = self.context_builder.build_search_context(
                    user_query, retrieved_data
                )
            else:
                context_text = self.context_builder.build_summary_context(
                    user_query, retrieved_data
                )

            # LLM 不可用时，返回规则备选
            if not self.llm_client.is_available():
                fallback_text = self._fallback_response(user_query, retrieved_data, stats)
                yield fallback_text
                # 完整输出后处理
                self.post_stream_decision(user_query, fallback_text)
                return

            # 4) 生成阶段：流式输出
            system_prompt = """
你是一个智能助手，专门帮助用户分析和总结历史记录数据。

用户会提供一个查询和相关的历史数据，你需要：
1. 理解用户的查询意图
2. 分析提供的历史数据
3. 生成准确、有用的总结

**强制性要求 - 必须严格遵守：**
- 每当引用或提到任何具体信息时，必须标注截图ID来源，格式为：[截图ID: xxx]
- 不允许提及任何信息而不标注其来源截图ID
- 如果历史数据中包含截图ID信息，必须在相关内容后立即添加引用
- 这是为了确保信息的可追溯性和准确性
- 示例："用户在微信中发送了消息 [截图ID: 12345]"

请用中文回答，保持简洁明了，重点突出关键信息。
"""
            user_prompt = f"""
用户查询：{user_query}

相关历史数据：
{context_text}

请基于以上数据回答用户的查询。
"""
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            output_chunks: List[str] = []
            for text in self.llm_client.stream_chat(messages=messages, temperature=temperature_rag):
                if text:
                    output_chunks.append(text)
                    yield text
            # 完整输出后处理
            self.post_stream_decision(user_query, "".join(output_chunks))
        except Exception as e:
            logger.error(f"RAG 流式处理失败: {e}")
            error_text = "\n[提示] 流式处理出现异常，已结束。"
            yield error_text
            # 异常情况下也做一次后处理
            try:
                self.post_stream_decision(user_query, error_text)
            except Exception:
                pass

    def get_query_suggestions(self, partial_query: str = "") -> List[str]:
        """
        获取查询建议
        
        Args:
            partial_query: 部分查询文本
            
        Returns:
            查询建议列表
        """
        suggestions = [
            "总结今天的微信聊天记录",
            "查找包含'会议'的所有记录",
            "统计最近一周各应用的使用情况",
            "搜索昨天浏览器中的内容",
            "总结最近的工作相关截图",
            "查找包含'项目'关键词的记录",
            "统计本月QQ聊天记录数量",
            "搜索最近3天的学习资料",
            "总结上周的网页浏览记录",
            "查找包含'文档'的所有应用记录"
        ]
        
        if partial_query:
            # 简单的模糊匹配
            filtered_suggestions = [
                s for s in suggestions 
                if any(word in s for word in partial_query.split())
            ]
            return filtered_suggestions[:5]
        
        return suggestions[:5]
    
    def get_supported_query_types(self) -> Dict[str, Any]:
        """
        获取支持的查询类型信息
        
        Returns:
            查询类型信息字典
        """
        return {
            "query_types": {
                "summary": {
                    "name": "总结",
                    "description": "对历史记录进行总结和概括",
                    "examples": ["总结今天的微信聊天", "概括最近的工作记录"]
                },
                "search": {
                    "name": "搜索",
                    "description": "搜索包含特定关键词的记录",
                    "examples": ["查找包含'会议'的记录", "搜索项目相关内容"]
                },
                "statistics": {
                    "name": "统计",
                    "description": "统计和分析历史记录数据",
                    "examples": ["统计各应用使用情况", "分析最近一周的活动"]
                }
            },
            "supported_apps": [
                "WeChat", "QQ", "Browser", "Chrome", "Firefox", "Edge",
                "Word", "Excel", "PowerPoint", "Notepad", "VSCode"
            ],
            "time_expressions": [
                "今天", "昨天", "最近3天", "本周", "上周", "本月", "上月"
            ]
        }
    
    def _summarize_retrieved_data(self, retrieved_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """总结检索到的数据"""
        if not retrieved_data:
            return {"apps": {}, "time_range": None, "total": 0}
        
        app_counts = {}
        timestamps = []
        
        for record in retrieved_data:
            app_name = record.get('app_name', '未知应用')
            app_counts[app_name] = app_counts.get(app_name, 0) + 1
            
            timestamp = record.get('timestamp')
            if timestamp:
                timestamps.append(timestamp)
        
        time_range = None
        if timestamps:
            timestamps.sort()
            time_range = {
                "earliest": timestamps[0],
                "latest": timestamps[-1]
            }
        
        return {
            "apps": app_counts,
            "time_range": time_range,
            "total": len(retrieved_data)
        }
    
    def _fallback_response(self, user_query: str, retrieved_data: List[Dict[str, Any]], 
                          stats: Dict[str, Any] = None) -> str:
        """
        备用响应生成（当LLM不可用时）
        
        Args:
            user_query: 用户查询
            retrieved_data: 检索到的数据
            stats: 统计信息
            
        Returns:
            备用响应文本
        """
        if not retrieved_data:
            return f"抱歉，没有找到与查询 '{user_query}' 相关的历史记录。"
        
        response_parts = [
            f"根据您的查询 '{user_query}'，我找到了以下信息：",
            ""
        ]
        
        # 基础统计
        response_parts.append(f"📊 总共找到 {len(retrieved_data)} 条相关记录")
        
        # 应用分布
        app_summary = self._summarize_retrieved_data(retrieved_data)
        if app_summary['apps']:
            response_parts.append("\n📱 应用分布：")
            for app, count in sorted(app_summary['apps'].items(), key=lambda x: x[1], reverse=True):
                response_parts.append(f"  • {app}: {count} 条记录")
        
        # 时间范围
        if app_summary['time_range']:
            try:
                earliest = datetime.fromisoformat(app_summary['time_range']['earliest'].replace('Z', '+00:00'))
                latest = datetime.fromisoformat(app_summary['time_range']['latest'].replace('Z', '+00:00'))
                response_parts.append(f"\n⏰ 时间范围: {earliest.strftime('%Y-%m-%d %H:%M')} 至 {latest.strftime('%Y-%m-%d %H:%M')}")
            except:
                pass
        
        # 最新记录示例
        if retrieved_data:
            response_parts.append("\n📝 最新记录示例：")
            latest_record = retrieved_data[0]
            timestamp = latest_record.get('timestamp', '未知时间')
            app_name = latest_record.get('app_name', '未知应用')
            ocr_text = latest_record.get('ocr_text', '无内容')[:100]
            
            response_parts.append(f"  时间: {timestamp}")
            response_parts.append(f"  应用: {app_name}")
            response_parts.append(f"  内容: {ocr_text}...")
        
        response_parts.append("\n💡 提示：您可以使用更具体的关键词来获得更精确的结果。")
        
        return "\n".join(response_parts)
    
    def health_check(self) -> Dict[str, Any]:
        """
        健康检查
        
        Returns:
            服务状态信息
        """
        return {
            "rag_service": "healthy",
            "llm_client": "available" if self.llm_client.is_available() else "unavailable",
            "database": "connected" if self.db_manager else "disconnected",
            "components": {
                "retrieval_service": "ready",
                "context_builder": "ready",
                "query_parser": "ready"
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def _generate_direct_response(self, user_query: str, intent_result: Dict[str, Any]) -> str:
        """
        为不需要数据库查询的用户输入生成直接回复
        
        Args:
            user_query: 用户查询
            intent_result: 意图识别结果
            
        Returns:
            生成的回复文本
        """
        try:
            intent_type = intent_result.get('intent_type', 'general_chat')
            
            if intent_type == 'system_help':
                system_prompt = """
你是LifeTrace的智能助手。LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：
1. 自动截图记录用户的屏幕活动
2. OCR文字识别和内容分析
3. 应用使用情况统计
4. 智能搜索和查询功能

请根据用户的问题提供有用的帮助信息。
"""
            else:
                system_prompt = """
你是LifeTrace的智能助手，请以友好、自然的方式与用户对话。
如果用户需要查询数据或统计信息，请引导他们使用具体的查询语句。
"""
            
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_query}
                ],
                temperature=0.7,
                max_tokens=500
            )
            
            # 记录LLM响应到控制台和日志
            llm_response = response.choices[0].message.content.strip()
            print(f"[LLM Direct Response] {llm_response}")
            logger.info(f"LLM直接响应: {llm_response}")
            
            return llm_response
            
        except Exception as e:
            logger.error(f"直接响应生成失败: {e}")
            return self._fallback_direct_response(user_query, intent_result)
    
    def _fallback_direct_response(self, user_query: str, intent_result: Dict[str, Any]) -> str:
        """
        当LLM不可用时的直接回复备用方案
        
        Args:
            user_query: 用户查询
            intent_result: 意图识别结果
            
        Returns:
            备用回复文本
        """
        intent_type = intent_result.get('intent_type', 'general_chat')
        
        if intent_type == 'system_help':
            return """
LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：

📸 **自动截图记录**
- 定期捕获屏幕内容
- 记录应用使用情况

🔍 **智能搜索**
- 搜索历史截图
- 基于OCR文字内容查找

📊 **使用统计**
- 应用使用时长统计
- 活动模式分析

💬 **智能问答**
- 自然语言查询
- 个性化数据分析

如需查询具体数据，请使用如"搜索包含编程的截图"或"统计最近一周的应用使用情况"等语句。
"""
        elif intent_type == 'general_chat':
            greetings = [
                "你好！我是LifeTrace的智能助手，很高兴为您服务！",
                "您好！有什么可以帮助您的吗？",
                "欢迎使用LifeTrace！我可以帮您查询和分析您的生活轨迹数据。"
            ]
            
            if any(word in user_query.lower() for word in ['你好', 'hello', 'hi']):
                return greetings[0] + "\n\n您可以询问我关于LifeTrace的功能，或者直接查询您的数据。"
            elif any(word in user_query.lower() for word in ['谢谢', 'thanks']):
                return "不客气！如果还有其他问题，随时可以问我。"
            else:
                return greetings[1] + "\n\n您可以尝试搜索截图、查询应用使用情况，或者询问系统功能。"
        else:
            return "我理解您的问题，但可能需要更多信息才能提供准确的回答。您可以尝试更具体的查询，比如搜索特定内容或统计使用情况。"
    
    async def process_query_stream(self, user_query: str) -> Dict[str, Any]:
        """
        为流式接口处理查询，返回构建好的messages和temperature
        避免重复的意图识别调用
        """
        try:
            # 1. 意图识别
            logger.info(f"[stream] 开始处理查询: {user_query}")
            intent_result = self.llm_client.classify_intent(user_query)
            needs_db = intent_result.get('needs_database', True)
            intent_type = intent_result.get('intent_type', 'general_chat')
            
            messages = []
            temperature = 0.7
            
            if not needs_db:
                # 不需要数据库查询的情况
                if intent_type == 'system_help':
                    system_prompt = """
你是LifeTrace的智能助手。LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：
1. 自动截图记录用户的屏幕活动
2. OCR文字识别和内容分析
3. 应用使用情况统计
4. 智能搜索和查询功能

请根据用户的问题提供有用的帮助信息。
"""
                elif intent_type == 'todo_creation':
                    messages = [
                        {"role": "user", "content": user_query}
                    ] # system prompt will be added in the server
                else:
                    system_prompt = """
你是LifeTrace的智能助手，请以友好、自然的方式与用户对话。
如果用户需要查询数据或统计信息，请引导他们使用具体的查询语句。
"""
                    messages = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_query}
                    ]
            else:
                # 需要数据库查询的情况
                parsed_query = self.query_parser.parse_query(user_query)
                query_type = 'statistics' if '统计' in user_query else 'search'
                retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, 500)

                if intent_type == 'todo_creation':
                    context_text = self.context_builder.build_search_context(
                        user_query, retrieved_data, add_system_prompt=False
                    )
                    messages = [
                        {"role": "system", "content": context_text},
                        {"role": "user", "content": user_query}
                    ]
                    temperature = 0.3

                    return {
                        "success": True,
                        "messages": messages,
                        "temperature": temperature,
                        "intent_result": intent_result
                    }
                
                # 构建上下文
                if query_type == 'statistics':
                    stats = None
                    if isinstance(parsed_query, QueryConditions):
                        stats = self.retrieval_service.get_statistics(parsed_query)
                    context_text = self.context_builder.build_statistics_context(
                        user_query, retrieved_data, stats
                    )
                else:
                    context_text = self.context_builder.build_search_context(
                        user_query, retrieved_data
                    )
                print("[stream] 上下文文本: ", context_text)
                print("[stream] 检索信息: ", retrieved_data)
                messages = [
                    {"role": "system", "content": context_text},
                    {"role": "user", "content": user_query}
                ]
                temperature = 0.3
            
            return {
                "success": True,
                "messages": messages,
                "temperature": temperature,
                "intent_result": intent_result
            }
            
        except Exception as e:
            logger.error(f"[stream] 处理查询失败: {e}")
            return {
                "success": False,
                "response": f"处理查询时出现错误: {str(e)}",
                "messages": [],
                "temperature": 0.7
            }