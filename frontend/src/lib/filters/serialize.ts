import {
  FilterType,
  type DateFilterValue,
  type FilterEntity,
  type FilterItem,
  type FilterValue,
  type Primitive,
  type RangeFilterValue,
} from './types';

// --- Type Guards ---

export function isDateFilterValue(val: unknown): val is DateFilterValue {
  return !!val && typeof val === 'object' && ('from' in val || 'to' in val);
}

export function isRangeFilterValue(val: unknown): val is RangeFilterValue {
  return !!val && typeof val === 'object' && ('min' in val || 'max' in val);
}

export function isPrimitiveValue(val: unknown): val is Primitive {
  if (val === null) return true;
  const t = typeof val;
  return t === 'string' || t === 'number' || t === 'boolean';
}

export function isFilterEntity(val: unknown): val is FilterEntity {
  return (
    !!val &&
    typeof val === 'object' &&
    'label' in val &&
    typeof (val as FilterEntity).label === 'string' &&
    'value' in val &&
    isPrimitiveValue((val as FilterEntity).value)
  );
}

// --- Serialize ---

export function serializeFilterValue(
  filterItem: FilterItem,
  filterValue: FilterValue
): Record<string, string | string[]> {
  const value = filterValue[filterItem.key];
  if (value === undefined || value === null || value === '') return {};

  if (filterItem.serializer) {
    const raw = filterItem.serializer(filterValue);
    const result: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) result[k] = v.map(String);
      else result[k] = String(v);
    }
    return result;
  }

  const urlKey = filterItem.query ?? filterItem.key;

  if (filterItem.type === FilterType.DATE) {
    if (!isDateFilterValue(value)) return {};
    const result: Record<string, string> = {};
    if (value.from) result[`${urlKey}_from`] = String(value.from.getTime());
    if (value.to) result[`${urlKey}_to`] = String(value.to.getTime());
    return result;
  }

  if (filterItem.type === FilterType.RANGE) {
    if (!isRangeFilterValue(value)) return {};
    const result: Record<string, string> = {};
    if (value.min != null) result[`${urlKey}_min`] = String(value.min);
    if (value.max != null) result[`${urlKey}_max`] = String(value.max);
    return result;
  }

  if (filterItem.options?.returnObject) {
    if (Array.isArray(value) && value.every(isFilterEntity)) {
      return { [urlKey]: (value as FilterEntity[]).map(v => String(v.value)) };
    }
    if (isFilterEntity(value)) {
      return { [urlKey]: String(value.value) };
    }
    return {};
  }

  if (Array.isArray(value)) {
    return { [urlKey]: value.map(String) };
  }

  return { [urlKey]: isPrimitiveValue(value) ? String(value) : JSON.stringify(value) };
}

// --- Deserialize ---

export function deserializeFilterValue(
  filterItem: FilterItem,
  params: URLSearchParams
): Primitive | Primitive[] | FilterEntity | FilterEntity[] | DateFilterValue | RangeFilterValue | undefined {
  if (filterItem.deserializer) return filterItem.deserializer(params);

  const urlKey = filterItem.query ?? filterItem.key;

  if (filterItem.type === FilterType.DATE) {
    const fromStr = params.get(`${urlKey}_from`);
    const toStr = params.get(`${urlKey}_to`);
    const result: DateFilterValue = {};
    if (fromStr) result.from = new Date(Number(fromStr));
    if (toStr) result.to = new Date(Number(toStr));
    return result.from || result.to ? result : undefined;
  }

  if (filterItem.type === FilterType.RANGE) {
    const minStr = params.get(`${urlKey}_min`);
    const maxStr = params.get(`${urlKey}_max`);
    const result: RangeFilterValue = {};
    if (minStr) result.min = Number(minStr);
    if (maxStr) result.max = Number(maxStr);
    return result.min != null || result.max != null ? result : undefined;
  }

  const allValues = params.getAll(urlKey);
  if (allValues.length === 0) return undefined;

  const isMultiple = [FilterType.MULTIPLE, FilterType.MULTIPLE_SELECT].includes(filterItem.type);
  const mapped = allValues.map(urlVal => castValue(urlVal, filterItem));

  if (isMultiple) return mapped as Primitive[];
  return mapped[0];
}

function castValue(urlVal: string, item: FilterItem): Primitive | FilterEntity {
  const { options = {} } = item;

  if (options.items && options.items.length > 0) {
    const match = options.items.find(it => {
      const actual = isFilterEntity(it) ? it.value : it;
      return String(actual) === urlVal;
    });
    if (match !== undefined) {
      if (options.returnObject) {
        return isFilterEntity(match) ? match : { label: String(match), value: match };
      }
      return isFilterEntity(match) ? match.value : match;
    }
  }

  if (options.number) {
    const num = Number(urlVal);
    return isNaN(num) ? urlVal : num;
  }

  return urlVal;
}
