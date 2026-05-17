import { FavoritesGrid } from '../components/favorites/FavoritesGrid';
import { ExportCSV } from '../components/favorites/ExportCSV';
import { ImportCoomerFavorites } from '../components/favorites/ImportCoomerFavorites';

export function FavoritesPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">
          <span className="neon-text-pink">♥</span> Favorites
        </h1>
        <div className="flex items-center gap-2">
          <ImportCoomerFavorites />
          <ExportCSV />
        </div>
      </div>
      <FavoritesGrid />
    </>
  );
}
