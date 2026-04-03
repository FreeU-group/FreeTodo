const { app, BrowserWindow, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const MARGIN = 16;
const WIDTH = 420;
const HEIGHT_CONFIRM = 340;
const HEIGHT_CHAT = 620;

app.disableHardwareAcceleration();

if (process.platform === "darwin") {
	app.dock.hide();
}

let avatarBase64 = "";

function loadAvatar() {
	const avatarPath = path.join(__dirname, "..", "public", "hi_dog2.png");
	try {
		if (fs.existsSync(avatarPath)) {
			const buffer = fs.readFileSync(avatarPath);
			avatarBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
		}
	} catch {}
}

function loadData() {
	const dataFile = process.argv.find((arg) => arg.endsWith(".json"));
	if (!dataFile) return {};
	try {
		return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
	} catch {
		return {};
	}
}

function escapeForJs(value) {
	return String(value || "")
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/\r/g, "\\r")
		.replace(/\n/g, "\\n");
}

function getHtml(data) {
	const planItems = Array.isArray(data.executionPlan) ? data.executionPlan : [];
	const planHtml = planItems.length
		? planItems.map((item) => `<div class="step"><span class="dot"></span><span>${String(item || "")}</span></div>`).join("")
		: '<div class="empty">确认后会在这里展示执行过程。</div>';

	return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{background:transparent!important;height:100%;overflow:hidden;font-family:'Inter','Segoe UI',sans-serif}
body{padding:8px}.card{height:100%;display:flex;flex-direction:column;border-radius:18px;background:rgba(24,24,27,.98);color:#e5e7eb;border:1px solid rgba(255,255,255,.08);box-shadow:0 18px 40px rgba(0,0,0,.35);overflow:hidden}
.head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)}.avatar{width:34px;height:34px;border-radius:10px;overflow:hidden;background:rgba(59,130,246,.18);padding:5px;flex-shrink:0}.avatar img{width:100%;height:100%;display:block;object-fit:cover}
.meta{flex:1;min-width:0}.title{font-size:14px;font-weight:700;line-height:1.35}.badge{display:inline-flex;margin-top:4px;padding:3px 8px;border-radius:999px;background:rgba(148,163,184,.18);color:#cbd5e1;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.badge.executing{background:rgba(16,185,129,.18);color:#6ee7b7}.close{border:none;background:transparent;color:#94a3b8;font-size:18px;cursor:pointer}
.body{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:14px 16px;overflow:hidden}.desc{font-size:12px;line-height:1.6;color:#cbd5e1;white-space:pre-wrap;word-break:break-word}
.section{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:14px;padding:12px}.section-title{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px}
.steps{display:flex;flex-direction:column;gap:8px;max-height:120px;overflow:auto}.step{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;color:#e5e7eb}.dot{width:8px;height:8px;border-radius:50%;background:#60a5fa;margin-top:5px;flex-shrink:0}.empty{font-size:12px;color:#94a3b8}
.chat{display:none;flex:1;min-height:0;flex-direction:column;gap:10px}.chat.visible{display:flex}.messages{flex:1;min-height:160px;max-height:100%;overflow:auto;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:8px}
.msg{border-radius:12px;padding:8px 10px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word}.msg.system{background:rgba(148,163,184,.14)}.msg.user{background:rgba(59,130,246,.18)}.msg.assistant{background:rgba(14,165,233,.16)}.msg.tool{background:rgba(16,185,129,.16)}
.role{display:block;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}.composer{display:none;gap:8px;align-items:flex-end}.composer.visible{display:flex}
.composer textarea{flex:1;min-height:48px;max-height:96px;resize:none;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;padding:10px 12px;font:inherit;outline:none}.composer button,.actions button{border:none;border-radius:12px;padding:10px 14px;font-size:12px;font-weight:700;cursor:pointer}
.actions{display:flex;justify-content:flex-end;gap:8px;padding:0 16px 16px}.btn-ghost{background:transparent;color:#94a3b8}.btn-secondary{background:rgba(255,255,255,.08);color:#e5e7eb}.btn-primary{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff}.btn-success{background:linear-gradient(135deg,#059669,#10b981);color:#fff}
</style></head><body>
<div class="card">
<div class="head">
<div class="avatar"><img src="${avatarBase64}" alt="" /></div>
<div class="meta"><div class="title" id="title">${String(data.title || "待办确认")}</div><div class="badge" id="badge">待确认</div></div>
<button class="close" id="closeBtn">×</button>
</div>
<div class="body">
<div class="desc" id="desc">${String(data.description || "")}</div>
<div class="section" id="planSection"><div class="section-title">执行预览</div><div class="steps">${planHtml}</div></div>
<div class="chat" id="chatPanel">
<div class="messages" id="messages"></div>
<div class="composer" id="composer"><textarea id="chatInput" placeholder="继续补充信息，或告诉我下一步..."></textarea><button id="sendBtn" class="btn-primary">发送</button></div>
</div>
</div>
<div class="actions" id="actions">
<button class="btn-ghost" id="dismissBtn">忽略</button>
<button class="btn-secondary" id="confirmBtn">确认</button>
<button class="btn-success" id="confirmExecuteBtn">确认并执行</button>
</div>
</div>
<script>
const { ipcRenderer } = require('electron');
const BACKEND_URL = '${escapeForJs(data.centerUrl)}';
const ACTION_ID = '${escapeForJs(data.actionId)}';
const TOOL_EVENT_PREFIX = "\\n[TOOL_EVENT:";
const TOOL_EVENT_SUFFIX = "]\\n";
const state = {sessionId:'',selectedTools:[],externalTools:[],isStreaming:false,messages:[],assistantIndex:-1};
function esc(v){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
function roleLabel(role){if(role==='user')return'你';if(role==='assistant')return'AI';if(role==='tool')return'工具';return'系统'}
function setBadge(text, cls){const badge=document.getElementById('badge');badge.textContent=text;badge.className='badge'+(cls?' '+cls:'')}
function appendMessage(role, content){state.messages.push({role,content});if(role==='assistant'){state.assistantIndex=state.messages.length-1}renderMessages()}
function updateAssistant(chunk){if(!chunk)return;if(state.assistantIndex===-1){appendMessage('assistant',chunk);return}state.messages[state.assistantIndex].content+=chunk;renderMessages()}
function renderMessages(){const box=document.getElementById('messages');if(!state.messages.length){box.innerHTML='<div class="msg system"><span class="role">系统</span>执行会话建立后，过程会显示在这里。</div>';return}box.innerHTML=state.messages.map((m)=>'<div class="msg '+esc(m.role)+'"><span class="role">'+esc(roleLabel(m.role))+'</span>'+esc(m.content)+'</div>').join('');box.scrollTop=box.scrollHeight}
function parseToolEvents(chunk){const events=[];let content=chunk;let start=content.indexOf(TOOL_EVENT_PREFIX);while(start!==-1){const end=content.indexOf(TOOL_EVENT_SUFFIX,start);if(end===-1)break;const raw=content.substring(start+TOOL_EVENT_PREFIX.length,end);try{events.push(JSON.parse(raw))}catch{}content=content.substring(0,start)+content.substring(end+TOOL_EVENT_SUFFIX.length);start=content.indexOf(TOOL_EVENT_PREFIX)}return[events,content]}
function appendToolEvent(event){if(event.type==='tool_call_start'&&event.tool_name){appendMessage('tool','开始调用工具：'+event.tool_name);return}if(event.type==='tool_call_end'&&event.tool_name){appendMessage('tool',(event.error?'工具执行失败：':'工具执行完成：')+event.tool_name+(event.result_preview?'\\n'+event.result_preview:''))}}
function setDisabled(id, busy){const el=document.getElementById(id);if(el){el.disabled=busy}}
function setBusy(busy){state.isStreaming=busy;setDisabled('sendBtn',busy);setDisabled('chatInput',busy);setDisabled('confirmBtn',busy);setDisabled('dismissBtn',busy);setDisabled('confirmExecuteBtn',busy)}
function enterChatMode(){document.getElementById('actions').innerHTML='<button class="btn-secondary" id="chatCloseBtn">关闭</button>';document.getElementById('chatCloseBtn').addEventListener('click',()=>ipcRenderer.send('pending-popup-close',1));document.getElementById('chatPanel').className='chat visible';document.getElementById('composer').className='composer visible';setBadge('执行中','executing');ipcRenderer.send('pending-popup-resize', ${HEIGHT_CHAT});renderMessages();document.getElementById('chatInput').focus()}
async function postAction(endpoint){const res=await fetch(BACKEND_URL+'/api/intent-actions/'+ACTION_ID+'/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':'zh'}});const text=await res.text().catch(()=> '');let data=null;try{data=JSON.parse(text)}catch{}if(!res.ok||data?.success===false){throw new Error(String(data?.detail||data?.message||text||('HTTP '+res.status)))}return data||{}}
async function streamChatMessage(payload){setBusy(true);state.assistantIndex=-1;try{const response=await fetch(BACKEND_URL+'/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':'zh'},body:JSON.stringify(payload)});const sid=response.headers.get('X-Session-Id');if(sid)state.sessionId=sid;if(!response.ok||!response.body)throw new Error('stream failed');const reader=response.body.getReader();const decoder=new TextDecoder();let pending='';while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;const raw=decoder.decode(value,{stream:true});const [events,content]=parseToolEvents(pending+raw);events.forEach(appendToolEvent);const idx=content.indexOf(TOOL_EVENT_PREFIX);if(idx!==-1){pending=content.substring(idx);const ready=content.substring(0,idx);if(ready)updateAssistant(ready)}else{pending='';if(content)updateAssistant(content)}}}catch(error){appendMessage('system','执行消息发送失败：'+String(error&&error.message?error.message:error))}finally{setBusy(false);state.assistantIndex=-1;const input=document.getElementById('chatInput');if(input){input.focus()}}}
async function sendChat(text, backendMessage){const trimmed=String(text||'').trim();if(!trimmed||state.isStreaming)return;appendMessage('user',trimmed);await streamChatMessage({message:backendMessage||trimmed,user_input:trimmed,conversation_id:state.sessionId||undefined,mode:'agno',use_rag:false,selected_tools:state.selectedTools,external_tools:state.externalTools})}
async function handleConfirm(){setBusy(true);try{await postAction('confirm');ipcRenderer.send('pending-popup-close',0)}catch(error){appendMessage('system','确认失败：'+String(error&&error.message?error.message:error));setBusy(false)}}
async function handleDismiss(){try{await postAction('reject')}catch{}ipcRenderer.send('pending-popup-close',2)}
async function handleConfirmExecute(){enterChatMode();appendMessage('system','正在确认待办并建立执行会话...');try{const result=await postAction('confirm-and-execute');state.sessionId=String(result?.data?.session_id||'');state.selectedTools=Array.isArray(result?.data?.selected_tools)?result.data.selected_tools:[];state.externalTools=Array.isArray(result?.data?.external_tools)?result.data.external_tools:[];appendMessage('system','待办已确认，我会在这里继续执行并同步过程。');const firstUserInput=result?.data?.initial_user_input;const firstMessage=result?.data?.initial_message;if(result?.data?.is_new_session&&firstUserInput){await sendChat(firstUserInput,firstMessage||firstUserInput)}}catch(error){appendMessage('system','确认并执行失败：'+String(error&&error.message?error.message:error));setBusy(false)}}
document.getElementById('closeBtn').addEventListener('click',()=>ipcRenderer.send('pending-popup-close',1));
document.getElementById('confirmBtn').addEventListener('click',()=>{void handleConfirm()});
document.getElementById('dismissBtn').addEventListener('click',()=>{void handleDismiss()});
document.getElementById('confirmExecuteBtn').addEventListener('click',()=>{void handleConfirmExecute()});
document.getElementById('sendBtn').addEventListener('click',()=>{const input=document.getElementById('chatInput');const value=input.value;input.value='';void sendChat(value)});
document.getElementById('chatInput').addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();document.getElementById('sendBtn').click()}});
</script></body></html>`;
}

app.whenReady().then(() => {
	loadAvatar();
	const data = loadData();
	const workArea = screen.getPrimaryDisplay().workArea;
	const win = new BrowserWindow({
		width: WIDTH,
		height: HEIGHT_CONFIRM,
		x: workArea.x + workArea.width - WIDTH - MARGIN,
		y: workArea.y + workArea.height - HEIGHT_CONFIRM - MARGIN,
		frame: false,
		transparent: true,
		backgroundColor: "#00000000",
		alwaysOnTop: true,
		skipTaskbar: false,
		resizable: false,
		movable: true,
		focusable: true,
		hasShadow: false,
		show: false,
		webPreferences: { nodeIntegration: true, contextIsolation: false },
	});

	win.setAlwaysOnTop(true, "screen-saver");
	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	ipcMain.on("pending-popup-resize", (_event, nextHeight) => {
		const height = Number(nextHeight) || HEIGHT_CHAT;
		const area = screen.getPrimaryDisplay().workArea;
		win.setSize(WIDTH, height);
		win.setPosition(area.x + area.width - WIDTH - MARGIN, area.y + area.height - height - MARGIN);
	});

	ipcMain.on("pending-popup-close", (_event, code) => {
		process.exitCode = Number(code) || 0;
		win.close();
	});

	win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getHtml(data))}`);
	win.once("ready-to-show", () => {
		win.show();
		win.focus();
	});
	win.on("closed", () => app.quit());
});

app.on("window-all-closed", () => {
	app.quit();
});
