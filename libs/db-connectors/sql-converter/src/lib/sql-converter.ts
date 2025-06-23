import {
  GaqDbQueryOptions,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqManyToManyCollectionConfig,
  GaqRootQueryFilter,
} from '@gaq';
import { isNullOrUndefinedOrEmptyObject } from '@gaq/utils';
import { GaqSqlConverter } from './interface';
import { omit } from '@gaq/utils';

const isFilterQuery = (
  filter: object
): filter is GaqFilterQuery<object, keyof object & string> => {
  return 'key' in filter;
};

export class SqlConverter implements GaqSqlConverter {
  public getCountQuery<T extends object>({
    filters,
    table,
  }: {
    filters: GaqRootQueryFilter<T>;
    table: string;
  }): [string, any[]] {
    let sql = `SELECT COUNT(*) FROM ${table}`;
    let params: any[] = [];
    if (!isNullOrUndefinedOrEmptyObject(filters)) {
      const [whereSql, whereParams] = this.getWhereClause({
        filters,
        paramsCount: 0,
      });
      sql += ` WHERE${whereSql}`;
      params = whereParams;
    }

    return [sql, params];
  }

  public convertToQuery<T extends object>({
    filters,
    table,
    selectedFields,
    opts,
  }: {
    filters: GaqRootQueryFilter<T>;
    table: string;
    selectedFields: string[];
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>;
  }): [string, any[]] {
    let sql = `SELECT ${selectedFields.join(', ')} FROM ${table}`;
    let params: any[] = [];
    if (!isNullOrUndefinedOrEmptyObject(filters)) {
      const [whereSql, whereParams] = this.getWhereClause({
        filters,
        paramsCount: 0,
      });
      sql += ` WHERE${whereSql}`;
      params = whereParams;
    }
    if (opts.sort) {
      sql += ` ORDER BY ${opts.sort
        .map((sort) => `${sort.key} ${sort.order === 1 ? 'ASC' : 'DESC'}`)
        .join(', ')}`;
    }
    if (opts.limit) {
      sql += ` LIMIT ${opts.limit}`;
    }
    if (opts.offset) {
      sql += ` OFFSET ${opts.offset}`;
    }

    return [sql, params];
  }

  public getValuesInFieldQuery({
    table,
    payload,
    selectedFields,
    opts,
  }: {
    table: string;
    payload: { field: string; values: any[] };
    selectedFields: string[];
    opts: Pick<GaqDbQueryOptions, 'limit' | 'offset' | 'sort'>;
  }): [string, any[]] {
    const parametrizedSql = payload.values
      .map((v, index) => this.getParametrizedValue(v, index))
      .join(', ');
    let sql = `SELECT ${selectedFields.join(', ')} FROM ${table} WHERE ${
      payload.field
    } IN (${parametrizedSql})`;

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

    return [sql, payload.values];
  }

  public getManyToManyQuery({
    mtmCollectionName,
    fieldCollectionName,
    requestedFields,
    parentIds,
    mtmParentKeyAlias,
    mtmFieldKeyAlias,
    fieldKey,
  }: GaqManyToManyCollectionConfig & { parentIds: (string | number)[] }): [
    string,
    any[]
  ] {
    const fieldTableRequestedFields = requestedFields
      .map((field) => `fi.${field}`)
      .join(', ');
    const parentKeysSql = parentIds
      .map((key, index) => this.getParametrizedValue(key, index))
      .join(', ');

    const sql = `SELECT ${fieldTableRequestedFields}, mtm.${mtmParentKeyAlias} as "__mtm_parent_id" FROM ${fieldCollectionName} as fi INNER JOIN ${mtmCollectionName} as mtm ON fi.${fieldKey} = mtm.${mtmFieldKeyAlias} WHERE mtm.${mtmParentKeyAlias} IN (${parentKeysSql})`;

    return [sql, parentIds];
  }

  public parseManyToManyQueryResult<T extends object>(
    result: Array<T & { __mtm_parent_id: string | number }>
  ): Array<{ entities: T[]; parentId: string | number }> {
    return result.reduce((acc, item) => {
      const parentId = item.__mtm_parent_id;
      const entities = acc.find((i) => i.parentId === parentId)?.entities;
      if (entities) {
        entities.push(omit(item, '__mtm_parent_id') as T);
      } else {
        acc.push({ entities: [omit(item, '__mtm_parent_id') as T], parentId });
      }
      return acc;
    }, [] as Array<{ entities: T[]; parentId: string | number }>);
  }

  protected getWhereClause<T extends object>({
    filters,
    paramsCount,
  }: {
    filters: GaqRootQueryFilter<T>;
    paramsCount: number;
  }): [string, any[]] {
    let whereSql = '';
    const whereParams: any[] = [];
    let updatedParamsCount = paramsCount;
    if (filters.and) {
      const [conditionSql, conditionParams] = this.handleAndCondition({
        filters,
        paramsCount: updatedParamsCount,
      });
      whereSql += conditionSql;
      whereParams.push(...conditionParams);
      updatedParamsCount += conditionParams.length;
    }
    if (filters.or) {
      const [conditionSql, conditionParams] = this.handleOrCondition({
        filters,
        paramsCount: updatedParamsCount,
      });
      whereSql += conditionSql;
      whereParams.push(...conditionParams);
      updatedParamsCount += conditionParams.length;
    }
    if (filters.nor) {
      const [conditionSql, conditionParams] = this.handleNorCondition({
        filters,
        paramsCount: updatedParamsCount,
      });
      whereSql += ` NOT${conditionSql}`;
      whereParams.push(...conditionParams);
      updatedParamsCount += conditionParams.length;
    }
    return [whereSql, whereParams];
  }

  protected handleSqlCondition =
    (key: 'and' | 'or' | 'nor') =>
    <T extends object>({
      filters,
      paramsCount,
    }: {
      filters: GaqRootQueryFilter<T>;
      paramsCount: number;
    }): [string, any[]] => {
      let conditionSql = '';
      const conditionParams = [];
      const sqlCondition = key === 'and' ? 'AND' : 'OR';
      let updatedParamsCount = paramsCount;
      filters[key].forEach((filter, index) => {
        if (isFilterQuery(filter)) {
          const [sql, params] = this.getSqlForFilterQuery({
            filter,
            index,
            sqlCondition,
            paramsCount: updatedParamsCount,
          });
          conditionSql += sql;
          conditionParams.push(...params);
          updatedParamsCount += params.length;
        } else {
          const [nestedSql, nestedParams] = this.getWhereClause({
            filters: filter as GaqRootQueryFilter<object>,
            paramsCount: updatedParamsCount,
          });
          conditionSql += ` ${sqlCondition}${nestedSql}`;
          conditionParams.push(...nestedParams);
          updatedParamsCount += nestedParams.length;
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

  protected getSqlForFilterQuery({
    filter,
    index,
    sqlCondition,
    paramsCount,
  }: {
    filter: GaqFilterQuery<object, keyof object & string>;
    index: number;
    sqlCondition: 'AND' | 'OR';
    paramsCount: number;
  }): [string, any[]] {
    let conditionSql = '';
    const conditionParams = [];
    const sqlComparator = this.getComparatorSql(filter.comparator);
    let updatedParamsCount = paramsCount;
    if (Array.isArray(filter.value)) {
      const values = filter.value
        .map((v, index) =>
          this.getParametrizedValue(v, index + updatedParamsCount)
        )
        .join(', ');
      conditionSql +=
        index === 0
          ? ` (${filter.key} ${sqlComparator} (${values})`
          : ` ${sqlCondition} ${filter.key} ${sqlComparator} (${values})`;
      conditionParams.push(...filter.value);
      updatedParamsCount += filter.value.length;
    } else if (filter.value === null) {
      conditionSql += this.getSqlOnNullValue({
        comparator: filter.comparator,
        filterQuery: filter,
        index,
        sqlCondition,
      });
    } else {
      conditionSql +=
        index === 0
          ? ` (${filter.key} ${sqlComparator} ${this.getParametrizedValue(
              filter.value,
              updatedParamsCount
            )}`
          : ` ${sqlCondition} ${
              filter.key
            } ${sqlComparator} ${this.getParametrizedValue(
              filter.value,
              updatedParamsCount
            )}`;
      conditionParams.push(filter.value);
      updatedParamsCount += 1;
    }
    return [conditionSql, conditionParams];
  }

  protected getParametrizedValue(value: any, index: number) {
    return '?';
  }

  protected getSqlOnNullValue({
    comparator,
    filterQuery,
    index,
    sqlCondition,
  }: {
    comparator: GaqFilterComparators;
    filterQuery: GaqFilterQuery<object, keyof object & string>;
    index: number;
    sqlCondition: string;
  }) {
    const sqlNull =
      comparator === GaqFilterComparators.EQUAL ? 'IS NULL' : 'IS NOT NULL';
    return index === 0
      ? ` (${filterQuery.key} ${sqlNull}`
      : ` ${sqlCondition} ${filterQuery.key} ${sqlNull}`;
  }
}
