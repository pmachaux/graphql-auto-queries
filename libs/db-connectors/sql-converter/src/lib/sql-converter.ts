import {
  GaqDbQueryOptions,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqRootQueryFilter,
} from '@gaq';
import { isNullOrUndefinedOrEmptyObject } from './utils';
import { GaqSqlConverter } from './interface';

export class SqlConverter<T extends object> implements GaqSqlConverter<T> {
  constructor(protected readonly table: string) {}

  public convert(
    filters: GaqRootQueryFilter<T>,
    selectedFields: string[],
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>
  ): [string, any[]] {
    let sql = `SELECT ${selectedFields.join(', ')} FROM ${this.table}`;
    let params: any[] = [];
    if (!isNullOrUndefinedOrEmptyObject(filters)) {
      const [whereSql, whereParams] = this.getWhereClause(filters);
      sql += ` WHERE${whereSql}`;
      params = whereParams;
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

    return [sql, params];
  }

  protected getWhereClause(filters: GaqRootQueryFilter<T>): [string, any[]] {
    let whereSql = '';
    const whereParams: any[] = [];
    if (filters.and) {
      const [conditionSql, conditionParams] = this.handleAndCondition(filters);
      whereSql += conditionSql;
      whereParams.push(...conditionParams);
    }
    if (filters.or) {
      const [conditionSql, conditionParams] = this.handleOrCondition(filters);
      whereSql += conditionSql;
      whereParams.push(...conditionParams);
    }
    if (filters.nor) {
      const [conditionSql, conditionParams] = this.handleNorCondition(filters);
      whereSql += ` NOT${conditionSql}`;
      whereParams.push(...conditionParams);
    }
    return [whereSql, whereParams];
  }

  protected handleSqlCondition =
    (key: 'and' | 'or' | 'nor') =>
    <T extends object>(filters: GaqRootQueryFilter<T>): [string, any[]] => {
      let conditionSql = '';
      const conditionParams = [];
      const sqlCondition = key === 'and' ? 'AND' : 'OR';
      filters[key].forEach((filter, index) => {
        const filterQuery = filter as GaqFilterQuery<T, keyof T & string>;
        if (filterQuery.key) {
          const sqlComparator = this.getComparatorSql(filterQuery.comparator);
          if (Array.isArray(filterQuery.value)) {
            const values = filterQuery.value.map(() => '?').join(', ');
            conditionSql +=
              index === 0
                ? ` (${filterQuery.key} ${sqlComparator} (${values})`
                : ` ${sqlCondition} ${filterQuery.key} ${sqlComparator} (${values})`;
            conditionParams.push(...filterQuery.value);
          } else if (filterQuery.value === null) {
            const sqlNull =
              filterQuery.comparator === GaqFilterComparators.EQUAL
                ? 'IS NULL'
                : 'IS NOT NULL';
            conditionSql +=
              index === 0
                ? ` (${filterQuery.key} ${sqlNull}`
                : ` ${sqlCondition} ${filterQuery.key} ${sqlNull}`;
          } else {
            conditionSql +=
              index === 0
                ? ` (${filterQuery.key} ${sqlComparator} ?`
                : ` ${sqlCondition} ${filterQuery.key} ${sqlComparator} ?`;
            conditionParams.push(filterQuery.value);
          }
        } else {
          const [nestedSql, nestedParams] = this.getWhereClause(
            filter as GaqRootQueryFilter<object>
          );
          conditionSql += ` ${sqlCondition}${nestedSql}`;
          conditionParams.push(...nestedParams);
        }
      });
      return [conditionSql + ')', conditionParams];
    };

  protected handleAndCondition = this.handleSqlCondition('and');
  protected handleOrCondition = this.handleSqlCondition('or');
  protected handleNorCondition = this.handleSqlCondition('nor');

  protected getComparatorSql(comparator: GaqFilterComparators) {
    switch (comparator) {
      case GaqFilterComparators.EQUAL:
        return '=';
      case GaqFilterComparators.NOT_EQUAL:
        return '<>';
      case GaqFilterComparators.STRICTLY_GREATER:
        return '>';
      case GaqFilterComparators.GREATER:
        return '>=';
      case GaqFilterComparators.STRICTLY_LOWER:
        return '<';
      case GaqFilterComparators.LOWER:
        return '<=';
      case GaqFilterComparators.IN:
        return 'IN';
      case GaqFilterComparators.NOT_IN:
        return 'NOT IN';
      default:
        throw new Error(`Unsupported comparator: ${comparator}`);
    }
  }
}
