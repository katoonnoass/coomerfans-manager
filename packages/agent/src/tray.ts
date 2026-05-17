import { Tray, Menu, nativeImage, app, MenuItemConstructorOptions } from 'electron';
import path from 'path';
import fs from 'fs';
import { ServerManager } from './server-manager';
import { createLogWindow } from './log-window';

type ShowWindowFn = () => void;

export function createTray(manager: ServerManager, showWindow: ShowWindowFn) {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');

  let trayIcon: Electron.NativeImage;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    trayIcon = createTrayIcon();
  }

  const tray = new Tray(trayIcon);
  tray.setToolTip('CoomerFans Agent — Server Manager');

  const buildMenu = (): MenuItemConstructorOptions[] => {
    const statuses = manager.getStatuses();
    const anyRunning = Object.values(statuses).some(
      (s) => s === 'running' || s === 'starting'
    );
    const anyStopping = Object.values(statuses).some((s) => s === 'stopping');

    return [
      {
        label: 'CoomerFans Agent v1.0',
        enabled: false,
      },
      {
        label: `Backend   ${dot(statuses['Backend'])} ${label(statuses['Backend'])}`,
        enabled: false,
      },
      {
        label: `Worker    ${dot(statuses['Worker'])} ${label(statuses['Worker'])}`,
        enabled: false,
      },
      {
        label: `Frontend  ${dot(statuses['Frontend'])} ${label(statuses['Frontend'])}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: '📂  Show Control Panel',
        click: () => showWindow(),
      },
      { type: 'separator' },
      {
        label: '▶  Start All Services',
        enabled: !anyRunning && !anyStopping,
        click: () => manager.startAll(),
      },
      {
        label: '■  Stop All Services',
        enabled: anyRunning,
        click: () => manager.stopAll(),
      },
      {
        label: '↻  Restart All',
        enabled: anyRunning && !anyStopping,
        click: () => manager.restartAll(),
      },
      { type: 'separator' },
      {
        label: '📋  Log Viewer',
        click: () => createLogWindow(manager),
      },
      {
        label: '🌐  Open Frontend',
        enabled: statuses['Frontend'] === 'running',
        click: () => manager.openApp(),
      },
      { type: 'separator' },
      {
        label: '✕  Exit Agent',
        click: async () => {
          await manager.stopAll();
          (app as any).isQuitting = true;
          app.quit();
        },
      },
    ];
  };

  const menu = Menu.buildFromTemplate(buildMenu());
  tray.setContextMenu(menu);

  const updateInterval = setInterval(() => {
    try {
      const newMenu = Menu.buildFromTemplate(buildMenu());
      tray.setContextMenu(newMenu);
    } catch {}
  }, 2000);

  tray.on('double-click', () => showWindow());

  return tray;
}

function dot(status: string | undefined): string {
  switch (status) {
    case 'running': return '🟢';
    case 'starting': return '🟡';
    case 'stopping': return '🟡';
    case 'error': return '🔴';
    default: return '⚫';
  }
}

function label(status: string | undefined): string {
  switch (status) {
    case 'running': return 'Running';
    case 'starting': return 'Starting...';
    case 'stopping': return 'Stopping...';
    case 'error': return 'Error';
    default: return 'Stopped';
  }
}

function createTrayIcon(): Electron.NativeImage {
  const s = 16;
  const buffer = Buffer.alloc(s * s * 4);

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      const cx = 7.5;
      const cy = 7.5;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= 7) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        if (dx + dy <= 8) {
          const t = x / s;
          buffer[i] = Math.round(100 + t * 155);
          buffer[i + 1] = Math.round(50 + t * 205);
          buffer[i + 2] = 255;
          buffer[i + 3] = 255;
        }
      }
    }
  }
  return nativeImage.createFromBuffer(buffer, { width: s, height: s });
}
