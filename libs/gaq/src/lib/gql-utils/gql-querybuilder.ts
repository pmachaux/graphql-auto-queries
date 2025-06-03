import type { ISchemaLevelResolver } from '@graphql-tools/utils';
import type {
  GaqContext,
  GaqResolverDescription,
} from '../interfaces/common.interfaces';
import { isNullOrEmptyObject } from '../utils';

type GaqSchemaLevelResolver = ISchemaLevelResolver<any, any, GaqContext, any>;

const getStandardResolver = (linkedType: string): GaqSchemaLevelResolver => {
  const standardResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: any,
    contextValue: GaqContext,
    info: any
  ) => {
    const collectionClient = contextValue.gaqDbClient.collection(linkedType);
    if (!collectionClient || !isNullOrEmptyObject(parent)) {
      return null;
    }
    return collectionClient.get(args.filter);
  };

  return standardResolver;
};

export const getResolversFromDescriptions = (
  gaqResolverDescriptions: GaqResolverDescription[]
): {
  Query: Record<string, GaqSchemaLevelResolver>;
} => {
  const resolvers = gaqResolverDescriptions.reduce<
    Record<string, GaqSchemaLevelResolver>
  >((acc, query) => {
    return {
      ...acc,
      [query.queryName]: getStandardResolver(query.linkedType),
    };
  }, {});

  return {
    Query: resolvers,
  };
};
