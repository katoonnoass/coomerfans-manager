import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { NeonInput } from '../ui/NeonInput';
import { Link } from 'react-router-dom';

interface SearchSuggestion {
  id: string;
  name: string;
  slug: string;
  service: string;
  thumbnailUrl: string | null;
  postCount: number;
}

export function DebouncedSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
      if (query.trim()) setIsOpen(true);
    }, 250);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['search-suggestions', debouncedQuery],
    queryFn: async () => {
      const { data } = await api.get('/search', { params: { q: debouncedQuery, pageSize: 5 } });
      return data.models as SearchSuggestion[];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 10000,
  });

  const handleSubmit = () => {
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <NeonInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search models..."
        icon={<span>⌕</span>}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') { setIsOpen(false); (e.target as HTMLInputElement).blur(); }
        }}
        onFocus={() => { if (debouncedQuery) setIsOpen(true); }}
      />

      {isOpen && debouncedQuery.length >= 2 && (
        <div className="absolute top-full mt-2 w-full glass border border-white/5 rounded-xl overflow-hidden z-50 shadow-2xl">
          {isLoading && (
            <div className="p-4 text-center">
              <span className="text-sm text-white/30 font-mono">Searching...</span>
            </div>
          )}

          {data?.length === 0 && !isLoading && (
            <div className="p-4 text-center">
              <span className="text-sm text-white/40">No results</span>
            </div>
          )}

          {data?.map((model) => (
            <Link
              key={model.id}
              to={`/model/${model.slug}`}
              onClick={() => { setIsOpen(false); setQuery(''); }}
              className="flex items-center gap-3 px-4 py-3 hover:bg-glass-hover transition-colors"
            >
              {model.thumbnailUrl ? (
                <img src={model.thumbnailUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-glass-bg flex items-center justify-center">
                  <span className="text-white/20 text-xs">◈</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{model.name}</p>
                <p className="text-xs text-white/30 font-mono">
                  {model.service} · {model.postCount} posts
                </p>
              </div>
            </Link>
          ))}

          {data && data.length > 0 && (
            <button
              onClick={handleSubmit}
              className="w-full px-4 py-2 text-xs text-neon-cyan hover:bg-glass-hover transition-colors font-mono border-t border-white/5"
            >
              View all results →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
