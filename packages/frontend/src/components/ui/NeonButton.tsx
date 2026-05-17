import { cn } from '../../lib/utils';

interface NeonButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'icon';
  children: React.ReactNode;
}

export function NeonButton({ variant = 'primary', children, className, ...props }: NeonButtonProps) {
  return (
    <button
      className={cn(
        'neon-btn',
        variant === 'primary' && 'neon-btn-primary',
        variant === 'ghost' && 'bg-transparent hover:bg-glass-hover',
        variant === 'icon' && 'p-2 bg-transparent hover:bg-glass-hover rounded-full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
