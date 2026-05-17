import { ChildProcess, exec, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import net from 'net';
import http from 'http';
import { EventEmitter } from 'events';
import { app, shell } from 'electron';

type ServiceName = 'Backend' | 'Worker' | 'Frontend' | 'PostgreSQL' | 'Redis';
type ServiceStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface ProcessInfo {
  name: ServiceName;
  process: ChildProcess | null;
  command: string;
  cwd: string;
  status: ServiceStatus;
}

export declare interface ServerManager {
  on(event: 'log', listener: (source: string, line: string) => void): this;
  on(event: 'status-change', listener: (name: string, status: string) => void): this;
}

const ports: Record<ServiceName, number | null> = {
  Backend: 3001,
  Worker: null,
  Frontend: 5173,
  PostgreSQL: 5432,
  Redis: 6379,
};

export class ServerManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private statuses: Record<ServiceName, ServiceStatus> = {
    Backend: 'stopped',
    Worker: 'stopped',
    Frontend: 'stopped',
    PostgreSQL: 'stopped',
    Redis: 'stopped',
  };
  private projectRoot: string;
  private logBuffer: Array<{ time: string; source: string; line: string }> = [];
  private maxLogLines = 3000;
  private statusTimer?: NodeJS.Timeout;

  constructor() {
    super();
    this.projectRoot = this.findProjectRoot();
    this.addLog('agent', `Root: ${this.projectRoot}`);
    this.refreshStatuses();
    this.statusTimer = setInterval(() => this.refreshStatuses(), 3000);
  }

  private findProjectRoot(): string {
    const candidates = [
      process.env.COOMERFANS_ROOT,
      process.env.PORTABLE_EXECUTABLE_DIR,
      process.env.PORTABLE_EXECUTABLE_FILE ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE) : undefined,
      process.cwd(),
      path.dirname(app.getPath('exe')),
      path.resolve(__dirname, '..', '..', '..'),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      let searchDir = path.resolve(candidate);
      for (let i = 0; i < 5; i++) {
        if (fs.existsSync(path.join(searchDir, 'pnpm-workspace.yaml'))) return searchDir;
        const parent = path.dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
      }
    }

    return process.cwd();
  }

  getProjectRoot(): string { return this.projectRoot; }

  getLogs() { return [...this.logBuffer]; }

  getStatuses(): Record<string, string> { return { ...this.statuses }; }

  addLog(source: string, line: string) {
    const entry = { time: new Date().toISOString(), source, line };
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogLines) this.logBuffer = this.logBuffer.slice(-this.maxLogLines);
    this.emit('log', source, line);
  }

  openApp(): void {
    shell.openExternal('http://localhost:5173');
  }

  async refreshStatuses(): Promise<void> {
    const backendOk = await this.httpOk('http://localhost:3001/api/health');
    const frontendOk = await this.httpOk('http://localhost:5173');
    const postgresOk = await this.portOpen(5432);
    const redisOk = await this.portOpen(6379);

    this.setStatus('Backend', backendOk ? 'running' : this.processStatus('Backend'));
    this.setStatus('Frontend', frontendOk ? 'running' : this.processStatus('Frontend'));
    this.setStatus('Worker', this.processStatus('Worker'));
    this.setStatus('PostgreSQL', postgresOk ? 'running' : 'stopped');
    this.setStatus('Redis', redisOk ? 'running' : 'stopped');
  }

  async startAll(): Promise<void> {
    await this.refreshStatuses();

    const backendDir = path.join(this.projectRoot, 'packages', 'backend');
    const workerDir = path.join(this.projectRoot, 'packages', 'worker');
    const frontendDir = path.join(this.projectRoot, 'packages', 'frontend');

    this.addLog('agent', `Backend:  ${fs.existsSync(backendDir) ? 'FOUND' : 'MISSING'}`);
    this.addLog('agent', `Worker:   ${fs.existsSync(workerDir) ? 'FOUND' : 'MISSING'}`);
    this.addLog('agent', `Frontend: ${fs.existsSync(frontendDir) ? 'FOUND' : 'MISSING'}`);
    this.addLog('agent', `node_modules: ${fs.existsSync(path.join(this.projectRoot, 'node_modules')) ? 'FOUND' : 'MISSING'}`);

    if (!fs.existsSync(backendDir) || !fs.existsSync(workerDir) || !fs.existsSync(frontendDir)) {
      this.addLog('agent', 'ERROR: Project packages not found. Place exe in coomerfans-saas folder.');
      return;
    }

    if (this.statuses.PostgreSQL !== 'running') {
      this.addLog('agent', 'ERROR: PostgreSQL is offline on port 5432.');
      this.setStatus('Backend', 'error');
      return;
    }

    if (!(await this.ensureProjectReady())) return;

    await this.stopAll();
    await this.wait(1000);

    let redisAvailable = this.statuses.Redis === 'running';
    if (!redisAvailable) {
      this.spawnService('Redis', this.projectRoot, 'set REDISMS_PORT=6379&& pnpm exec redis-memory-server');
      redisAvailable = await this.waitForPort(6379, 12000);
      if (!redisAvailable) {
        this.addLog('agent', 'ERROR: Redis failed to start on port 6379. Worker will not start.');
        this.setStatus('Worker', 'error');
      }
    }

    if (await this.portOpen(3001)) {
      this.addLog('agent', 'ERROR: Port 3001 is already in use.');
      this.setStatus('Backend', 'error');
      return;
    }
    if (await this.portOpen(5173)) {
      this.addLog('agent', 'ERROR: Port 5173 is already in use.');
      this.setStatus('Frontend', 'error');
      return;
    }

    this.spawnService('Backend', backendDir, 'pnpm exec prisma db push --schema src/prisma/schema.prisma --skip-generate && pnpm exec tsx src/prisma/seed.ts && pnpm exec tsx src/index.ts');
    await this.wait(2000);
    if (redisAvailable) {
      this.spawnService('Worker', workerDir, 'pnpm exec tsx src/index.ts');
      await this.wait(1000);
    }
    this.spawnService('Frontend', frontendDir, 'pnpm exec vite --host 0.0.0.0');

    this.addLog('agent', 'All services starting...');
    this.addLog('agent', 'Backend  -> http://localhost:3001');
    this.addLog('agent', 'Frontend -> http://localhost:5173');
  }

  private async ensureProjectReady(): Promise<boolean> {
    this.addLog('agent', 'Checking setup...');

    if (!fs.existsSync(path.join(this.projectRoot, '.env'))) {
      const example = path.join(this.projectRoot, '.env.example');
      if (fs.existsSync(example)) {
        fs.copyFileSync(example, path.join(this.projectRoot, '.env'));
        this.addLog('agent', '.env created from .env.example');
      }
    }

    if (!(await this.commandOk('pnpm --version'))) {
      this.addLog('agent', 'ERROR: pnpm not found. Install with: npm install -g pnpm');
      return false;
    }

    if (!fs.existsSync(path.join(this.projectRoot, 'node_modules'))) {
      this.addLog('agent', 'Installing dependencies...');
      if (!(await this.runSetupCommand('pnpm install', this.projectRoot))) return false;
    }

    this.addLog('agent', 'Setup OK.');
    return true;
  }

  private spawnService(name: ServiceName, cwd: string, command: string): void {
    this.addLog('agent', `[START] ${name}: ${command}`);
    this.setStatus(name, 'starting');

    const child = spawn('cmd.exe', ['/d', '/s', '/c', command], {
      cwd,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    const info: ProcessInfo = { name, process: child, command, cwd, status: 'starting' };
    this.processes.set(name, info);

    child.stdout?.on('data', (chunk) => this.addProcessLog(name, chunk));
    child.stderr?.on('data', (chunk) => this.addProcessLog(name, chunk));

    child.on('spawn', () => {
      const status = name === 'Worker' ? 'running' : 'starting';
      info.status = status;
      this.setStatus(name, status);
    });

    child.on('error', (err) => {
      this.addLog(name.toLowerCase(), `[ERROR] ${err.message}`);
      info.status = 'error';
      this.setStatus(name, 'error');
    });

    child.on('exit', (code) => {
      const current = this.processes.get(name);
      if (current?.process?.pid === child.pid) this.processes.delete(name);
      const status = code === 0 ? 'stopped' : 'error';
      this.addLog(name.toLowerCase(), `[EXIT] code=${code ?? 'null'}`);
      this.setStatus(name, status);
    });
  }

  async stopAll(): Promise<void> {
    this.addLog('agent', 'Stopping all...');
    for (const name of ['Backend', 'Worker', 'Frontend', 'Redis'] as ServiceName[]) {
      const info = this.processes.get(name);
      if (!info?.process?.pid) {
        this.setStatus(name, 'stopped');
        continue;
      }
      this.setStatus(name, 'stopping');
      await this.killTree(info.process.pid);
      this.processes.delete(name);
      this.setStatus(name, 'stopped');
    }
    for (const name of ['Backend', 'Worker', 'Frontend']) {
      exec(`taskkill /FI "WINDOWTITLE eq CoomerFans - ${name}" /T /F`, () => {});
    }
    await this.killProjectProcesses();
    await this.killPort(3001);
    await this.killPort(5173);
    await this.killPort(6379);
    await this.wait(700);
    await this.refreshStatuses();
    this.addLog('agent', 'All stopped.');
  }

  async restartAll(): Promise<void> {
    this.addLog('agent', 'Restarting...');
    await this.stopAll();
    await this.wait(1500);
    await this.startAll();
  }

  dispose(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
  }

  private setStatus(name: ServiceName, status: ServiceStatus): void {
    if (this.statuses[name] === status) return;
    this.statuses[name] = status;
    const info = this.processes.get(name);
    if (info) info.status = status;
    this.emit('status-change', name, status);
  }

  private processStatus(name: ServiceName): ServiceStatus {
    const info = this.processes.get(name);
    if (!info) return 'stopped';
    return info.status;
  }

  private addProcessLog(name: ServiceName, chunk: Buffer): void {
    const source = name.toLowerCase();
    chunk.toString().split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
      .forEach((line) => {
        this.addLog(source, line);
        if (line.includes('P1000') || line.includes('Authentication failed against database server')) {
          this.addLog('agent', 'ERROR: PostgreSQL authentication failed. Update DATABASE_URL in .env with the correct user/password.');
        }
        if (line.includes('P1003') || line.includes('does not exist')) {
          this.addLog('agent', 'ERROR: Database does not exist. Create the database from DATABASE_URL before starting.');
        }
      });
  }

  private portOpen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host: '127.0.0.1', timeout: 800 }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private httpOk(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(url, { timeout: 1200 }, (res) => {
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 600));
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private commandOk(command: string): Promise<boolean> {
    return new Promise((resolve) => {
      exec(command, { cwd: this.projectRoot, windowsHide: true }, (err) => resolve(!err));
    });
  }

  private runSetupCommand(command: string, cwd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd, windowsHide: true });
      child.stdout?.on('data', (chunk) => this.addProcessLog('Backend', chunk));
      child.stderr?.on('data', (chunk) => this.addProcessLog('Backend', chunk));
      child.on('error', (err) => {
        this.addLog('agent', `[ERROR] ${err.message}`);
        resolve(false);
      });
      child.on('exit', (code) => {
        if (code !== 0) this.addLog('agent', `[ERROR] Setup command failed: ${command}`);
        resolve(code === 0);
      });
    });
  }

  private killTree(pid: number): Promise<void> {
    return new Promise((resolve) => {
      exec(`taskkill /PID ${pid} /T /F`, { windowsHide: true }, () => resolve());
    });
  }

  private killProjectProcesses(): Promise<void> {
    const root = this.projectRoot.replace(/'/g, "''");
    const script = [
      `$root='${root}'`,
      '$current=$PID',
      '$targets=Get-CimInstance Win32_Process | Where-Object {',
      '  $_.ProcessId -ne $current -and $_.CommandLine -and $_.CommandLine.Contains($root) -and (',
      '    $_.CommandLine -match "packages\\\\backend" -or',
      '    $_.CommandLine -match "packages\\\\worker" -or',
      '    $_.CommandLine -match "packages\\\\frontend" -or',
      '    $_.CommandLine -match "redis-memory-server"',
      '  )',
      '}',
      '$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join('; ');

    return new Promise((resolve) => {
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`, { windowsHide: true }, () => resolve());
    });
  }

  private killPort(port: number): Promise<void> {
    const script = [
      `$port=${port}`,
      '$connections=Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue',
      '$connections | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -and $_ -ne $PID } | ForEach-Object {',
      '  Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue',
      '}',
    ].join('; ');

    return new Promise((resolve) => {
      exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script.replace(/"/g, '\\"')}"`, { windowsHide: true }, () => resolve());
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitForPort(port: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.portOpen(port)) return true;
      await this.wait(500);
    }
    return false;
  }
}
