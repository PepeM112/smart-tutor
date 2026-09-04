import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorDetail(error: unknown, fallback: string): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'detail' in error &&
    typeof (error).detail === 'string'
  ) {
    return (error as { detail: string }).detail;
  }
  return fallback;
}
