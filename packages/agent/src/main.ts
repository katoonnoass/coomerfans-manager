import { app, ipcMain } from 'electron';
import { ServerManager } from './server-manager';
import { createTray } from './tray';
import { createControlWindow, showControlWindow } from './control-window';

let manager: ServerManager;
let tray: ReturnType<typeof createTray>;
let shutdownStarted = false;

// Track if user is quitting (vs closing window)
(global as any).isQuitting = false;

app.on('window-all-closed', () => {
  // Don't quit — keep tray running
});

app.whenReady().then(() => {
  manager = new ServerManager();
  tray = createTray(manager, showControlWindow);

  // Open control window on launch
  createControlWindow(manager);

  // IPC from control window and log window
  ipcMain.on('agent:start', () => manager.startAll());
  ipcMain.on('agent:stop', () => manager.stopAll());
  ipcMain.on('agent:restart', () => manager.restartAll());
  ipcMain.on('agent:open', () => manager.openApp());
  ipcMain.on('agent:refresh', () => manager.refreshStatuses());

  ipcMain.on('action', (_event, action: string) => {
    switch (action) {
      case 'start': manager.startAll(); break;
      case 'stop': manager.stopAll(); break;
      case 'restart': manager.restartAll(); break;
    }
  });

  manager.addLog('agent', '═══════════════════════════════════');
  manager.addLog('agent', '  CoomerFans Agent v1.0 Ready');
  manager.addLog('agent', '  Click Start All to launch services');
  manager.addLog('agent', '═══════════════════════════════════');
  manager.addLog('agent', '');

  const root = manager.getProjectRoot();
  const { existsSync } = require('fs');
  const { join } = require('path');

  const dirs = ['packages/backend', 'packages/worker', 'packages/frontend'];
  let ok = true;

  for (const dir of dirs) {
    const full = join(root, dir);
    const pkg = join(full, 'package.json');
    const modules = join(full, 'node_modules');
    if (existsSync(full) && existsSync(pkg)) {
      manager.addLog('agent', `  ✓ ${dir}`);
    } else {
      manager.addLog('agent', `  ✗ ${dir} NOT FOUND at ${full}`);
      ok = false;
    }
  }

  if (!ok) {
    manager.addLog('agent', '');
    manager.addLog('agent', '[ERROR] Project files not found!');
    manager.addLog('agent', '[ERROR] Place this .exe inside the coomerfans-manager folder');
    manager.addLog('agent', `[ERROR] Current root: ${root}`);
  } else {
    manager.addLog('agent', '');
    manager.addLog('agent', 'All project files found. Click Start All to begin.');
    manager.addLog('agent', 'Backend → http://localhost:3001');
    manager.addLog('agent', 'Frontend → http://localhost:5173');
  }

  if (process.argv.includes('--start-all')) {
    setTimeout(() => manager.startAll(), 500);
  }
});

app.on('before-quit', async (event) => {
  if (shutdownStarted) return;
  shutdownStarted = true;
  event.preventDefault();
  (global as any).isQuitting = true;
  manager?.addLog('agent', '[EXIT] Shutting down all services...');
  await manager?.stopAll();
  manager?.dispose();
  app.exit(0);
});
