export const Routes = {
  LOGIN: '/login',
  SIGNUP: '/signup',

  DASHBOARD: '/dashboard',
  REVIEW: '/review',
  PRACTICE: '/practice',

  TESTS: '/tests',
  TEST_NEW: '/tests/new',
  TEST_GENERATE_PREVIEW: '/tests/generate/preview',
  TEST_EDIT: (id: string) => `/tests/${id}/edit`,
  TEST_DETAIL: (id: string) => `/tests/${id}`,

  NOTES: '/notes',
  NOTE_NEW: '/notes/new',
  NOTE_DETAIL: (id: string) => `/notes/${id}`,

  HISTORY: '/history',
  RESULT_DETAIL: (id: string) => `/history/${id}`,
  STATS: '/stats',

  SETTINGS: '/settings',

  SANDBOX: '/sandbox',
} as const;
