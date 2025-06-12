import type {
  GaqContext,
  GaqFieldResolverDescription,
  GaqResolverDescription,
  GaqRootQueryFilter,
  GaqSchemaLevelResolver,
} from '../interfaces/common.interfaces';
import { isNullOrUndefinedOrEmptyObject, omit } from '../utils';
import { getLogger } from '../logger';
import { GaqErrorCodes } from '../interfaces/gaq-errors.interface';
import { gaqNestedFilterQueryScalar } from '../scalars/gaq-nested-filters.scalar';
import { IResolvers } from '@graphql-tools/utils';

const getStandardResolver = (
  linkedType: string,
  dbCollectionName: string
): GaqSchemaLevelResolver => {
  const logger = getLogger();
  const standardResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: { filters: GaqRootQueryFilter<any> },
    contextValue: GaqContext,
    info: any
  ) => {
    logger.debug(
      `[${contextValue.traceId}] Getting standard resolver for ${linkedType}`
    );
    const collectionClient =
      contextValue.gaqDbClient.getCollectionAdapter(dbCollectionName);
    if (!collectionClient || !isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(
        `[${contextValue.traceId}] No collection client or parent found for ${dbCollectionName}`
      );
      return null;
    }
    logger.debug(
      `[${contextValue.traceId}] Getting data from collection ${dbCollectionName}`
    );

    return collectionClient
      .getFromGaqFilters(args.filters, {
        logger,
        sort: args.filters.sort,
        limit: args.filters.limit,
        offset: args.filters.offset,
        traceId: contextValue.traceId,
      })
      .then((data) => {
        logger.debug(
          `[${contextValue.traceId}] Data for ${linkedType} fetched, returning ${data.length} items`
        );
        return {
          result: data,
          count: data.length,
        };
      })
      .catch((error) => {
        logger.error(
          `[${contextValue.traceId}] Error fetching data for ${linkedType}: ${error}`
        );
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return standardResolver;
};

const getFieldResolver = (
  fieldResolverDescription: GaqFieldResolverDescription
): GaqSchemaLevelResolver => {
  const logger = getLogger();
  const fieldResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: any,
    contextValue: GaqContext,
    info: any
  ) => {
    logger.debug(
      `[${contextValue.traceId}] Getting field resolver for ${fieldResolverDescription.fieldName}`
    );

    const dataloader = contextValue.gaqDataloaders.get(
      fieldResolverDescription.dataloaderName
    );
    if (!dataloader) {
      logger.error(
        `[${contextValue.traceId}] Dataloader ${fieldResolverDescription.dataloaderName} not found`
      );
      throw new Error(
        `Dataloader ${fieldResolverDescription.dataloaderName} not found`
      );
    }
    return dataloader
      .load(parent[fieldResolverDescription.parentKey])
      .then((data) => {
        logger.debug(
          `[${contextValue.traceId}] Data for ${fieldResolverDescription.fieldName} fetched, returning ${data.length} items`
        );
        return data;
      })
      .catch((error) => {
        logger.error(
          `[${contextValue.traceId}] Error fetching data for ${fieldResolverDescription.fieldName}: ${error}`
        );
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return fieldResolver;
};

const getQueryAndFieldResolver = (
  resolverDescription: GaqResolverDescription,
  dbCollectionNameMap: Map<string, string>
) => {
  const queryResolver = {
    [resolverDescription.queryName]: getStandardResolver(
      resolverDescription.linkedType,
      resolverDescription.dbCollectionName
    ),
  };

  const fieldResolversForLinkedType: Record<string, GaqSchemaLevelResolver> =
    {};
  resolverDescription.fieldResolvers.forEach((fieldResolver) => {
    const dbCollectionName = dbCollectionNameMap.get(fieldResolver.fieldType);
    if (!dbCollectionName) {
      throw new Error(
        `No db collection name found for type ${fieldResolver.fieldType}`
      );
    }
    fieldResolversForLinkedType[fieldResolver.fieldName] =
      getFieldResolver(fieldResolver);
  });
  if (isNullOrUndefinedOrEmptyObject(fieldResolversForLinkedType)) {
    return {
      queryResolver,
    };
  }
  return {
    queryResolver,
    fieldResolvers: {
      [resolverDescription.linkedType]: fieldResolversForLinkedType,
    },
  };
};

type GetResolversFromDescriptionsOutput = {
  Query: Record<string, GaqSchemaLevelResolver>;
} & Record<string, Record<string, GaqSchemaLevelResolver>>;
export const getResolversFromDescriptions = (
  gaqResolverDescriptions: GaqResolverDescription[],
  dbCollectionNameMap: Map<string, string>
): GetResolversFromDescriptionsOutput => {
  const resolvers = gaqResolverDescriptions.map((description) =>
    getQueryAndFieldResolver(description, dbCollectionNameMap)
  );

  return resolvers.reduce<GetResolversFromDescriptionsOutput>(
    (acc, resolver) => {
      const Query = {
        ...acc.Query,
        ...resolver.queryResolver,
      };

      if (isNullOrUndefinedOrEmptyObject(resolver.fieldResolvers)) {
        return {
          ...acc,
          Query,
        };
      }
      return {
        ...acc,
        Query,
        ...resolver.fieldResolvers,
      };
    },
    { Query: {} }
  );
};

export const generateResolvers = <TContext extends GaqContext>({
  gaqResolverDescriptions,
  standardApolloResolvers,
  dbCollectionNameMap,
}: {
  dbCollectionNameMap: Map<string, string>;
  gaqResolverDescriptions: GaqResolverDescription[];
  standardApolloResolvers:
    | IResolvers<
        {
          Query?: Record<string, any>;
        } & Record<string, any>,
        GaqContext
      >
    | undefined;
}) => {
  const gaqResolvers = getResolversFromDescriptions(
    gaqResolverDescriptions,
    dbCollectionNameMap
  );
  const otherResolvers = standardApolloResolvers
    ? omit(
        standardApolloResolvers as IResolvers<
          { Query?: Record<string, any> },
          TContext
        >,
        'Query'
      )
    : {};

  const resolvers = {
    ...otherResolvers,
    GaqNestedFilterQuery: gaqNestedFilterQueryScalar,
    Query: {
      ...(standardApolloResolvers?.Query ?? {}),
      ...gaqResolvers.Query,
    },
    ...omit(gaqResolvers, 'Query'),
  };
  return resolvers;
};
