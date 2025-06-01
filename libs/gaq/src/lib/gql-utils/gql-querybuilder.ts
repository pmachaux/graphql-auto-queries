import type { ISchemaLevelResolver } from '@graphql-tools/utils';
import type {
  GaqDatasourceResolverMap,
  GaqResolverDescription,
} from '../interfaces/common.interfaces';

export const getResolversFromQueries = (
  queries: GaqResolverDescription[],
  datasources: GaqDatasourceResolverMap
): { Query: Record<string, ISchemaLevelResolver<any, any, any, any>> } => {
  return {
    Query: queries.reduce((acc, query) => {
      acc[query.queryName] = (parent, args, contextValue, info) => {
        const datasource = datasources[query.linkedType]?.resolver;
        return datasource ? datasource(parent, args, contextValue, info) : null;
      };
      return acc;
    }, {}),
  };
};
