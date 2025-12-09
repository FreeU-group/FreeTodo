# Journals API 契约（草稿）

基于独立 `journals` 表的最小 CRUD；标签复用 `tags` 表，通过 `journal_tag_relations` 关联。日期字段均为 ISO8601 datetime。

## 数据模型
- `id: int`
- `name: string`（<=200）
- `user_notes: text` 富文本（markdown/html/json）
- `date: datetime`
- `content_format: string`，默认 `markdown`
- `tags: [{ id, tag_name }]`
- `created_at, updated_at, deleted_at`

## 接口
### 创建日记
- `POST /api/journals`
- Body: `{ name, user_notes, date, content_format?, tag_ids?[] }`
- 201 -> `JournalResponse`

### 获取列表
- `GET /api/journals?limit=100&offset=0&start_date&end_date`
- 200 -> `{ total, journals: JournalResponse[] }`

### 获取详情
- `GET /api/journals/{journal_id}`
- 200 -> `JournalResponse`

### 更新日记
- `PUT /api/journals/{journal_id}`
- Body: 同创建，字段可选，`tag_ids` 覆盖替换
- 200 -> `JournalResponse`

### 删除日记
- `DELETE /api/journals/{journal_id}`
- 204 -> 无 body

## 标签说明
- `tag_ids` 需指向已存在的 `tags.id`（未提供创建标签接口）。
- 若需要创建标签，可复用现有 `tags` 表手动插入或后续补充专用接口。
