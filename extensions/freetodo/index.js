import { Type } from "@sinclair/typebox";

export default function registerFreeTodoTools(api) {
  const cfg = api.config?.plugins?.entries?.freetodo?.config ?? {};
  const baseUrl =
    typeof cfg.baseUrl === "string" && cfg.baseUrl ? cfg.baseUrl : "http://127.0.0.1:8001";
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "";
  const apiKeyHeader =
    typeof cfg.apiKeyHeader === "string" && cfg.apiKeyHeader ? cfg.apiKeyHeader : "X-API-Key";

  const buildHeaders = () => (apiKey ? { [apiKeyHeader]: apiKey } : {});

  api.registerTool({
    name: "todo_list",
    description: "List todos",
    parameters: Type.Object({
      status: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 2000 })),
      offset: Type.Optional(Type.Number({ minimum: 0 })),
    }),
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
    parameters: Type.Object({
      id: Type.Number(),
    }),
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
    parameters: Type.Object({
      name: Type.String({ minLength: 1 }),
      summary: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      due: Type.Optional(Type.String()),
      priority: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
    }),
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
    parameters: Type.Object({
      id: Type.Number(),
      name: Type.Optional(Type.String({ minLength: 1 })),
      summary: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      due: Type.Optional(Type.String()),
      priority: Type.Optional(Type.String()),
      status: Type.Optional(Type.String()),
    }),
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
}
