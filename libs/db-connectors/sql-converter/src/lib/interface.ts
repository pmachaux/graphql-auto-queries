import { GaqDbQueryOptions, GaqRootQueryFilter } from '@gaq';

export interface GaqSqlConverter<T extends object> {
  convert(
    filters: GaqRootQueryFilter<T>,
    selectedFields: string[],
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>
  ): [string, any[]];
}
