export const Routes = {
  LOGIN: '/login',
  SIGNUP: '/signup',

  DASHBOARD: '/dashboard',
  REVIEW: '/review',
  PRACTICE: '/practice',

  TESTS: '/tests',
  TEST_NEW: '/tests/new',
  TEST_EDIT: (id: string) => `/tests/${id}/edit`,
  TEST_DETAIL: (id: string) => `/tests/${id}`,

  HISTORY: '/history',
  STATS: '/stats',

  SETTINGS: '/settings',

  SANDBOX: '/sandbox',
} as const;
