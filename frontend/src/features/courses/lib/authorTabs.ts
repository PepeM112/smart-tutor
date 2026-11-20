export const AUTHOR_TABS = ['content', 'members'] as const;
export type AuthorTab = (typeof AUTHOR_TABS)[number];
