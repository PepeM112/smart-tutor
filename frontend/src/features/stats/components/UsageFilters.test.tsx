// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UsageFilters } from './UsageFilters';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/shared/filters/FilterPopover', () => ({ FilterPopover: () => null }));

afterEach(cleanup);

describe('UsageFilters', () => {
  it('offers the Model group-by and reports the choice', () => {
    const onGroupByChange = vi.fn();
    render(
      <UsageFilters
        groupBy="provider"
        onGroupByChange={onGroupByChange}
        filters={{}}
        onFilterChange={vi.fn()}
        onClear={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: 'stats.group_model' }));

    expect(onGroupByChange).toHaveBeenCalledWith('model');
  });
});
