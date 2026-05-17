import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { ActivityDock } from './ActivityDock';
import { NotificationCenter } from './NotificationCenter';
import { useUIStore } from '../../stores/ui.store';
import { useDownloadSocket } from '../../hooks/useDownloadSocket';

const Background3D = lazy(() => import('./Background3D').then((m) => ({ default: m.Background3D })));

export function AppShell() {
  const { sidebarOpen } = useUIStore();
  useDownloadSocket();

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Background3D />
      </Suspense>
      <Sidebar />
      <div className={sidebarOpen ? 'ml-60' : 'ml-0'}>
        <TopBar />
        <main className="p-6 pb-24">
          <Outlet />
        </main>
      </div>
      <NotificationCenter />
      <ActivityDock />
    </div>
  );
}
