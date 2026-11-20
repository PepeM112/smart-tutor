// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useBreadcrumbStore } from '@/store/useBreadcrumbStore';
import { useOutlineStore } from '@/store/useOutlineStore';

import { MobileHeader } from './MobileHeader';

vi.mock('next/navigation', () => ({ usePathname: () => '/courses/intro-01ABC', useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button">bell</button>,
}));

beforeEach(() => {
  useBreadcrumbStore.setState({ title: 'Biology', crumbs: [], back: undefined, actions: undefined });
  useOutlineStore.setState({ activeKey: null });
});

afterEach(cleanup);

describe('MobileHeader', () => {
  it('has the bell and Profile & Settings on the right, and no Ask AI button', () => {
    render(<MobileHeader />);

    expect(screen.getByRole('button', { name: 'bell' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'sidebar.profile_and_settings' }).getAttribute('href')).toBe('/settings');
    expect(screen.queryByRole('button', { name: 'assist.panel.title' })).toBeNull();
  });

  it('shows Back when the page has a back target', () => {
    useBreadcrumbStore.setState({ back: '/courses' });
    render(<MobileHeader />);

    expect(screen.getByRole('button', { name: 'common.back' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'outline.contents' })).toBeNull();
  });

  it('shows Contents and Back together on a page with an outline', () => {
    useBreadcrumbStore.setState({ back: '/courses' });
    useOutlineStore.setState({ activeKey: 'course' });
    render(<MobileHeader />);

    expect(screen.getByRole('button', { name: 'common.back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'outline.contents' })).toBeTruthy();
  });

  it('lets the action row shrink, so a wide row cannot push the page sideways', () => {
    useBreadcrumbStore.setState({ actions: <button type="button">wide action</button> });
    render(<MobileHeader />);

    const row = screen.getByRole('button', { name: 'wide action' }).parentElement;
    expect(row?.className).toContain('min-w-0');
    expect(row?.className).not.toContain('shrink-0');
    // The row clips and caps each action to its width, so none can paint or measure over the bell.
    expect(row?.className).toContain('overflow-hidden');
    expect(row?.className).toContain('[&>*]:max-w-full');
  });

  it('keeps the title wide at 360px: 36px side buttons, and a title that does not shrink below its basis', () => {
    useBreadcrumbStore.setState({ back: '/courses' });
    useOutlineStore.setState({ activeKey: 'course' });
    render(<MobileHeader />);

    expect(screen.getByRole('button', { name: 'common.back' }).className).toContain('size-9');
    expect(screen.getByRole('button', { name: 'outline.contents' }).className).toContain('size-9');
    expect(screen.getByRole('heading', { level: 1 }).parentElement?.className).toContain('flex-[1_0_7.5rem]');
  });
});
