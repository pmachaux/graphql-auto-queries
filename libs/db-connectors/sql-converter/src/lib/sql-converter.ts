import { GaqDbQueryOptions, GaqRootQueryFilter } from '@gaq';
import { isNullOrUndefinedOrEmptyObject } from 'libs/gaq/src/lib/utils';
export const sqlConverter =
  <T extends object>(table: string) =>
  (
    filters: GaqRootQueryFilter<T>,
    selectedFields: string[],
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>
  ): string => {
    let sql = `SELECT ${selectedFields.join(', ')} FROM ${table}`;
    if (!isNullOrUndefinedOrEmptyObject(filters)) {
      const whereClause = ``;
    }
    if (opts.limit) {
      sql += ` LIMIT ${opts.limit}`;
    }
    if (opts.offset) {
      sql += ` OFFSET ${opts.offset}`;
    }
    if (opts.sort) {
      sql += ` ORDER BY ${opts.sort
        .map((sort) => `${sort.key} ${sort.order ? 'ASC' : 'DESC'}`)
        .join(', ')}`;
    }

    return sql;
  };
