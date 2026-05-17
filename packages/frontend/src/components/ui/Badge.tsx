import { cn } from '../../lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'cyan' | 'pink' | 'orange' | 'purple' | 'green';
  className?: string;
}

const variants = {
  cyan: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  pink: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  orange: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
};

export function Badge({ children, variant = 'cyan', className }: BadgeProps) {
  return (
    <span className={cn(
      'px-2 py-0.5 rounded-full text-xs font-medium border',
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
