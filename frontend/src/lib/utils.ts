import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getErrorDetail(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'detail' in error && typeof error.detail === 'string') {
    return (error as { detail: string }).detail;
  }
  return fallback;
}

/** The HTTP status of an SDK error (`apiClient` adds it in the error interceptor). `undefined` for other errors. */
export function errorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return undefined;
}

/** A query `retry` that stops at once on 403 / 404: the answer will not change, so the error screen shows at once. */
export function retryUnlessDenied(failureCount: number, error: Error): boolean {
  const status = errorStatus(error);
  return status !== 403 && status !== 404 && failureCount < 3;
}
