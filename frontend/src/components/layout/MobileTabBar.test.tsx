// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileTabBar } from './MobileTabBar';

const navigation = vi.hoisted(() => ({ pathname: '/dashboard' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('./MobileMoreSheet', () => ({ MobileMoreSheet: () => null }));

beforeEach(() => {
  navigation.pathname = '/dashboard';
});

afterEach(cleanup);

describe('MobileTabBar', () => {
  it('has the four destinations and the More button', () => {
    render(<MobileTabBar />);

    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual([
      '/dashboard',
      '/review',
      '/files',
      '/courses',
    ]);
    expect(screen.getByRole('button', { name: 'mobile_nav.more' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('marks only the current destination', () => {
    navigation.pathname = '/courses/intro-01ABC';
    render(<MobileTabBar />);

    const current = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.getAttribute('href'))).toEqual(['/courses']);
  });

  it.each(['/tests/abc', '/courses/intro-01ABC/tests/item1'])('is hidden on the exam page %s', path => {
    navigation.pathname = path;
    render(<MobileTabBar />);

    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
