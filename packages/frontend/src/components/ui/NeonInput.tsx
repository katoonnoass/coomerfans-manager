import { cn } from '../../lib/utils';

interface NeonInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
}

export function NeonInput({ icon, className, ...props }: NeonInputProps) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
          {icon}
        </div>
      )}
      <input
        className={cn('glass-input w-full', icon && 'pl-10', className)}
        {...props}
      />
    </div>
  );
}
