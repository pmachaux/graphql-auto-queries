import { GaqDbQueryOptions, GaqRootQueryFilter } from '@gaq';

export interface GaqSqlConverter {
  convert({
    filters,
    table,
    selectedFields,
    opts,
  }: {
    filters: GaqRootQueryFilter<object>;
    table: string;
    selectedFields: string[];
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>;
  }): [string, any[]];
}
