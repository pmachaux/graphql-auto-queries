import { GaqDbQueryOptions, GaqRootQueryFilter } from '@gaq';
export function sqlConverter<T extends object>(
  table: string,
): (
  filters: GaqRootQueryFilter<T>,
  selectedFields: string[],
  opts: GaqDbQueryOptions,
):  string => {};
