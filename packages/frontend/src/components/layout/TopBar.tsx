import { useUIStore } from '../../stores/ui.store';
import { DebouncedSearch } from '../search/DebouncedSearch';
import { useNavigate } from 'react-router-dom';

export function TopBar() {
  const { toggleSidebar, sidebarOpen } = useUIStore();
  const navigate = useNavigate();

  return (
    <header className="h-16 flex items-center gap-4 px-6 border-b border-white/5 bg-void-900/50 backdrop-blur-xl">
      <button
        onClick={toggleSidebar}
        className="text-white/50 hover:text-white transition-colors p-2"
      >
        {sidebarOpen ? '◁' : '▷'}
      </button>

      <DebouncedSearch />

      <div className="flex items-center gap-3 ml-auto">
        <button
          onClick={() => navigate('/search')}
          className="text-white/30 hover:text-white/60 text-xs font-mono ml-2"
          title="Keyboard shortcut: Ctrl+K"
        >
          Ctrl+K
        </button>
      </div>
    </header>
  );
}
