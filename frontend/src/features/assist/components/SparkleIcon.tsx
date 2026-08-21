import { cn } from '@/lib/utils';

type SparkleIconProps = {
  className?: string;
};

export function SparkleIcon({ className }: SparkleIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn('size-6', className)} aria-hidden="true">
      <path
        d="M12 2L13.09 8.26L18 5L14.74 10.91L21 12L14.74 13.09L18 19L13.09 15.74L12 22L10.91 15.74L6 19L9.26 13.09L3 12L9.26 10.91L6 5L10.91 8.26L12 2Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
