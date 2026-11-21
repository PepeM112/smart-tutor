'use client';

import { useAuthStore } from '@/features/auth/store/authStore';
import { cn } from '@/lib/utils';

type UserAvatarProps = {
  className?: string;
};

/** The first letter of the user's name in a circle. The user has no image, so this is the avatar. */
export function UserAvatar({ className }: UserAvatarProps) {
  const name = useAuthStore(s => s.user?.displayName || s.user?.username);

  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full bg-muted font-serif text-sm text-foreground',
        className
      )}
    >
      {name?.charAt(0).toUpperCase()}
    </span>
  );
}
