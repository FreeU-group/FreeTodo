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
.chat-message.tool{background:#dcfce7}
.chat-message.system{background:#f1f5f9}
.chat-role{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px;color:#475569}
.chat-content{display:block;white-space:pre-wrap;word-break:break-word;line-height:1.5}
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
    <div class="progress-bar" id="progress-bar"></div>
  </div>
</div>
<script>
const { ipcRenderer } = require('electron');
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
function statusMeta(status) {
  if (status === 'executing') return { label: '执行中', cls: 'executing' };
  if (status === 'completed') return { label: '已完成', cls: 'completed' };
  if (status === 'failed') return { label: '执行失败', cls: 'failed' };
  return { label: '待确认', cls: 'pending' };
}
function stepStatusClass(status) {
  if (status === 'running') return 'step-running';
  if (status === 'done' || status === 'completed' || status === 'success') return 'step-done';
  if (status === 'failed' || status === 'error') return 'step-failed';
  return 'step-pending';
}
function stepStatusIcon(status) {
  if (status === 'running') return '…';
  if (status === 'done' || status === 'completed' || status === 'success') return '✓';
  if (status === 'failed' || status === 'error') return '!';
  return '·';
}
function renderStepList(title, steps, emptyText) {
  const items = Array.isArray(steps) ? steps : [];
  const body = items.length
    ? items.map((step) => {
        const cls = stepStatusClass(step.status);
        const icon = stepStatusIcon(step.status);
        const detail = step.detail ? '<span class="step-detail">' + escapeHtml(step.detail) + '</span>' : '';
        return '<div class="step ' + cls + '"><div class="step-icon">' + icon + '</div><div class="step-body"><span class="step-label">' + escapeHtml(step.label) + '</span>' + detail + '</div></div>';
      }).join('')
    : '<div class="step step-pending"><div class="step-icon">·</div><div class="step-body"><span class="step-detail">' + escapeHtml(emptyText) + '</span></div></div>';
  return '<div class="section"><div class="section-title">' + escapeHtml(title) + '</div><div class="steps">' + body + '</div></div>';
}
function renderProgress(data) {
  const meta = statusMeta(data.status);
  const badge = document.getElementById('status-badge');
  badge.textContent = meta.label;
  badge.className = 'status-badge ' + meta.cls;
  const planSteps = (data.execution_plan || []).map((label, idx) => {
    const found = Array.isArray(data.execution_steps)
      ? data.execution_steps.find((step) => step.key === 'plan_' + (idx + 1))
      : null;
    return {
      label: label,
      status: found ? found.status : 'pending',
      detail: found && found.detail ? found.detail : ''
    };
  });
  const activitySteps = Array.isArray(data.execution_steps)
    ? data.execution_steps.filter((step) => !String(step.key || '').startsWith('plan_'))
    : [];
  const progressArea = document.getElementById('progress-area');
  progressArea.className = 'progress-area visible';
  progressArea.innerHTML =
    renderStepList('执行计划', planSteps, '暂无预设步骤') +
    renderStepList('实时动作', activitySteps, '任务已启动，正在等待实时进展…');
  const ra = document.getElementById('result-area');
  ra.className = 'result-area visible';
  if (Array.isArray(data.execution_messages) && data.execution_messages.length > 0) {
    const roleLabel = (role) => {
      if (role === 'assistant') return 'AI';
      if (role === 'tool') return '工具';
      return '系统';
    };
    ra.innerHTML =
      '<div class="section-title">执行对话</div>' +
      '<div class="chat-list">' +
      data.execution_messages.map((message) => {
        const role = String(message.role || 'system');
        return '<div class="chat-message ' + role + '"><span class="chat-role">' + escapeHtml(roleLabel(role)) + '</span><span class="chat-content">' + escapeHtml(message.content || '') + '</span></div>';
      }).join('') +
      '</div>';
  } else {
    const content = data.result || data.streaming_output || '启动中...';
    ra.textContent = content;
  }
  ra.scrollTop = ra.scrollHeight;
}
ipcRenderer.on('update-progress', (_e, data) => {
  renderProgress(data);
});
</script>
</body></html>`;
}
