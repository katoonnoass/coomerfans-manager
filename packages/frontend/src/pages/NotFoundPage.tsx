import { Link } from 'react-router-dom';
import { GlassCard } from '../components/ui/GlassCard';
import { NeonButton } from '../components/ui/NeonButton';

export function NotFoundPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <GlassCard className="p-12 text-center max-w-md">
        <span className="text-8xl block mb-6 opacity-20">404</span>
        <h1 className="text-xl font-bold mb-2">Page Not Found</h1>
        <p className="text-white/40 text-sm mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link to="/">
          <NeonButton>Go Home</NeonButton>
        </Link>
      </GlassCard>
    </div>
  );
}
