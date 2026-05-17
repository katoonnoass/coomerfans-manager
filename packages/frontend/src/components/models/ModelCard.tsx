import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Badge } from '../ui/Badge';
import { useParallax3D } from '../../hooks/useParallax';
import type { ModelProfile } from '@coomerfans/shared';
import { cn, truncate, formatNumber } from '../../lib/utils';

interface ModelCardProps {
  model: ModelProfile;
  className?: string;
}

const serviceColors: Record<string, 'pink' | 'cyan' | 'purple' | 'orange'> = {
  onlyfans: 'cyan',
  fansly: 'pink',
  patreon: 'orange',
  other: 'purple',
};

function fallbackThumb(model: ModelProfile) {
  return `/api/models/${model.slug}/thumbnail`;
}

export function ModelCard({ model, className }: ModelCardProps) {
  const { containerRef, onMouseMove, onMouseLeave } = useParallax3D();

  return (
    <Link to={`/model/${model.slug}`} className={cn('block', className)}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          ref={containerRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="glass-card overflow-hidden"
          style={{ transition: 'transform 0.1s ease-out' }}
        >
          <div className="aspect-[3/4] relative overflow-hidden">
            <img
              src={fallbackThumb(model)}
              alt={model.name}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              onError={(event) => {
                const img = event.currentTarget;
                const fallback = fallbackThumb(model);
                if (img.src.endsWith(fallback)) return;
                img.src = fallback;
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void-900/90 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <Badge variant={serviceColors[model.service] || 'purple'}>
                {model.service}
              </Badge>
            </div>
          </div>

          <div className="p-4">
            <h3 className="font-semibold text-white mb-1">
              {truncate(model.name, 24)}
            </h3>
            <div className="flex items-center gap-3 text-xs text-white/40 font-mono">
              <span>{formatNumber(model.postCount)} posts</span>
              <span>{formatNumber(model.mediaCount)} media</span>
              {model.isVerified && <span className="text-neon-cyan">✓ verified</span>}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
