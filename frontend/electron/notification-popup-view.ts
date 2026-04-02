export function escapePopupText(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r");
}

function stepClass(status: string): string {
	if (status === "running") return "step-running";
	if (status === "done" || status === "completed" || status === "success") {
		return "step-done";
	}
	if (status === "failed" || status === "error") return "step-failed";
	return "step-pending";
}

function stepIcon(status: string): string {
	if (status === "running") return "…";
	if (status === "done" || status === "completed" || status === "success") return "✓";
	if (status === "failed" || status === "error") return "!";
	return "·";
}

export function renderPopupStep(
	label: string,
	status: string,
	detail?: string,
): string {
	const safeLabel = escapePopupText(label);
	const safeDetail = detail ? escapePopupText(detail) : "";
	return `
		<div class="step ${stepClass(status)}">
			<div class="step-icon">${stepIcon(status)}</div>
			<div class="step-body">
				<span class="step-label">${safeLabel}</span>
				${safeDetail ? `<span class="step-detail">${safeDetail}</span>` : ""}
			</div>
		</div>`;
}

export function renderPopupSection(
	title: string,
	items: string[],
	emptyText: string,
): string {
	const body = items.length > 0 ? items.join("") : renderPopupStep(emptyText, "pending");
	return `
		<div class="section">
			<div class="section-title">${escapePopupText(title)}</div>
			<div class="steps">${body}</div>
		</div>`;
}

export function getNotificationPopupHtml(
	avatarBase64: string,
	toastDurationMs: number,
	backendUrl: string,
): string {
	return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent!important;overflow:hidden;
  font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  -webkit-font-smoothing:antialiased;}
.popup-wrapper{position:fixed;bottom:8px;left:8px;right:8px;opacity:0;transform:translateY(30px) scale(.9)}
.popup-wrapper.show{animation:slideIn .45s cubic-bezier(.16,1,.3,1) forwards}
.popup-wrapper.hide{animation:slideOut .3s cubic-bezier(.4,0,1,1) forwards}
@keyframes slideIn{to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes slideOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(10px) scale(.95)}}
.card{position:relative;overflow:hidden;border-radius:18px;
  background:rgba(255,255,255,.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  box-shadow:0 20px 44px -8px rgba(0,0,0,.14),0 8px 18px -4px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04);
  padding:16px 18px;display:flex;flex-direction:column;gap:12px;max-height:calc(100vh - 32px)}
@media(prefers-color-scheme:dark){
  .card{background:rgba(30,30,30,.95)}
  .title{color:#f1f5f9!important}
  .desc{color:#94a3b8!important}
  .btn-secondary{background:#334155!important;color:#cbd5e1!important}
  .btn-secondary:hover{background:#475569!important}
  .btn-ghost{color:#64748b!important}
  .section{background:rgba(15,23,42,.58)!important;border-color:rgba(148,163,184,.18)!important}
  .section-title,.meta-row,.step-detail{color:#94a3b8!important}
  .status-badge.pending{background:#334155!important;color:#cbd5e1!important}
  .result-area{background:#0f172a!important;color:#cbd5e1!important}
  .chat-message{background:#1e293b!important;color:#cbd5e1!important}
  .chat-message.tool{background:#0f3a2d!important}
  .chat-message.system{background:#3f3f46!important}
}
.content{display:flex;align-items:flex-start;gap:14px}
.avatar-ring{width:44px;height:44px;border-radius:50%;padding:2px;
  background:linear-gradient(135deg,#fbbf24,#f97316,#ef4444);flex-shrink:0;margin-top:2px}
.avatar-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;display:block}
.text-area{flex:1;min-width:0}
.title-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.title{font-size:14px;font-weight:700;color:#0f172a;line-height:1.3;flex:1;min-width:0}
.status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.status-badge.pending{background:#e2e8f0;color:#475569}
.status-badge.executing{background:#dcfce7;color:#047857}
.status-badge.completed{background:#dbeafe;color:#1d4ed8}
.status-badge.failed{background:#fee2e2;color:#dc2626}
.desc{font-size:12px;color:#64748b;line-height:1.45;margin-top:3px}
.meta-row{font-size:11px;color:#64748b;line-height:1.4}
.actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.actions button{border:none;border-radius:10px;padding:7px 16px;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .2s}
.btn-primary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff}
.btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-secondary{background:#f1f5f9;color:#475569}
.btn-secondary:hover{background:#e2e8f0}
.btn-execute{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
.btn-execute:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:#94a3b8;padding:7px 10px}
.btn-ghost:hover{color:#64748b}
.progress-area{display:none;gap:10px;grid-template-columns:1fr}
.progress-area.visible{display:block}
.section{border:1px solid rgba(15,23,42,.08);background:rgba(248,250,252,.9);border-radius:14px;padding:10px 12px}
.section-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px}
.steps{display:flex;flex-direction:column;gap:8px;max-height:180px;overflow:auto;padding-right:2px}
.step{display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#64748b}
.step-icon{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:10px;flex-shrink:0}
.step-pending .step-icon{background:#f1f5f9;color:#94a3b8}
.step-running .step-icon{background:#dbeafe;color:#3b82f6;animation:pulse 1.5s infinite}
.step-done .step-icon{background:#d1fae5;color:#059669}
.step-failed .step-icon{background:#fee2e2;color:#ef4444}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.step-body{flex:1;min-width:0}
.step-label{display:block;font-weight:600;color:#0f172a}
.step-detail{display:block;margin-top:2px;font-size:11px;color:#64748b;line-height:1.45;white-space:pre-wrap;word-break:break-word}
.result-area{padding:10px;border-radius:10px;background:#f8fafc;
  font-size:12px;color:#334155;line-height:1.5;display:none;min-height:80px;max-height:180px;overflow-y:auto;
  white-space:pre-wrap;word-break:break-word}
.result-area.visible{display:block}
.chat-list{display:flex;flex-direction:column;gap:8px}
.chat-message{border-radius:12px;padding:8px 10px;background:#eef2ff}
.chat-message.assistant{background:#e0f2fe}
.chat-message.user{background:#dbeafe}
.chat-message.tool{background:#dcfce7}
.chat-message.system{background:#f1f5f9}
.chat-role{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;color:#475569}
.chat-content{display:block;white-space:pre-wrap;word-break:break-word;line-height:1.5}
.composer{display:none;gap:8px;align-items:flex-end}
.composer.visible{display:flex}
.composer textarea{flex:1;min-height:44px;max-height:96px;resize:none;border:1px solid rgba(15,23,42,.12);border-radius:12px;padding:10px 12px;font:inherit;line-height:1.5;outline:none;background:#fff;color:#0f172a}
.composer textarea:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.composer button{border:none;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer;background:#2563eb;color:#fff}
.composer button:disabled{opacity:.55;cursor:not-allowed}
.progress-bar{position:absolute;bottom:0;left:0;height:2.5px;background:linear-gradient(90deg,#fbbf24,#f97316);
  border-radius:0 0 0 18px;width:0}
.progress-bar.animate{width:100%;animation:shrink ${toastDurationMs / 1000}s linear forwards}
@keyframes shrink{from{width:100%}to{width:0}}
</style></head><body>
<div class="popup-wrapper" id="popup">
  <div class="card">
    <div class="content">
      <div class="avatar-ring"><img src="${avatarBase64}" alt="" /></div>
      <div class="text-area">
        <div class="title-row">
          <div class="title" id="notif-title"></div>
          <div class="status-badge pending" id="status-badge">待确认</div>
        </div>
        <div class="desc" id="notif-desc"></div>
        <div class="meta-row" id="meta-row"></div>
      </div>
    </div>
    <div class="actions" id="actions"></div>
    <div class="progress-area" id="progress-area"></div>
    <div class="result-area" id="result-area"></div>
    <div class="composer" id="chat-composer">
      <textarea id="chat-input" placeholder="继续告诉我该怎么做，或补充信息…"></textarea>
      <button id="chat-send">发送</button>
    </div>
    <div class="progress-bar" id="progress-bar"></div>
  </div>
</div>
<script>
const { ipcRenderer } = require('electron');
const BACKEND_URL = '${escapePopupText(backendUrl)}';
const TOOL_EVENT_PREFIX = "\\n[TOOL_EVENT:";
const TOOL_EVENT_SUFFIX = "]\\n";
const executionState = {
  actionId: '',
  sessionId: '',
  selectedTools: [],
  externalTools: [],
  isStreaming: false,
  messages: [],
  assistantStreamingIndex: -1,
};
function doAction(action, actionId) {
  ipcRenderer.send('popup-action', { action, actionId });
}
function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function appendChatMessage(role, content) {
  executionState.messages.push({ role, content });
  executionState.assistantStreamingIndex = role === 'assistant' ? executionState.messages.length - 1 : executionState.assistantStreamingIndex;
  renderChatMessages();
}
function updateStreamingAssistant(chunk) {
  if (!chunk) return;
  if (executionState.assistantStreamingIndex === -1) {
    appendChatMessage('assistant', chunk);
    return;
  }
  executionState.messages[executionState.assistantStreamingIndex].content += chunk;
  renderChatMessages();
}
function appendToolEvent(event) {
  if (event.type === 'tool_call_start' && event.tool_name) {
    appendChatMessage('tool', '开始调用工具：' + event.tool_name);
    return;
  }
  if (event.type === 'tool_call_end' && event.tool_name) {
    const summary = event.error ? '工具执行失败：' : '工具执行完成：';
    const detail = event.result_preview ? '\\n' + event.result_preview : '';
    appendChatMessage('tool', summary + event.tool_name + detail);
  }
}
function parseToolEvents(chunk) {
  const events = [];
  let content = chunk;
  let startIdx = content.indexOf(TOOL_EVENT_PREFIX);
  while (startIdx !== -1) {
    const endIdx = content.indexOf(TOOL_EVENT_SUFFIX, startIdx);
    if (endIdx === -1) break;
    const jsonStart = startIdx + TOOL_EVENT_PREFIX.length;
    const jsonStr = content.substring(jsonStart, endIdx);
    try {
      events.push(JSON.parse(jsonStr));
    } catch {}
    content = content.substring(0, startIdx) + content.substring(endIdx + TOOL_EVENT_SUFFIX.length);
    startIdx = content.indexOf(TOOL_EVENT_PREFIX);
  }
  return [events, content];
}
function renderChatMessages() {
  const ra = document.getElementById('result-area');
  ra.className = 'result-area visible';
  if (executionState.messages.length === 0) {
    ra.textContent = '执行会话已建立，正在等待第一条消息…';
    return;
  }
  const roleLabel = (role) => {
    if (role === 'assistant') return 'AI';
    if (role === 'user') return '你';
    if (role === 'tool') return '工具';
    return '系统';
  };
  ra.innerHTML =
    '<div class="section-title">执行对话</div>' +
    '<div class="chat-list">' +
    executionState.messages.map((message) => {
      const role = String(message.role || 'system');
      return '<div class="chat-message ' + role + '"><span class="chat-role">' + escapeHtml(roleLabel(role)) + '</span><span class="chat-content">' + escapeHtml(message.content || '') + '</span></div>';
    }).join('') +
    '</div>';
  ra.scrollTop = ra.scrollHeight;
}
async function streamChatMessage(payload) {
  executionState.isStreaming = true;
  const sendBtn = document.getElementById('chat-send');
  const input = document.getElementById('chat-input');
  sendBtn.disabled = true;
  input.disabled = true;
  executionState.assistantStreamingIndex = -1;
  try {
    const response = await fetch(BACKEND_URL + '/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'zh',
      },
      body: JSON.stringify(payload),
    });
    const headerSessionId = response.headers.get('X-Session-Id');
    if (headerSessionId) {
      executionState.sessionId = headerSessionId;
    }
    if (!response.ok || !response.body) {
      throw new Error('stream failed');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pendingChunk = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const rawChunk = decoder.decode(value, { stream: true });
      const fullChunk = pendingChunk + rawChunk;
      const tuple = parseToolEvents(fullChunk);
      const events = tuple[0];
      const content = tuple[1];
      events.forEach(appendToolEvent);
      const incompleteEventIdx = content.indexOf(TOOL_EVENT_PREFIX);
      if (incompleteEventIdx !== -1) {
        pendingChunk = content.substring(incompleteEventIdx);
        const completeContent = content.substring(0, incompleteEventIdx);
        if (completeContent) {
          updateStreamingAssistant(completeContent);
        }
      } else {
        pendingChunk = '';
        if (content) {
          updateStreamingAssistant(content);
        }
      }
    }
  } catch (error) {
    appendChatMessage('system', '发送执行消息失败，请稍后重试。');
  } finally {
    executionState.isStreaming = false;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
    executionState.assistantStreamingIndex = -1;
  }
}
async function sendExecutionChat(text, backendMessage) {
  const trimmed = String(text || '').trim();
  if (!trimmed || executionState.isStreaming) return;
  appendChatMessage('user', trimmed);
  await streamChatMessage({
    message: backendMessage || trimmed,
    user_input: trimmed,
    conversation_id: executionState.sessionId || undefined,
    mode: 'agno',
    use_rag: false,
    selected_tools: executionState.selectedTools,
    external_tools: executionState.externalTools,
  });
}
function enterExecutionChat(payload) {
  executionState.actionId = payload.action_id || executionState.actionId;
  executionState.sessionId = payload.session_id || executionState.sessionId;
  executionState.selectedTools = Array.isArray(payload.selected_tools) ? payload.selected_tools : [];
  executionState.externalTools = Array.isArray(payload.external_tools) ? payload.external_tools : [];
  executionState.messages = [];
  executionState.assistantStreamingIndex = -1;
  document.getElementById('status-badge').textContent = '执行中';
  document.getElementById('status-badge').className = 'status-badge executing';
  document.getElementById('meta-row').textContent = '执行过程会持续显示在这里，你也可以随时插话。';
  document.getElementById('actions').innerHTML =
    '<button class="btn-secondary" onclick="doAction(\\'close\\',\\'' + escapeHtml(executionState.actionId) + '\\')">关闭</button>';
  const composer = document.getElementById('chat-composer');
  composer.className = 'composer visible';
  const input = document.getElementById('chat-input');
  input.disabled = false;
  input.value = '';
  renderChatMessages();
  appendChatMessage('system', '执行会话已建立，我会在这里持续同步动作和结果。');
  if (payload.is_new_session && payload.initial_user_input) {
    sendExecutionChat(payload.initial_user_input, payload.initial_message || payload.initial_user_input);
  }
}
window.startExecutionChat = enterExecutionChat;
document.getElementById('chat-send').addEventListener('click', () => {
  const input = document.getElementById('chat-input');
  const value = input.value;
  input.value = '';
  sendExecutionChat(value);
});
document.getElementById('chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    document.getElementById('chat-send').click();
  }
});
ipcRenderer.on('start-execution-chat', (_e, data) => {
  enterExecutionChat(data);
});
</script>
</body></html>`;
}
