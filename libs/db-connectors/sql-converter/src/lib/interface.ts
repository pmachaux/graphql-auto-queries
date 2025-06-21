import { GaqDbQueryOptions, GaqRootQueryFilter } from '@gaq';

export interface GaqSqlConverter {
  getCountQuery(args: {
    filters: GaqRootQueryFilter<object>;
    table: string;
  }): [string, any[]];
  convertToQuery(args: {
    filters: GaqRootQueryFilter<object>;
    table: string;
    selectedFields: string[];
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>;
  }): [string, any[]];
  getValuesInFieldQuery(args: {
    table: string;
    payload: { field: string; values: any[] };
    selectedFields: string[];
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>;
  }): [string, any[]];
}
