# OpenClaw Integration Notes (Draft)

## Summary
Goal: integrate FreeTodo with OpenClaw so OpenClaw can act as execution surface and partial frontend,
while FreeTodo provides data and domain actions.

## Repo Context (Current)
- Backend: FastAPI under lifetrace/ with chat + todo + attachments already implemented.
- Frontend: Next.js under free-todo-frontend/.
- Existing chat supports multiple modes, including Agno-based agent.

## Recommended Integration Paths

### Path A: OpenClaw as Primary Brain + Frontend
OpenClaw handles planning/tool routing and user interaction.
FreeTodo becomes a data/action API provider.
- Implement OpenClaw Skills/Plugins that call FreeTodo HTTP APIs
  (todo CRUD, attachments, memory search, summaries, etc.).
- OpenClaw handles file/image intake; FreeTodo stores and indexes.

Pros:
- Single brain, consistent tool routing and UX.
- Leverages OpenClaw ecosystem and UI immediately.

Cons:
- Requires reshaping some existing agent flows to be tool-driven.

### Path B: OpenClaw as Frontend/Execution Surface, Keep Agno as Brain
OpenClaw acts as UI + execution client, FreeTodo keeps LLM/agent logic.
- Create an OpenClaw Skill that forwards user requests to FreeTodo chat endpoints
  (optionally with mode=agno).
- Use OpenClaw file/image upload for inputs; FreeTodo handles processing.

Pros:
- Minimal changes to FreeTodo core logic.

Cons:
- Two brains (OpenClaw + Agno), higher inconsistency risk.
- Harder to converge long-term.

## Communication Choices
- ACP: not suitable (IDE transport, not product integration).
- CLI: not suitable (ops/dev only).
- Skills/Plugins + HTTP: preferred for OpenClaw -> FreeTodo calls.
- Gateway WebSocket or Webhook: use only if FreeTodo needs to push to OpenClaw.

## Key Decisions to Confirm (Ordered)
1) Role decision: Is OpenClaw the primary brain or just a frontend/executor?
2) Data scope: Which FreeTodo data domains should OpenClaw see/control?
3) Security model: auth, tenant isolation, read/write permissions.
4) Interaction entrypoints: WebChat, existing frontend embedding, custom client.
5) Automation triggers: should FreeTodo push events to OpenClaw (webhook/WS)?

## Minimal PoC Options
- Read-only todo list + attachment upload.
- Chat forwarding only (OpenClaw -> FreeTodo /api/chat/stream).
- Hybrid: todo tools + chat forwarding.

## Principles (Confirmed)
- Product-first: decisions prioritize user value over technical elegance.
- MVP-first: ship smallest usable integration, then iterate.

## Decision Log
Date: 2026-03-11
- Primary brain: OpenClaw.
- No Agno fallback for MVP.
- Data scope (MVP): Todo only, read/write.
- Incremental expansion after MVP.

## Conversation Log
2026-03-11
- Confirmed OpenClaw as primary brain and MVP-only scope.
- Requested continuous documentation of decisions and progress.

## Security (MVP Recommendation)
- Auth: single static API key in header (e.g., X-API-Key).
- Tenancy: single-tenant.
- Permissions: system-level access (no user-level isolation).
- Scope: Todo read/write only.
- Follow-up: add user-level tokens + RBAC after MVP if needed.

## Entry Points (Discussion)
2026-03-11
- Desired: WebChat + FreeTodo frontend + OpenClaw chat channels (Discord/Telegram/WhatsApp/Feishu).
- Assessment: feasible but channel setup adds per-channel configuration and ongoing ops.
- MVP suggestion: start with WebChat + FreeTodo frontend, then add channels in phases.

## Automation Triggers (Discussion)
2026-03-11
- Proactive triggers required (FreeTodo -> OpenClaw).
- MVP trigger not selected yet.
