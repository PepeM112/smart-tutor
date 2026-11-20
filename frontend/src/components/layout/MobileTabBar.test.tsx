// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAssistHiddenStore } from '@/features/assist/store/useAssistHiddenStore';
import { useAssistPanelStore } from '@/features/assist/store/useAssistPanelStore';

import { MobileTabBar } from './MobileTabBar';

const navigation = vi.hoisted(() => ({ pathname: '/dashboard' }));
const aiAvailable = vi.hoisted(() => ({ value: true }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/useAiAvailable', () => ({ useAiAvailable: () => aiAvailable.value }));
vi.mock('./MobileMoreSheet', () => ({ MobileMoreSheet: () => null }));

// Radix opens the menu on a left-button pointer down, which jsdom does not send with a click.
const openSpacesMenu = (): void => {
  const trigger = screen.getByRole('button', { name: 'sidebar.spaces' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
};

beforeEach(() => {
  navigation.pathname = '/dashboard';
  aiAvailable.value = true;
  useAssistPanelStore.setState({ isOpen: false, widths: {} });
  useAssistHiddenStore.setState({ hiders: 0 });
});

afterEach(cleanup);

describe('MobileTabBar', () => {
  it('has Dashboard, Files, AI, Spaces and More, in this order', () => {
    render(<MobileTabBar />);

    expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/dashboard', '/files']);
    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'mobile_nav.ai',
      'sidebar.spaces',
      'mobile_nav.more',
    ]);
    expect(screen.getByRole('button', { name: 'mobile_nav.more' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('marks only the current link tab, with one background on the whole tab', () => {
    navigation.pathname = '/files/folder';
    render(<MobileTabBar />);

    const current = screen.getAllByRole('link').filter(link => link.getAttribute('aria-current') === 'page');
    expect(current.map(link => link.getAttribute('href'))).toEqual(['/files']);
    expect(current[0].className).toContain('bg-muted');
    expect(current[0].textContent).toBe('sidebar.files');
  });

  it.each(['/courses', '/courses/intro-01ABC', '/classrooms/biology-c1'])('highlights Spaces on %s', path => {
    navigation.pathname = path;
    render(<MobileTabBar />);

    expect(screen.getByRole('button', { name: 'sidebar.spaces' }).className).toContain('bg-muted');
    expect(screen.getByRole('button', { name: 'mobile_nav.more' }).className).not.toContain('bg-muted');
  });

  it('does not highlight More on Settings', () => {
    navigation.pathname = '/settings';
    render(<MobileTabBar />);

    expect(screen.getByRole('button', { name: 'mobile_nav.more' }).className).not.toContain('bg-muted');
  });

  it('highlights More on a page of its list, such as Review', () => {
    navigation.pathname = '/review';
    render(<MobileTabBar />);

    expect(screen.getByRole('button', { name: 'mobile_nav.more' }).className).toContain('bg-muted');
  });

  it('opens a Spaces menu with Courses and Classrooms', () => {
    render(<MobileTabBar />);

    openSpacesMenu();

    expect(screen.getAllByRole('menuitem').map(item => item.getAttribute('href'))).toEqual(['/courses', '/classrooms']);
  });

  it('toggles the Ask AI sheet from the AI tab', () => {
    render(<MobileTabBar />);
    const tab = screen.getByRole('button', { name: 'mobile_nav.ai' });
    expect(tab.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(tab);

    expect(useAssistPanelStore.getState().isOpen).toBe(true);
    expect(tab.getAttribute('aria-pressed')).toBe('true');
  });

  it('has no AI tab without an AI key', () => {
    aiAvailable.value = false;
    render(<MobileTabBar />);

    expect(screen.queryByRole('button', { name: 'mobile_nav.ai' })).toBeNull();
  });

  it('has no AI tab while a page hides the Assistant', () => {
    useAssistHiddenStore.setState({ hiders: 1 });
    render(<MobileTabBar />);

    expect(screen.queryByRole('button', { name: 'mobile_nav.ai' })).toBeNull();
  });

  it.each(['/tests/abc', '/courses/intro-01ABC/tests/item1'])('is hidden on the exam page %s', path => {
    navigation.pathname = path;
    render(<MobileTabBar />);

    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
