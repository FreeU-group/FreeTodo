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
}
