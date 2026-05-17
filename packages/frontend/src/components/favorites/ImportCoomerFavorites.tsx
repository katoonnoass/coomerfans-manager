import { useState } from 'react';
import { useFavorites } from '../../hooks/useAuth';
import { NeonButton } from '../ui/NeonButton';
import { GlassCard } from '../ui/GlassCard';

export function ImportCoomerFavorites() {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const { importCoomerFavorites, isImportingCoomerFavorites } = useFavorites();

  const handleImport = async () => {
    setError('');
    setResult(null);

    try {
      const parsed = JSON.parse(raw);
      const creators = Array.isArray(parsed) ? parsed : parsed.creators;
      if (!Array.isArray(creators)) {
        setError('JSON inválido: esperado { "creators": [...] }.');
        return;
      }

      const data = await importCoomerFavorites({ creators });
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Falha ao importar favoritos.');
    }
  };

  return (
    <div>
      <NeonButton variant="ghost" onClick={() => setOpen((value) => !value)} className="text-xs">
        ⇪ Importar coomer.st
      </NeonButton>

      {open && (
        <GlassCard className="mt-4 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">Importar favoritos do coomer.st</h2>
              <p className="text-xs text-white/35 font-mono">Cole o JSON exportado com a chave creators.</p>
            </div>
            <NeonButton variant="ghost" onClick={() => setRaw('')} className="text-xs">
              Limpar
            </NeonButton>
          </div>

          <textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            className="glass-input w-full min-h-44 p-3 font-mono text-xs resize-y"
            placeholder='{"posts":[],"creators":[...]}'
          />

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <NeonButton onClick={handleImport} disabled={!raw.trim() || isImportingCoomerFavorites}>
              {isImportingCoomerFavorites ? 'Importando...' : 'Importar favoritos'}
            </NeonButton>
            {error && <span className="text-sm text-red-300">{error}</span>}
            {result && (
              <span className="text-sm text-neon-cyan font-mono">
                {result.favorited} novos favoritos, {result.updated} atualizados, {result.totalFavorites} total.
              </span>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
