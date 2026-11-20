// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';

import { PageHeader } from './PageHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/features/assist/components/AssistToggle', () => ({ AssistToggle: () => null }));

const TITLE = 'Biology notes';

// Same shape as the current crumb of `FileBreadcrumb`: a rename button inside the page h1.
function HeadingLead({ onRename }: { onRename: () => void }) {
  return (
    <h1>
      <button type="button" title="rename" onClick={onRename}>
        <span>{TITLE}</span>
      </button>
    </h1>
  );
}

beforeEach(() => {
  useBreadcrumbStore.setState({ title: TITLE, crumbs: [], lead: undefined, leadHasHeading: false });
});

afterEach(cleanup);

describe('PageHeader heading', () => {
  it('renders the title as the only h1 when there is no lead', () => {
    render(<PageHeader />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(TITLE);
    expect(headings[0].className).not.toContain('sr-only');
  });

  it('renders one hidden h1 when a lead replaces the title', () => {
    useBreadcrumbStore.setState({ lead: <nav>path</nav>, leadHasHeading: false });
    render(<PageHeader />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0].className).toContain('sr-only');
    expect(headings[0].textContent).toBe(TITLE);
  });

  it('adds no extra h1 when the lead is the heading, and its name is the page title', () => {
    useBreadcrumbStore.setState({ lead: <HeadingLead onRename={() => undefined} />, leadHasHeading: true });
    render(<PageHeader />);

    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBe(headings[0]);
  });

  it('keeps the heading name when the rename button inside it is used', () => {
    const onRename = vi.fn();
    useBreadcrumbStore.setState({ lead: <HeadingLead onRename={onRename} />, leadHasHeading: true });
    render(<PageHeader />);

    fireEvent.click(screen.getByRole('button'));

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: TITLE })).toBeTruthy();
  });
});
