import type {
  GaqContext,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqQueryOptions,
  GaqResolverDescription,
  GaqRootQueryFilter,
  GaqSchemaLevelResolver,
} from '../interfaces/common.interfaces';
import {
  isNullOrUndefinedOrEmptyObject,
  omit,
  pickNonNullable,
} from '../utils';
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
    {
      filters,
      options,
    }: { filters: GaqRootQueryFilter<any>; options?: GaqQueryOptions },
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
      return collectionClient
        .count(filters, {
          logger,
          traceId: contextValue.traceId,
        })
        .then((count) => ({
          count,
        }));
    }
    let limit = options?.limit ?? config.defaultLimit;
    if (limit && config.maxLimit && limit > config.maxLimit) {
      limit = config.maxLimit;
    }

    return collectionClient
      .getFromGaqFilters(filters, selectedFields, {
        logger,
        sort: options?.sort,
        limit,
        offset: options?.offset,
        traceId: contextValue.traceId,
      })
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

const getReferenceResolver = (
  resolverDescription: GaqResolverDescription,
  { logger }: { logger: GaqLogger }
) => {
  const referenceResolver = (
    entity: any,
    contextValue: GaqContext,
    info: any
  ) => {
    logger.debug(
      `[${contextValue.traceId}] Getting reference resolver for ${resolverDescription.linkedType}`
    );

    const dataloader = contextValue.gaqDataloaders.get(
      resolverDescription.federationReferenceResolver.dataloaderName
    );
    if (!dataloader) {
      logger.error(
        `[${contextValue.traceId}] Dataloader ${resolverDescription.federationReferenceResolver.dataloaderName} not found`
      );
      throw new Error(
        `Dataloader ${resolverDescription.federationReferenceResolver.dataloaderName} not found`
      );
    }
    const keys = pickNonNullable(
      entity,
      ...resolverDescription.federationReferenceResolver.keys
    );
    return dataloader
      .load(keys)
      .then((data) => {
        logger.debug(
          `[${contextValue.traceId}] Reference resolver data for ${resolverDescription.linkedType} fetched, returning ${data.length} items`
        );
        return data;
      })
      .catch((error) => {
        logger.error(
          `[${contextValue.traceId}] Error fetching reference resolver data for ${resolverDescription.linkedType}: ${error}`
        );
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return referenceResolver;
};

const getFieldResoverForLinkedType = (
  resolverDescription: GaqResolverDescription,
  { logger }: { logger: GaqLogger }
) => {
  const fieldResolversForLinkedType: Record<string, GaqSchemaLevelResolver> =
    {};
  resolverDescription.fieldResolvers.forEach((fieldResolver) => {
    fieldResolversForLinkedType[fieldResolver.fieldName] = getFieldResolver(
      fieldResolver,
      { logger }
    );
  });
  return fieldResolversForLinkedType;
};

const getReferenceResolverForLinkedType = (
  resolverDescription: GaqResolverDescription,
  { logger }: { logger: GaqLogger }
) => {
  if (!resolverDescription.federationReferenceResolver) {
    return {};
  }
  const referenceResolver = getReferenceResolver(resolverDescription, {
    logger,
  });
  return {
    __resolveReference: referenceResolver,
  };
};

const getQueryFieldAndReferenceResolver = (
  resolverDescription: GaqResolverDescription,
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
    getFieldResoverForLinkedType(resolverDescription, {
      logger,
    });

  const referenceResolversForLinkedType = getReferenceResolverForLinkedType(
    resolverDescription,
    { logger }
  );

  if (
    isNullOrUndefinedOrEmptyObject(fieldResolversForLinkedType) &&
    isNullOrUndefinedOrEmptyObject(referenceResolversForLinkedType)
  ) {
    return {
      queryResolver,
    };
  }

  return {
    queryResolver,
    typeResolvers: {
      [resolverDescription.linkedType]: {
        ...fieldResolversForLinkedType,
        ...referenceResolversForLinkedType,
      },
    },
  };
};

type GetResolversFromDescriptionsOutput = {
  Query: Record<string, GaqSchemaLevelResolver>;
} & Record<string, Record<string, GaqSchemaLevelResolver>>;
export const getResolversFromDescriptions = (
  gaqResolverDescriptions: GaqResolverDescription[],
  { logger }: { logger: GaqLogger }
): GetResolversFromDescriptionsOutput => {
  const resolvers = gaqResolverDescriptions.map((description) =>
    getQueryFieldAndReferenceResolver(description, {
      logger,
    })
  );

  return resolvers.reduce<GetResolversFromDescriptionsOutput>(
    (acc, resolver) => {
      const Query = {
        ...acc.Query,
        ...resolver.queryResolver,
      };

      if (isNullOrUndefinedOrEmptyObject(resolver.typeResolvers)) {
        return {
          ...acc,
          Query,
        };
      }
      return {
        ...acc,
        Query,
        ...resolver.typeResolvers,
      };
    },
    { Query: {} }
  );
};

export const generateResolvers = ({
  gaqResolverDescriptions,
  logger,
}: {
  gaqResolverDescriptions: GaqResolverDescription[];
  logger: GaqLogger;
}) => {
  const gaqResolvers = getResolversFromDescriptions(gaqResolverDescriptions, {
    logger,
  });

  const resolvers = {
    GaqNestedFilterQuery: gaqNestedFilterQueryScalar,
    Query: {
      ...gaqResolvers.Query,
    },
    ...omit(gaqResolvers, 'Query'),
  };
  return resolvers;
};
