import type { ISchemaLevelResolver } from '@graphql-tools/utils';
import type {
  GaqContext,
  GaqResolverDescription,
} from '../interfaces/common.interfaces';
import { isNullOrEmptyObject } from '../utils';

const getStandardResolver = (
  linkedType: string
): ISchemaLevelResolver<any, any, any, any> => {
  const standardResolver: ISchemaLevelResolver<any, any, GaqContext, any> = (
    parent: any,
    args: any,
    contextValue: GaqContext,
    info: any
  ) => {
    const dbAdapter = contextValue.datasources[linkedType]?.dbAdapter;
    if (!dbAdapter || !isNullOrEmptyObject(parent)) {
      return null;
    }
    return dbAdapter.get(args.filter);
  };

  return standardResolver;
};

export const getResolversFromDescriptions = (
  gaqResolverDescriptions: GaqResolverDescription[]
): {
  Query: Record<string, ISchemaLevelResolver<any, any, GaqContext, any>>;
} => {
  return {
    Query: gaqResolverDescriptions.reduce<
      Record<string, ISchemaLevelResolver<any, any, GaqContext, any>>
    >((acc, query) => {
      acc[query.queryName] = getStandardResolver(query.linkedType);
      return acc;
    }, {}),
  };
};
