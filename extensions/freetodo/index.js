import fs from "node:fs/promises";
import path from "node:path";

export default function registerFreeTodoTools(api) {
  const cfg = api.config?.plugins?.entries?.freetodo?.config ?? {};
  const baseUrl =
    typeof cfg.baseUrl === "string" && cfg.baseUrl ? cfg.baseUrl : "http://127.0.0.1:8001";
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
  const apiKeyHeader =
    typeof cfg.apiKeyHeader === "string" && cfg.apiKeyHeader ? cfg.apiKeyHeader : "X-API-Key";

  const buildHeaders = () => (apiKey ? { [apiKeyHeader]: apiKey } : {});

  const todoListSchema = {
    type: "object",
    additionalProperties: true,
    properties: {
      status: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 2000 },
      offset: { type: "number", minimum: 0 },
    },
  };

  const todoGetSchema = {
    type: "object",
    required: ["id"],
    additionalProperties: true,
    properties: {
      id: { type: "number" },
    },
  };

  const todoCreateSchema = {
    type: "object",
    required: ["name"],
    additionalProperties: true,
    properties: {
      name: { type: "string", minLength: 1 },
      summary: { type: "string" },
      description: { type: "string" },
      due: { type: "string" },
      priority: { type: "string" },
      status: { type: "string" },
    },
  };

  const todoUpdateSchema = {
    type: "object",
    required: ["id"],
    additionalProperties: true,
    properties: {
      id: { type: "number" },
      name: { type: "string", minLength: 1 },
      summary: { type: "string" },
      description: { type: "string" },
      due: { type: "string" },
      priority: { type: "string" },
      status: { type: "string" },
    },
  };

  const todoDeleteSchema = {
    type: "object",
    required: ["id"],
    additionalProperties: true,
    properties: {
      id: { type: "number" },
    },
  };

  const todoReorderSchema = {
    type: "object",
    required: ["items"],
    additionalProperties: true,
    properties: {
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "order"],
          additionalProperties: true,
          properties: {
            id: { type: "number" },
            order: { type: "number" },
            parent_todo_id: { type: ["number", "null"] },
          },
        },
      },
    },
  };

  const todoAttachmentUploadSchema = {
    type: "object",
    required: ["todo_id", "files"],
    additionalProperties: true,
    properties: {
      todo_id: { type: "number" },
      files: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            name: { type: "string" },
            contentBase64: { type: "string" },
            filePath: { type: "string" },
            mimeType: { type: "string" },
          },
        },
      },
    },
  };

  const todoAttachmentDeleteSchema = {
    type: "object",
    required: ["todo_id", "attachment_id"],
    additionalProperties: true,
    properties: {
      todo_id: { type: "number" },
      attachment_id: { type: "number" },
    },
  };

  const todoAttachmentDownloadSchema = {
    type: "object",
    required: ["attachment_id"],
    additionalProperties: true,
    properties: {
      attachment_id: { type: "number" },
    },
  };

  const todoExportIcsSchema = {
    type: "object",
    additionalProperties: true,
    properties: {
      status: { type: "string" },
      limit: { type: "number", minimum: 1, maximum: 2000 },
      offset: { type: "number", minimum: 0 },
    },
  };

  const todoImportIcsSchema = {
    type: "object",
    additionalProperties: true,
    properties: {
      icsText: { type: "string" },
      icsBase64: { type: "string" },
      filePath: { type: "string" },
      fileName: { type: "string" },
    },
  };

  const memoryDateSchema = {
    type: "object",
    required: ["date"],
    additionalProperties: true,
    properties: {
      date: { type: "string", minLength: 8 },
    },
  };

  const memorySearchSchema = {
    type: "object",
    required: ["keyword"],
    additionalProperties: true,
    properties: {
      keyword: { type: "string", minLength: 1 },
      days: { type: "number", minimum: 1, maximum: 365 },
      max_results: { type: "number", minimum: 1, maximum: 50 },
    },
  };

  const parseFileName = (contentDisposition) => {
    if (!contentDisposition) return undefined;
    const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(
      contentDisposition
    );
    return decodeURIComponent(match?.[1] || match?.[2] || "").trim() || undefined;
  };

  const buildJsonResponse = async (res) => {
    const text = res.status === 204 ? "" : await res.text();
    return text || JSON.stringify({ status: res.status });
  };

  const resolveFilePayload = async (file) => {
    if (file?.contentBase64) {
      return {
        name: file.name || "attachment",
        mimeType: file.mimeType || "application/octet-stream",
        buffer: Buffer.from(file.contentBase64, "base64"),
      };
    }
    if (file?.filePath) {
      const buffer = await fs.readFile(file.filePath);
      return {
        name: file.name || path.basename(file.filePath),
        mimeType: file.mimeType || "application/octet-stream",
        buffer,
      };
    }
    throw new Error("file item requires contentBase64 or filePath");
  };

  api.registerTool({
    name: "todo_list",
    description: "List todos",
    parameters: todoListSchema,
    async execute(_id, params) {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      if (params.offset !== undefined) query.set("offset", String(params.offset));
      const qs = query.toString();
      const res = await fetch(`${baseUrl}/api/todos${qs ? `?${qs}` : ""}`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_get",
    description: "Get a single todo by id",
    parameters: todoGetSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/todos/${params.id}`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_create",
    description: "Create a todo",
    parameters: todoCreateSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/todos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(),
        },
        body: JSON.stringify(params),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_update",
    description: "Update a todo (partial fields)",
    parameters: todoUpdateSchema,
    async execute(_id, params) {
      const { id, ...payload } = params;
      const res = await fetch(`${baseUrl}/api/todos/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(),
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_delete",
    description: "Delete a todo",
    parameters: todoDeleteSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/todos/${params.id}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      const text = await buildJsonResponse(res);
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_reorder",
    description: "Reorder todos and update parent relationships",
    parameters: todoReorderSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/todos/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildHeaders(),
        },
        body: JSON.stringify({ items: params.items }),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_attachments_upload",
    description: "Upload attachments to a todo (base64 or local file path)",
    parameters: todoAttachmentUploadSchema,
    async execute(_id, params) {
      const form = new FormData();
      for (const file of params.files || []) {
        const payload = await resolveFilePayload(file);
        const blob = new Blob([payload.buffer], { type: payload.mimeType });
        form.append("files", blob, payload.name);
      }
      const res = await fetch(`${baseUrl}/api/todos/${params.todo_id}/attachments`, {
        method: "POST",
        headers: buildHeaders(),
        body: form,
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_attachments_delete",
    description: "Remove an attachment from a todo",
    parameters: todoAttachmentDeleteSchema,
    async execute(_id, params) {
      const res = await fetch(
        `${baseUrl}/api/todos/${params.todo_id}/attachments/${params.attachment_id}`,
        {
          method: "DELETE",
          headers: buildHeaders(),
        }
      );
      const text = await buildJsonResponse(res);
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_attachments_get_file",
    description: "Download attachment file (returns base64 payload)",
    parameters: todoAttachmentDownloadSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/todos/attachments/${params.attachment_id}/file`, {
        headers: buildHeaders(),
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      const payload = {
        contentBase64: buffer.toString("base64"),
        contentType: res.headers.get("content-type") || "application/octet-stream",
        fileName: parseFileName(res.headers.get("content-disposition")),
        status: res.status,
      };
      return { content: [{ type: "text", text: JSON.stringify(payload) }] };
    },
  });

  api.registerTool({
    name: "todo_export_ics",
    description: "Export todos as an ICS file (text payload)",
    parameters: todoExportIcsSchema,
    async execute(_id, params) {
      const query = new URLSearchParams();
      if (params.status) query.set("status", params.status);
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      if (params.offset !== undefined) query.set("offset", String(params.offset));
      const qs = query.toString();
      const res = await fetch(`${baseUrl}/api/todos/export/ics${qs ? `?${qs}` : ""}`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "todo_import_ics",
    description: "Import todos from an ICS text/base64 file",
    parameters: todoImportIcsSchema,
    async execute(_id, params) {
      let buffer;
      let fileName = params.fileName || "todos.ics";
      if (params.icsText) {
        buffer = Buffer.from(params.icsText, "utf-8");
      } else if (params.icsBase64) {
        buffer = Buffer.from(params.icsBase64, "base64");
      } else if (params.filePath) {
        buffer = await fs.readFile(params.filePath);
        fileName = params.fileName || path.basename(params.filePath);
      } else {
        throw new Error("icsText, icsBase64, or filePath is required");
      }

      const form = new FormData();
      const blob = new Blob([buffer], { type: "text/calendar" });
      form.append("file", blob, fileName);

      const res = await fetch(`${baseUrl}/api/todos/import/ics`, {
        method: "POST",
        headers: buildHeaders(),
        body: form,
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_today",
    description: "Get today's memory content",
    parameters: { type: "object", additionalProperties: true, properties: {} },
    async execute() {
      const res = await fetch(`${baseUrl}/api/memory/today`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_get_date",
    description: "Get memory content for a specific date",
    parameters: memoryDateSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/memory/date/${params.date}`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_search",
    description: "Search memories by keyword",
    parameters: memorySearchSchema,
    async execute(_id, params) {
      const query = new URLSearchParams();
      query.set("keyword", params.keyword);
      if (params.days !== undefined) query.set("days", String(params.days));
      if (params.max_results !== undefined) {
        query.set("max_results", String(params.max_results));
      }
      const res = await fetch(`${baseUrl}/api/memory/search?${query.toString()}`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_profile_get",
    description: "Get the current user profile",
    parameters: { type: "object", additionalProperties: true, properties: {} },
    async execute() {
      const res = await fetch(`${baseUrl}/api/memory/profile`, {
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_profile_update",
    description: "Trigger a user profile update cycle",
    parameters: { type: "object", additionalProperties: true, properties: {} },
    async execute() {
      const res = await fetch(`${baseUrl}/api/memory/profile/update`, {
        method: "POST",
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_profile_consolidate",
    description: "Consolidate the user profile to reduce bloat",
    parameters: { type: "object", additionalProperties: true, properties: {} },
    async execute() {
      const res = await fetch(`${baseUrl}/api/memory/profile/consolidate`, {
        method: "POST",
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_compress_day",
    description: "Compress memory for a specific date",
    parameters: memoryDateSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/memory/compress/${params.date}`, {
        method: "POST",
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_link_day",
    description: "Run task linking for a specific date",
    parameters: memoryDateSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/memory/link/${params.date}`, {
        method: "POST",
        headers: buildHeaders(),
      });
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });

  api.registerTool({
    name: "memory_compress_and_link",
    description: "Compress then link memories for a specific date",
    parameters: memoryDateSchema,
    async execute(_id, params) {
      const res = await fetch(`${baseUrl}/api/memory/compress-and-link/${params.date}`,
        {
          method: "POST",
          headers: buildHeaders(),
        }
      );
      const text = await res.text();
      return { content: [{ type: "text", text }] };
    },
  });
}
