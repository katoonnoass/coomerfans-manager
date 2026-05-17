import { useFavorites } from '../../hooks/useAuth';
import { NeonButton } from '../ui/NeonButton';

export function ExportCSV() {
  const { favorites } = useFavorites();

  const handleExport = () => {
    const headers = ['Name', 'Service', 'Posts', 'Media', 'Verified', 'Slug'];
    const rows = favorites.map((m: any) => [
      m.name,
      m.service,
      m.postCount,
      m.mediaCount,
      m.isVerified ? 'Yes' : 'No',
      m.slug,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coomerfans-favorites-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (favorites.length === 0) return null;

  return (
    <NeonButton variant="ghost" onClick={handleExport} className="text-xs">
      ⤓ Export CSV ({favorites.length})
    </NeonButton>
  );
}
