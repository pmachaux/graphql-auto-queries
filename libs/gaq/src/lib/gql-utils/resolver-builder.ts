import type {
  GaqContext,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqResolverDescription,
  GaqRootQueryFilter,
  GaqSchemaLevelResolver,
} from '../interfaces/common.interfaces';
import { isNullOrUndefinedOrEmptyObject, omit } from '../utils';
import { GaqErrorCodes } from '../interfaces/gaq-errors.interface';
import { gaqNestedFilterQueryScalar } from '../scalars/gaq-nested-filters.scalar';
import graphqlFields = require('graphql-fields');

const getStandardResolver = (
  config: {
    linkedType: string;
    dbCollectionName: string;
    defaultLimit: number | null;
    maxLimit: number | null;
  },
  { logger }: { logger: GaqLogger }
): GaqSchemaLevelResolver => {
  const standardResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: { filters: GaqRootQueryFilter<any> },
    contextValue: GaqContext,
    info: any
  ) => {
    const requestedFields = graphqlFields(info) as {
      result?: Record<string, any>;
      count?: any;
    };

    if (!requestedFields.result && !requestedFields.count) {
      throw new Error(GaqErrorCodes.INVALID_REQUEST);
    }
    const selectedFields = Object.keys(requestedFields.result ?? {});

    logger.debug(
      `[${contextValue.traceId}] Selected fields for ${
        config.linkedType
      }: ${selectedFields.join(', ')}`
    );
    logger.debug(
      `[${contextValue.traceId}] Getting standard resolver for ${config.linkedType}`
    );
    const collectionClient = contextValue.gaqDbClient.getCollectionAdapter(
      config.dbCollectionName
    );
    if (!collectionClient || !isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(
        `[${contextValue.traceId}] No collection client or parent found for ${config.dbCollectionName}`
      );
      return null;
    }
    logger.debug(
      `[${contextValue.traceId}] Getting data from collection ${config.dbCollectionName}`
    );
    if (selectedFields.length === 0) {
      return collectionClient.count(args.filters).then((count) => ({
        count,
      }));
    }
    let limit = args.filters.limit ?? config.defaultLimit;
    if (limit && config.maxLimit && limit > config.maxLimit) {
      limit = config.maxLimit;
    }

    return collectionClient
      .getFromGaqFilters(
        omit(args.filters, 'sort', 'limit', 'offset'),
        selectedFields,
        {
          logger,
          sort: args.filters.sort,
          limit,
          offset: args.filters.offset,
          traceId: contextValue.traceId,
        }
      )
      .then((data) => {
        logger.debug(
          `[${contextValue.traceId}] Data for ${config.linkedType} fetched, returning ${data.length} items`
        );
        return {
          result: data,
          count: data.length,
        };
      })
      .catch((error) => {
        logger.error(
          `[${contextValue.traceId}] Error fetching data for ${config.linkedType}: ${error}`
        );
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return standardResolver;
};

const getFieldResolver = (
  fieldResolverDescription: GaqFieldResolverDescription,
  { logger }: { logger: GaqLogger }
): GaqSchemaLevelResolver => {
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
  dbCollectionNameMap: Map<string, string>,
  { logger }: { logger: GaqLogger }
) => {
  const queryResolver = {
    [resolverDescription.queryName]: getStandardResolver(
      {
        linkedType: resolverDescription.linkedType,
        dbCollectionName: resolverDescription.dbCollectionName,
        defaultLimit: resolverDescription.defaultLimit,
        maxLimit: resolverDescription.maxLimit,
      },
      { logger }
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
    fieldResolversForLinkedType[fieldResolver.fieldName] = getFieldResolver(
      fieldResolver,
      { logger }
    );
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
  dbCollectionNameMap: Map<string, string>,
  { logger }: { logger: GaqLogger }
): GetResolversFromDescriptionsOutput => {
  const resolvers = gaqResolverDescriptions.map((description) =>
    getQueryAndFieldResolver(description, dbCollectionNameMap, { logger })
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

export const generateResolvers = ({
  gaqResolverDescriptions,
  dbCollectionNameMap,
  logger,
}: {
  dbCollectionNameMap: Map<string, string>;
  gaqResolverDescriptions: GaqResolverDescription[];
  logger: GaqLogger;
}) => {
  const gaqResolvers = getResolversFromDescriptions(
    gaqResolverDescriptions,
    dbCollectionNameMap,
    { logger }
  );

  const resolvers = {
    GaqNestedFilterQuery: gaqNestedFilterQueryScalar,
    Query: {
      ...gaqResolvers.Query,
    },
    ...omit(gaqResolvers, 'Query'),
  };
  return resolvers;
};
