import { FilterType, type FilterItem } from '@/lib/filters';

export type DemoKind = 'Test' | 'Note' | 'Course';

export type DemoItem = {
  id: string;
  title: string;
  kind: DemoKind;
  owner: string;
  updated: string;
  questions: number;
  description: string;
};

/** Fixed rows for every table and list in the gallery. The dates are text, so the page renders the same each time. */
export const DEMO_ITEMS: DemoItem[] = [
  {
    id: 'demo-1',
    title: 'Spanish irregular verbs',
    kind: 'Test',
    owner: 'Ana Ruiz',
    updated: '12 Nov 2026',
    questions: 24,
    description: 'Present and preterite forms of the most common irregular verbs.',
  },
  {
    id: 'demo-2',
    title: 'Cell biology outline',
    kind: 'Note',
    owner: 'Ana Ruiz',
    updated: '9 Nov 2026',
    questions: 0,
    description: 'Organelles, membranes and the main transport mechanisms.',
  },
  {
    id: 'demo-3',
    title: 'World capitals',
    kind: 'Test',
    owner: 'Leo Marsh',
    updated: '2 Nov 2026',
    questions: 60,
    description: 'Capitals of 60 countries, with flags.',
  },
  {
    id: 'demo-4',
    title: 'Introduction to statistics',
    kind: 'Course',
    owner: 'Leo Marsh',
    updated: '28 Oct 2026',
    questions: 15,
    description: 'Descriptive statistics, probability and the first steps in inference.',
  },
  {
    id: 'demo-5',
    title: 'Anatomy: upper limb',
    kind: 'Note',
    owner: 'Ana Ruiz',
    updated: '20 Oct 2026',
    questions: 0,
    description: 'Bones, muscles and nerves of the shoulder, arm and hand.',
  },
];

export const DEMO_TOTAL_ROWS = 47;
export const DEMO_PER_PAGE = 10;

// The filter components translate every label, so these are existing i18n keys, not plain text.
export const DEMO_FILTER_CONFIG: FilterItem[] = [
  { label: 'tests.filter_search', key: 'search', type: FilterType.SINGLE },
  {
    label: 'tests.filter_type',
    key: 'kind',
    type: FilterType.SELECT,
    options: {
      items: [
        { label: 'questions.filter_test', value: 'Test' },
        { label: 'notes.note', value: 'Note' },
        { label: 'sidebar.courses', value: 'Course' },
      ],
    },
  },
  { label: 'courses.role_owner', key: 'owner', type: FilterType.SINGLE },
];

export const DEMO_SORT_OPTIONS = [
  { value: 'updated', label: 'Last updated' },
  { value: 'title', label: 'Title' },
  { value: 'questions', label: 'Questions' },
] as const;

export const DEMO_LONG_TEXT =
  'Spaced repetition shows a question again just before you would forget it. Each correct answer pushes the next review further away, and each mistake brings it back sooner.';
