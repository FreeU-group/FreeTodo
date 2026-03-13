# Agno 多模态附件上传方案（仅 Agno 模式）
方案摘要：聊天支持图片与文件上传，仅 Agno 模式；不走 AgentOS HTTP Client，改为本地 AgnoAgentService 传 images/files；不做数据库迁移，附件元数据写入 message extra_data，文件落盘到会话目录；/api/chat/stream 支持 multipart，建议新增下载接口；前端提供上传按钮、拖拽与粘贴、发送前预览与移除、消息展示缩略图/文件卡片；限制为单文件 20MB、单次 8 个，支持 png/jpg/jpeg/webp 与常见文本/代码/pdf。
