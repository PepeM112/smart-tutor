'use client';

import { Archive, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { BulkBar } from '@/components/shared/BulkBar';
import { ListToolbar } from '@/components/shared/ListToolbar';
import { SearchInput } from '@/components/shared/SearchInput';
import { SortMenu } from '@/components/shared/SortMenu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { type FilterValue } from '@/lib/filters';

import { DEMO_FILTER_CONFIG, DEMO_ITEMS, DEMO_SORT_OPTIONS } from '../demoData';

import { SandboxDemo, SandboxSection } from './SandboxSection';

type SortValue = (typeof DEMO_SORT_OPTIONS)[number]['value'];

const withoutKey = (filters: FilterValue, key: string): FilterValue =>
  Object.fromEntries(Object.entries(filters).filter(([entryKey]) => entryKey !== key));

export function ListControlsSection() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterValue>({});
  const [sort, setSort] = useState<SortValue>('updated');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<string[]>(['demo-1', 'demo-2']);

  const handleFilterChange = (key: string, value: FilterValue[string] | undefined): void =>
    setFilters(current => (value === undefined ? withoutKey(current, key) : { ...current, [key]: value }));

  const toggleSelected = (id: string): void =>
    setSelectedIds(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  return (
    <SandboxSection id="list-controls" title="Search, filters, sort and bulk actions">
      <SandboxDemo label="Search input">
        <SearchInput className="max-w-sm" placeholder="Search tests" value={search} onChange={setSearch} />
      </SandboxDemo>

      <SandboxDemo label="List toolbar">
        <ListToolbar
          searchPlaceholder="Search the library"
          filterConfig={DEMO_FILTER_CONFIG}
          filters={filters}
          onFilterChange={handleFilterChange}
          onClear={() => setFilters({})}
        >
          <SortMenu
            options={[...DEMO_SORT_OPTIONS]}
            value={sort}
            onChange={setSort}
            direction={direction}
            onDirectionChange={setDirection}
          />
        </ListToolbar>
      </SandboxDemo>

      <SandboxDemo label="Bulk bar">
        <ul className="space-y-2">
          {DEMO_ITEMS.slice(0, 3).map(item => (
            <li key={item.id} className="flex items-center gap-2">
              <Checkbox
                id={`sandbox-bulk-${item.id}`}
                checked={selectedIds.includes(item.id)}
                onCheckedChange={() => toggleSelected(item.id)}
              />
              <Label htmlFor={`sandbox-bulk-${item.id}`}>{item.title}</Label>
            </li>
          ))}
        </ul>
        <BulkBar
          count={selectedIds.length}
          countLabel={`${selectedIds.length} selected`}
          onClear={() => setSelectedIds([])}
        >
          <Button variant="outline" icon={Archive}>
            Archive
          </Button>
          <Button variant="destructive" icon={Trash2}>
            Delete
          </Button>
        </BulkBar>
      </SandboxDemo>
    </SandboxSection>
  );
}
