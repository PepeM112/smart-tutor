'use client';

import { Autocomplete } from '@/components/shared/Autocomplete';
import { type FilterOptions, type Primitive } from '@/lib/filters';

interface AsyncMultiSelectFieldProps {
  source: NonNullable<FilterOptions['asyncItems']>;
  value: Primitive[] | undefined;
  onChange: (value: Primitive[] | undefined) => void;
}

// Filter values come back from the URL as strings, so the chips show `String(value)`.
export function AsyncMultiSelectField({ source, value, onChange }: AsyncMultiSelectFieldProps) {
  return (
    <Autocomplete
      value={(value ?? []).map(String)}
      onChange={selected => onChange(selected.length > 0 ? selected : undefined)}
      queryKey={source.queryKey}
      fetchOptions={source.fetch}
      // The popover focuses its first field when it opens: the list would open by itself.
      openOnFocus={false}
    />
  );
}
