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
    logger.debug(`Getting standard resolver for ${linkedType}`);
    const collectionClient =
      contextValue.gaqDbClient.getCollectionAdapter(dbCollectionName);
    if (!collectionClient || !isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(
        `No collection client or parent found for ${dbCollectionName}`
      );
      return null;
    }
    logger.debug(`Getting data from collection ${dbCollectionName}`);

    return collectionClient
      .getFromGaqFilters(args.filters)
      .then((data) => {
        logger.debug(
          `Data for ${linkedType} fetched, returning ${data.length} items`
        );
        return {
          result: data,
          count: data.length,
        };
      })
      .catch((error) => {
        logger.error(`Error fetching data for ${linkedType}: ${error}`);
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return standardResolver;
};

const getFieldResolver = (
  fieldResolverDescription: GaqFieldResolverDescription,
  dbCollectionName: string
): GaqSchemaLevelResolver => {
  const logger = getLogger();
  const fieldResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: { filters: GaqRootQueryFilter<any> },
    contextValue: GaqContext,
    info: any
  ) => {
    logger.debug(
      `Getting field resolver for ${fieldResolverDescription.fieldName}`
    );

    const collectionClient =
      contextValue.gaqDbClient.getCollectionAdapter(dbCollectionName);
    if (!collectionClient || isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(`No collection client found for ${dbCollectionName}`);
      return fieldResolverDescription.isArray ? [] : null;
    }
    logger.debug(`Getting data from collection ${dbCollectionName}`);

    const dataloader = contextValue.gaqDataloaders.get(
      fieldResolverDescription.dataloaderName
    );
    if (!dataloader) {
      throw new Error(
        `Dataloader ${fieldResolverDescription.dataloaderName} not found`
      );
    }
    return dataloader.load(parent[fieldResolverDescription.parentKey]);
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
    fieldResolversForLinkedType[fieldResolver.fieldName] = getFieldResolver(
      fieldResolver,
      dbCollectionName
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
