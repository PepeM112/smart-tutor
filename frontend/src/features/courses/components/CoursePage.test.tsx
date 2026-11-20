// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpaceDetail } from '@/client';
import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';

import { CoursePage } from './CoursePage';

import type { ReactNode } from 'react';

const state = vi.hoisted(() => ({ isDesktop: false, course: null as SpaceDetail | null }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useBreakpoint', () => ({ useBreakpoint: () => ({ isDesktop: state.isDesktop }) }));
vi.mock('@/hooks/useBreadcrumb', () => ({ useBreadcrumb: vi.fn() }));
vi.mock('@/hooks/useUrlTab', () => ({ useUrlTab: () => ['content', vi.fn()] }));
vi.mock('../hooks/useCourse', () => ({ useCourse: () => ({ data: state.course, isLoading: false, error: null }) }));
vi.mock('../hooks/useCourseActions', () => ({
  courseWriteKey: (id: string) => ['course-write', id],
  useCourseActions: () => ({ enterEditMode: { isPending: false, mutate: vi.fn() } }),
}));
vi.mock('@/components/shared/OutlineColumn', () => ({
  OutlineColumn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('./CourseOutlineNav', () => ({ CourseOutlineNav: () => null }));
vi.mock('./CourseDraftEditor', () => ({ CourseDraftEditor: () => null }));
vi.mock('./CourseItemView', () => ({ CourseItemView: () => null }));
vi.mock('./CourseMembers', () => ({ CourseMembers: () => null }));
vi.mock('./PublishDialog', () => ({ PublishDialog: () => null }));
vi.mock('@/features/classrooms/components/AiKeyNotice', () => ({ AiKeyNotice: () => null }));
vi.mock('@/features/files/components/NotePreviewPanel', () => ({ NotePreviewPanel: () => null }));

// A published course that the owner reads: the outline view, with Edit course as an author action.
const OWNER_COURSE = {
  id: 'c1',
  kind: 'COURSE',
  status: 'ACTIVE',
  title: 'Biology',
  description: null,
  tags: [],
  visibility: 'PRIVATE',
  myRole: 'OWNER',
  myStatus: null,
  isOwner: true,
  canEdit: true,
  isEditing: false,
  draftSections: null,
  publishedAt: '2026-01-01T00:00:00Z',
  parentId: null,
  progress: null,
  sections: [{ id: 's1', title: 'One', items: [] }],
};

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CoursePage courseId="c1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  state.course = OWNER_COURSE as unknown as SpaceDetail;
  useBreadcrumbStore.setState({ actions: undefined });
});

afterEach(cleanup);

describe('CoursePage actions', () => {
  it('on a phone puts the actions in the page content and leaves the header without any', () => {
    state.isDesktop = false;
    renderPage();

    expect(screen.getByRole('button', { name: 'courses.edit_course' })).toBeTruthy();
    expect(useBreadcrumbStore.getState().actions).toBeUndefined();
  });

  it('on desktop registers the actions for the header and hides the ones in the page content with CSS', () => {
    state.isDesktop = true;
    renderPage();

    // The content toolbar is always rendered (no hydration pop-in on a phone); `lg:hidden` hides it from desktop width.
    const contentButton = screen.getByRole('button', { name: 'courses.edit_course', hidden: true });
    expect(contentButton.closest('.lg\\:hidden')).not.toBeNull();
    expect(useBreadcrumbStore.getState().actions).toBeTruthy();
  });
});
