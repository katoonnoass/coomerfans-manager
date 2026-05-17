import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './config/query-client';
import { ToastContainer } from './components/ui/ToastContainer';
import { KeyboardShortcuts } from './components/ui/KeyboardShortcuts';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { AppShell } from './components/layout/AppShell';
import { CardSkeleton } from './components/ui/Shimmer';

const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const BrowsePage = lazy(() => import('./pages/BrowsePage').then(m => ({ default: m.BrowsePage })));
const ModelPage = lazy(() => import('./pages/ModelPage').then(m => ({ default: m.ModelPage })));
const SearchPage = lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const DownloadsPage = lazy(() => import('./pages/DownloadsPage').then(m => ({ default: m.DownloadsPage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage').then(m => ({ default: m.FavoritesPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const DiagnosticsPage = lazy(() => import('./pages/DiagnosticsPage').then(m => ({ default: m.DiagnosticsPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

function PageLoader() {
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <KeyboardShortcuts />
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
              <Route path="/browse" element={<Suspense fallback={<PageLoader />}><BrowsePage /></Suspense>} />
              <Route path="/model/:slug" element={<Suspense fallback={<PageLoader />}><ModelPage /></Suspense>} />
              <Route path="/search" element={<Suspense fallback={<PageLoader />}><SearchPage /></Suspense>} />
              <Route path="/dashboard" element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
              <Route path="/downloads" element={<Suspense fallback={<PageLoader />}><DownloadsPage /></Suspense>} />
              <Route path="/favorites" element={<Suspense fallback={<PageLoader />}><FavoritesPage /></Suspense>} />
              <Route path="/diagnostics" element={<Suspense fallback={<PageLoader />}><DiagnosticsPage /></Suspense>} />
              <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
              <Route path="/login" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
              <Route path="/register" element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
              <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFoundPage /></Suspense>} />
            </Route>
          </Routes>
          <ToastContainer />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
