/** Query keys of the feed feature. Every key starts with `['feed']`. */
export const feedQueryKeys = {
  /** ['feed', 'posts', classroomId] — the pages of posts of one classroom (comments are embedded). */
  posts: (classroomId: string) => ['feed', 'posts', classroomId] as const,
} as const;
