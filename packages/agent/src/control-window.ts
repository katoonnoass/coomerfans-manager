import { BrowserWindow, app } from 'electron';
import path from 'path';
import { ServerManager } from './server-manager';

let controlWindow: BrowserWindow | null = null;

export function createControlWindow(manager: ServerManager): BrowserWindow {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
    sendStatus(manager);
    controlWindow.webContents.send('logs:batch', manager.getLogs());
    return controlWindow;
  }

  controlWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 600,
    minHeight: 350,
    title: 'CoomerFans — Server Control',
    backgroundColor: '#0a0a0f',
    show: true,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const html = buildControlHTML();
  controlWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  controlWindow.webContents.on('console-message', (_event, _level, message) => {
    manager.addLog('agent', `[UI] ${message}`);
  });

  // Minimize to tray instead of closing
  controlWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      controlWindow?.hide();
    }
  });

  controlWindow.webContents.on('dom-ready', () => {
    // Send initial state
    sendStatus(manager);

    // Stream logs
    const onLog = (source: string, line: string) => {
      controlWindow?.webContents.send('log:line', {
        time: new Date().toISOString(),
        source,
        line,
      });
    };
    manager.on('log', onLog);

    const onStatus = () => sendStatus(manager);
    manager.on('status-change', onStatus);

    // Load initial logs
    const logs = manager.getLogs();
    controlWindow?.webContents.send('logs:batch', logs);

    controlWindow?.on('closed', () => {
      manager.off('log', onLog);
      manager.off('status-change', onStatus);
      controlWindow = null;
    });
  });

  // Show on launch
  controlWindow.show();

  return controlWindow;
}

function sendStatus(manager: ServerManager) {
  const statuses = manager.getStatuses();
  controlWindow?.webContents.send('status:update', statuses);
  controlWindow?.webContents.send('status:root', manager.getProjectRoot());
}

export function showControlWindow() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
  }
}

function buildControlHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CoomerFans — Control Panel</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e0e0e0;font-family:'Segoe UI',Inter,system-ui,sans-serif;font-size:13px;display:flex;flex-direction:column;height:100vh;user-select:none}
.topbar{display:flex;align-items:center;padding:10px 16px;background:rgba(18,18,26,0.9);border-bottom:1px solid rgba(255,255,255,0.05);gap:12px}
.topbar h1{font-size:15px;font-weight:600;background:linear-gradient(90deg,#ff00ff,#00ffff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.topbar .path{font-size:10px;color:#444;margin-left:auto;font-family:monospace;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.content{flex:1;display:flex;flex-direction:column;overflow:hidden}
.status-bar{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.03)}
.status-card{padding:10px 14px;border-radius:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)}
.status-card .name{font-size:11px;color:#666;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px}
.status-card .state{font-size:14px;font-weight:600}
.status-card .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px}
.status-card .dot.running{background:#00ff88;box-shadow:0 0 8px rgba(0,255,136,0.4)}
.status-card .dot.starting{background:#fa0;box-shadow:0 0 8px rgba(255,170,0,0.4);animation:pulse 1s infinite}
.status-card .dot.error{background:#f06;box-shadow:0 0 8px rgba(255,0,102,0.4)}
.status-card .dot.stopped{background:#444}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.controls{display:flex;gap:8px;padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.03)}
.btn{padding:8px 20px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.03);color:#ccc;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s;font-family:inherit}
.btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(0,255,255,0.3);color:#fff}
.btn.start{border-color:rgba(0,255,136,0.2);background:rgba(0,255,136,0.05)}
.btn.start:hover{border-color:rgba(0,255,136,0.4);box-shadow:0 0 15px rgba(0,255,136,0.1)}
.btn.stop{border-color:rgba(255,0,102,0.2);background:rgba(255,0,102,0.05)}
.btn.stop:hover{border-color:rgba(255,0,102,0.4);box-shadow:0 0 15px rgba(255,0,102,0.1)}
.btn.restart{border-color:rgba(255,170,0,0.2);background:rgba(255,170,0,0.05)}
.btn.restart:hover{border-color:rgba(255,170,0,0.4)}
.btn.open{border-color:rgba(0,255,255,0.2);background:rgba(0,255,255,0.05)}
.btn.open:hover{border-color:rgba(0,255,255,0.4)}
.log-tabs{display:flex;gap:6px;padding:8px 16px 0;border-bottom:1px solid rgba(255,255,255,0.03)}
.tab{padding:6px 10px;border:1px solid rgba(255,255,255,0.06);border-bottom:0;border-radius:7px 7px 0 0;background:rgba(255,255,255,0.02);color:#777;font-size:11px;cursor:pointer}
.tab.active{color:#fff;background:rgba(0,255,255,0.08);border-color:rgba(0,255,255,0.25)}
.logs{flex:1;overflow-y:auto;padding:6px 16px;font-family:'JetBrains Mono','Consolas',monospace;font-size:11px;line-height:1.7}
.log-line{display:flex;gap:8px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.015)}
.log-time{color:#333;flex-shrink:0;font-size:10px}
.log-source{flex-shrink:0;min-width:55px;text-align:right;font-weight:600;font-size:10px}
.log-source.b1{color:#0ff}.log-source.b2{color:#f60}.log-source.b3{color:#b4f}.log-source.b0{color:#f0f}
.log-text{color:#999;word-break:break-all;flex:1}
.footer{display:flex;align-items:center;padding:8px 16px;background:rgba(18,18,26,0.8);border-top:1px solid rgba(255,255,255,0.03);gap:16px}
.footer .hint{font-size:10px;color:#444}
.footer .hint kbd{color:#888;background:rgba(255,255,255,0.05);padding:2px 5px;border-radius:3px;font-family:monospace;font-size:10px}
</style>
</head>
<body>
<div class="topbar">
<h1>◆ CoomerFans</h1>
<span style="font-size:10px;color:#555;margin-left:4px">Server Control</span>
<span class="path" id="rootPath">Detecting...</span>
</div>
<div class="content">
<div class="status-bar">
<div class="status-card"><div class="name">Backend :3001</div><div class="state" id="st-backend"><span class="dot stopped"></span>Stopped</div></div>
<div class="status-card"><div class="name">Worker</div><div class="state" id="st-worker"><span class="dot stopped"></span>Stopped</div></div>
<div class="status-card"><div class="name">Frontend :5173</div><div class="state" id="st-frontend"><span class="dot stopped"></span>Stopped</div></div>
<div class="status-card"><div class="name">PostgreSQL :5432</div><div class="state" id="st-postgresql"><span class="dot stopped"></span>Stopped</div></div>
<div class="status-card"><div class="name">Redis :6379</div><div class="state" id="st-redis"><span class="dot stopped"></span>Stopped</div></div>
</div>
<div class="controls">
<button class="btn start" onclick="window.ipc.send('agent:start')">▶ Start All</button>
<button class="btn stop" onclick="window.ipc.send('agent:stop')">■ Stop All</button>
<button class="btn restart" onclick="window.ipc.send('agent:restart')">↻ Restart</button>
<button class="btn open" onclick="window.ipc.send('agent:open')">🌐 Open App</button>
<button class="btn" onclick="window.ipc.send('agent:refresh')">⟳ Refresh</button>
</div>
<div class="log-tabs">
<button class="tab active" data-tab="all" onclick="setTab('all')">All</button>
<button class="tab" data-tab="agent" onclick="setTab('agent')">Agent</button>
<button class="tab" data-tab="backend" onclick="setTab('backend')">Backend</button>
<button class="tab" data-tab="worker" onclick="setTab('worker')">Worker</button>
<button class="tab" data-tab="frontend" onclick="setTab('frontend')">Frontend</button>
</div>
<div class="logs" id="logContainer"></div>
</div>
<div class="footer">
<span class="hint"><kbd>X</kbd> Minimize to tray</span>
<span class="hint" style="margin-left:auto">Right-click tray for menu</span>
</div>
<script>
const c=document.getElementById('logContainer');
let activeTab='all';
const rows=[];
function addLine(time,source,text){
  rows.push({time,source,text});
  if(rows.length>2000)rows.shift();
  renderLine({time,source,text});
}
function renderLine(row){
  if(activeTab!=='all'&&row.source!==activeTab)return;
  const d=document.createElement('div');
  d.className='log-line';
  const dt=new Date(row.time).toLocaleTimeString();
  const sc=row.source==='agent'?'b0':row.source==='backend'?'b1':row.source==='worker'?'b2':'b3';
  d.innerHTML='<span class="log-time">'+dt+'</span><span class="log-source '+sc+'">['+row.source+']</span><span class="log-text">'+escapeHtml(row.text)+'</span>';
  c.appendChild(d);c.scrollTop=c.scrollHeight;
  if(c.children.length>2000)c.firstChild.remove();
}
function setTab(tab){
  activeTab=tab;
  document.querySelectorAll('.tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab===tab)});
  c.innerHTML='';
  rows.forEach(renderLine);
  c.scrollTop=c.scrollHeight;
}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function setStatus(name,status){
  const el=document.getElementById('st-'+name.toLowerCase());
  if(!el)return;
  const labels={running:'Running',starting:'Starting...',stopping:'Stopping...',error:'Error',stopped:'Stopped'};
  el.innerHTML='<span class="dot '+status+'"></span>'+(labels[status]||status);
}
window.ipc.on('status:update',function(s){Object.keys(s).forEach(function(k){setStatus(k,s[k])})});
window.ipc.on('status:root',function(r){document.getElementById('rootPath').textContent=r});
window.ipc.on('logs:batch',function(logs){logs.forEach(function(l){addLine(l.time,l.source,l.line)})});
window.ipc.on('log:line',function(d){addLine(d.time,d.source,d.line)});
</script>
</body>
</html>`;
}
