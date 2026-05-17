import { useState } from 'react';
import { ModelGrid } from '../components/models/ModelGrid';
import { NeonInput } from '../components/ui/NeonInput';

const services = [
  { label: 'All', value: undefined },
  { label: 'OnlyFans', value: 'onlyfans' },
  { label: 'Fansly', value: 'fansly' },
  { label: 'Patreon', value: 'patreon' },
];

export function BrowsePage() {
  const [service, setService] = useState<string | undefined>();
  const [content, setContent] = useState('all');
  const [sort, setSort] = useState('updated');
  const [q, setQ] = useState('');

  return (
    <div className="animate-slide-up">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="neon-text-cyan">▣</span> Browse Models
          </h1>
          <p className="text-sm text-white/30 font-mono">Discover content creators</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {services.map((s) => (
            <button
              key={s.label}
              onClick={() => setService(s.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                service === s.value
                  ? 'bg-glass-active text-white neon-text-cyan'
                  : 'text-white/40 hover:text-white hover:bg-glass-bg'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] mb-6">
        <NeonInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrar modelos..."
          icon={<span>⌕</span>}
        />
        <select
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="bg-glass-bg border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
        >
          <option value="all">Todos</option>
          <option value="WITH_POSTS">Com posts</option>
          <option value="IMAGE">Com fotos</option>
          <option value="VIDEO">Com vídeos</option>
          <option value="GIF">Com GIFs</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-glass-bg border border-white/10 rounded-xl px-4 py-2 text-sm text-white"
        >
          <option value="updated">Recentes</option>
          <option value="posts">Mais posts</option>
          <option value="media">Mais mídia</option>
          <option value="name">Nome</option>
        </select>
      </div>
      <ModelGrid service={service} content={content} sort={sort} q={q} />
    </div>
  );
}
