import {
  GaqDbQueryOptions,
  GaqManyToManyCollectionConfig,
  GaqRootQueryFilter,
} from '@graphql-auto-queries/core';
import { Prettify } from '@graphql-auto-queries/utils';

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
  getManyToManyQuery(
    args: Prettify<
      GaqManyToManyCollectionConfig & { parentIds: (string | number)[] }
    >
  ): [string, any[]];
  parseManyToManyQueryResult<T extends object>(
    result: Array<T & { __mtm_parent_id: string | number }>
  ): Array<{ entities: T[]; parentId: string | number }>;
}
