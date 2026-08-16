export type Primitive = string | number | boolean | null;

export enum FilterType {
  SINGLE,
  MULTIPLE,
  SELECT,
  MULTIPLE_SELECT,
  DATE,
  TOGGLE,
  RANGE,
}

export type FilterMapping = {
  [FilterType.SINGLE]: Primitive;
  [FilterType.MULTIPLE]: Primitive[];
  [FilterType.SELECT]: Primitive | FilterEntity;
  [FilterType.MULTIPLE_SELECT]: Primitive[] | FilterEntity[];
  [FilterType.DATE]: DateFilterValue;
  [FilterType.TOGGLE]: Primitive;
  [FilterType.RANGE]: RangeFilterValue;
};

export type FilterItem = {
  [K in FilterType]: {
    label: string;
    key: string;
    type: K;
    query?: string;
    options?: FilterOptions;
    serializer?: (value: FilterValue) => Record<string, Primitive | Primitive[]>;
    deserializer?: (params: URLSearchParams) => FilterMapping[K] | undefined;
  };
}[FilterType];

export type FilterEntity = {
  label: string;
  value: Primitive;
};

export type FilterOptions = {
  items?: Primitive[] | FilterEntity[];
  number?: boolean;
  returnObject?: boolean;
};

export type FilterValue = Record<
  string,
  Primitive | Primitive[] | FilterEntity | FilterEntity[] | DateFilterValue | RangeFilterValue
>;

export type DateFilterValue = {
  from?: Date;
  to?: Date;
};

export type RangeFilterValue = {
  min?: number;
  max?: number;
};
