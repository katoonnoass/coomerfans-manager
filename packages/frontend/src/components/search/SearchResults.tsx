import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { NeonInput } from '../ui/NeonInput';
import { GlassCard } from '../ui/GlassCard';
import { Badge } from '../ui/Badge';
import { Link } from 'react-router-dom';
import { queryKeys } from '../../lib/query-keys';

export function SearchResults() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const service = searchParams.get('service') || undefined;
  const [content, setContent] = useState('all');
  const [sort, setSort] = useState('posts');
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState(query);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.search.query(query, { service, content, sort }),
    queryFn: async () => {
      const { data } = await api.get('/search', { params: { q: query, service, content, sort } });
      return data;
    },
    enabled: !!query,
  });

  return (
    <div className="max-w-4xl mx-auto animate-slide-up">
      <div className="mb-8">
        <NeonInput
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search models..."
          icon={<span>⌕</span>}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValue.trim()) {
              navigate(`/search?q=${encodeURIComponent(inputValue.trim())}`);
            }
          }}
          className="text-lg"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {[
          ['all', 'Todos'],
          ['WITH_POSTS', 'Com posts'],
          ['IMAGE', 'Fotos'],
          ['VIDEO', 'Vídeos'],
          ['GIF', 'GIFs'],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setContent(value)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              content === value
                ? 'bg-glass-active text-white neon-text-cyan'
                : 'text-white/40 hover:text-white hover:bg-glass-bg'
            }`}
          >
            {label}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="ml-auto bg-glass-bg border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
        >
          <option value="posts">Mais posts</option>
          <option value="media">Mais mídia</option>
          <option value="name">Nome</option>
        </select>
      </div>

      {query && (
        <div className="mb-4">
          <p className="text-white/40 font-mono text-sm">
            {data?.total ?? 0} results for <span className="text-neon-cyan">"{query}"</span>
          </p>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass-card p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-glass-bg" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-glass-bg rounded w-1/3" />
                  <div className="h-3 bg-glass-bg rounded w-1/5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.models?.length === 0 && query && !isLoading && (
        <div className="text-center py-20">
          <span className="text-6xl block mb-4 opacity-20">⌕</span>
          <p className="text-white/40">No results found for "{query}"</p>
        </div>
      )}

      <div className="space-y-2">
        {data?.models?.map((model: any) => (
          <Link key={model.id} to={`/model/${model.slug}`}>
            <GlassCard className="p-4 flex items-center gap-4">
              {model.thumbnailUrl ? (
                <img
                  src={model.thumbnailUrl}
                  alt={model.name}
                  className="w-14 h-14 rounded-xl object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-glass-bg flex items-center justify-center">
                  <span className="text-xl text-white/20">◈</span>
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold">{model.name}</h3>
                <div className="flex items-center gap-2 text-xs text-white/40 font-mono mt-1">
                  <Badge variant="cyan">{model.service}</Badge>
                  <span>{model.postCount} posts</span>
                </div>
              </div>
              <span className="text-white/20 font-mono text-sm">#{model.rank}</span>
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
