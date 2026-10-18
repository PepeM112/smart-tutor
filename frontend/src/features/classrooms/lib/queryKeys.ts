import { type ClassroomsListMineData } from '@/client';

export type MyClassroomsParams = NonNullable<ClassroomsListMineData['query']>;

/** Query keys of the classrooms feature. Every key starts with `['classrooms']`. */
export const classroomQueryKeys = {
  /** ['classrooms'] — prefix that covers every classroom list query. */
  all: () => ['classrooms'] as const,
  /** ['classrooms', 'mine', params?] — classrooms the user owns or is an active member of. */
  mine: (params?: MyClassroomsParams) =>
    params ? (['classrooms', 'mine', params] as const) : (['classrooms', 'mine'] as const),
  /** ['classrooms', 'due-soon', id] — the next due items of a classroom (students). */
  dueSoon: (id: string) => ['classrooms', 'due-soon', id] as const,
  /** ['classrooms', 'settings', id] — the feed permission and the class key (owner). */
  settings: (id: string) => ['classrooms', 'settings', id] as const,
  /** ['classrooms', 'gradebook'] — prefix of every gradebook (a grade override does not know the classroom). */
  gradebooks: () => ['classrooms', 'gradebook'] as const,
  /** ['classrooms', 'gradebook', id] — students × tests matrix (teachers). */
  gradebook: (id: string) => ['classrooms', 'gradebook', id] as const,
  /** ['classrooms', 'ai-key-status', id] — which AI key the user would use in the classroom. */
  aiKeyStatus: (id: string) => ['classrooms', 'ai-key-status', id] as const,
  /** ['classrooms', 'token-usage', id] — AI spend per student (owner). */
  tokenUsage: (id: string) => ['classrooms', 'token-usage', id] as const,
} as const;
