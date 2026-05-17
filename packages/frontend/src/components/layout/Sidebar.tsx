import { NavLink } from 'react-router-dom';
import { useUIStore } from '../../stores/ui.store';
import { cn } from '../../lib/utils';

const navItems = [
  { to: '/', label: 'Home', icon: '◈' },
  { to: '/dashboard', label: 'Dashboard', icon: '◆' },
  { to: '/browse', label: 'Browse', icon: '▣' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/downloads', label: 'Downloads', icon: '⇣' },
  { to: '/favorites', label: 'Favorites', icon: '♥' },
  { to: '/diagnostics', label: 'Diagnostics', icon: '◎' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const { sidebarOpen } = useUIStore();

  if (!sidebarOpen) return null;

  return (
    <aside className="glass-sidebar w-60 h-screen fixed left-0 top-0 z-40 flex flex-col py-6 animate-slide-up">
      <div className="px-6 mb-8">
        <h1 className="text-xl font-bold">
          <span className="neon-text-pink">Coomer</span>
          <span className="neon-text-cyan">Fans</span>
        </h1>
        <p className="text-xs text-white/20 font-mono mt-1">Premium Content Hub</p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-glass-active text-white neon-text-cyan'
                  : 'text-white/50 hover:text-white hover:bg-glass-bg'
              )
            }
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto" />
    </aside>
  );
}
