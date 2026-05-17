import { BrowserWindow } from 'electron';
import path from 'path';
import { ServerManager } from './server-manager';

let logWindow: BrowserWindow | null = null;

export function createLogWindow(manager: ServerManager): BrowserWindow {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return logWindow;
  }

  logWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 500,
    minHeight: 300,
    title: 'CoomerFans — Server Logs',
    frame: true,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const html = buildLogHTML();
  logWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  logWindow.webContents.on('dom-ready', () => {
    const logs = manager.getLogs();
    logWindow?.webContents.send('logs:batch', logs);

    const onLog = (source: string, line: string) => {
      logWindow?.webContents.send('log:line', {
        time: new Date().toISOString(),
        source,
        line,
      });
    };
    manager.on('log', onLog);

    const onStatus = (name: string, status: string) => {
      logWindow?.webContents.send('status:change', { name, status });
    };
    manager.on('status-change', onStatus);

    logWindow?.on('closed', () => {
      manager.off('log', onLog);
      manager.off('status-change', onStatus);
      logWindow = null;
    });
  });

  return logWindow;
}

function buildLogHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CoomerFans — Server Logs</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#e0e0e0;font-family:'JetBrains Mono','Fira Code','Consolas',monospace;font-size:12px;overflow:hidden;height:100vh;display:flex;flex-direction:column}
.header{display:flex;align-items:center;gap:16px;padding:12px 16px;background:rgba(18,18,26,0.8);border-bottom:1px solid rgba(255,255,255,0.05);flex-shrink:0}
.header h1{font-size:14px;font-weight:600;background:linear-gradient(90deg,#ff00ff,#00ffff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.status-dots{display:flex;gap:10px;margin-left:auto}
.status-item{display:flex;align-items:center;gap:4px;font-size:10px;color:#666}
.dot{width:6px;height:6px;border-radius:50%;background:#333}
.dot.running{background:#00ff88;box-shadow:0 0 6px rgba(0,255,136,0.5)}
.dot.starting{background:#fa0;box-shadow:0 0 6px rgba(255,170,0,0.5)}
.dot.stopped,.dot.stopping{background:#f06}
.dot.error{background:#f06;box-shadow:0 0 6px rgba(255,0,102,0.5)}
.log-container{flex:1;overflow-y:auto;padding:8px 16px}
.log-line{padding:2px 0;display:flex;gap:8px;line-height:1.6;border-bottom:1px solid rgba(255,255,255,0.02)}
.log-time{color:#444;flex-shrink:0;font-size:10px}
.log-source{flex-shrink:0;width:60px;text-align:right;font-weight:600;font-size:10px}
.log-source.backend{color:#0ff}
.log-source.worker{color:#f60}
.log-source.frontend{color:#b4f}
.log-source.agent{color:#f0f}
.log-text{color:#aaa;word-break:break-all;flex:1}
.controls{display:flex;gap:8px;padding:8px 16px;border-top:1px solid rgba(255,255,255,0.05);background:rgba(18,18,26,0.5);flex-shrink:0}
.btn{padding:6px 14px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);color:#ccc;font-family:inherit;font-size:11px;cursor:pointer;transition:all 0.2s}
.btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(0,255,255,0.3)}
.btn.danger:hover{border-color:rgba(255,0,102,0.3);color:#f06}
</style>
</head>
<body>
<div class="header">
<h1>◆ CoomerFans Agent</h1>
<div class="status-dots">
<div class="status-item"><div class="dot" id="dot-backend"></div>Backend</div>
<div class="status-item"><div class="dot" id="dot-worker"></div>Worker</div>
<div class="status-item"><div class="dot" id="dot-frontend"></div>Frontend</div>
</div>
</div>
<div class="log-container" id="logContainer"></div>
<div class="controls">
<button class="btn" onclick="window.ipc.send('action','start')">▶ Start</button>
<button class="btn" onclick="window.ipc.send('action','stop')">■ Stop</button>
<button class="btn" onclick="window.ipc.send('action','restart')">↻ Restart</button>
<button class="btn danger" onclick="document.getElementById('logContainer').innerHTML=''">Clear</button>
</div>
<script>
const c=document.getElementById('logContainer');
function addLine(time,source,text){
  const d=document.createElement('div');
  d.className='log-line';
  const dt=new Date(time).toLocaleTimeString();
  d.innerHTML='<span class="log-time">'+dt+'</span><span class="log-source '+source+'">['+source.toUpperCase()+']</span><span class="log-text">'+text+'</span>';
  c.appendChild(d);
  c.scrollTop=c.scrollHeight;
  if(c.children.length>2000)c.removeChild(c.firstChild);
}
window.ipc.on('logs:batch',function(_,logs){logs.forEach(function(l){addLine(l.time,l.source,l.line)})});
window.ipc.on('log:line',function(_,d){addLine(d.time,d.source,d.line)});
window.ipc.on('status:change',function(_,d){var dot=document.getElementById('dot-'+d.name.toLowerCase());if(dot)dot.className='dot '+d.status});
</script>
</body>
</html>`;
}
