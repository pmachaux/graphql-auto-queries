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

const getCollectionNameFromType = (type: string): string => {
  return type;
};

const getStandardResolver = (linkedType: string): GaqSchemaLevelResolver => {
  const logger = getLogger();
  const standardResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: { filters: GaqRootQueryFilter<any> },
    contextValue: GaqContext,
    info: any
  ) => {
    logger.debug(`Getting standard resolver for ${linkedType}`);
    const collectionName = getCollectionNameFromType(linkedType);
    const collectionClient =
      contextValue.gaqDbClient.collection(collectionName);
    if (!collectionClient || !isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(
        `No collection client or parent found for ${collectionName}`
      );
      return null;
    }
    logger.debug(`Getting data from collection ${collectionName}`);

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
  fieldResolverDescription: GaqFieldResolverDescription
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
    const collectionName = getCollectionNameFromType(
      fieldResolverDescription.fieldType
    );
    const collectionClient =
      contextValue.gaqDbClient.collection(collectionName);
    if (!collectionClient || isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(`No collection client found for ${collectionName}`);
      return fieldResolverDescription.isArray ? [] : null;
    }
    logger.debug(`Getting data from collection ${collectionName}`);
    return collectionClient
      .getByField({
        field: fieldResolverDescription.fieldKey,
        value: parent[fieldResolverDescription.parentKey],
      })
      .then((data) => {
        logger.debug(
          `Data for ${fieldResolverDescription.fieldName} fetched, returning ${data.length} items`
        );
        if (fieldResolverDescription.isArray) {
          return data;
        }
        if (data.length === 0) {
          return null;
        }
        return data[0];
      })
      .catch((error) => {
        logger.error(
          `Field resolution failed, error fetching data for ${fieldResolverDescription.fieldName}: ${error}`
        );
        throw new Error(GaqErrorCodes.INTERNAL_SERVER_ERROR);
      });
  };

  return fieldResolver;
};

const getQueryAndFieldResolver = (
  resolverDescription: GaqResolverDescription
) => {
  const queryResolver = {
    [resolverDescription.queryName]: getStandardResolver(
      resolverDescription.linkedType
    ),
  };

  const fieldResolversForLinkedType: Record<string, GaqSchemaLevelResolver> =
    {};
  resolverDescription.fieldResolvers.forEach((fieldResolver) => {
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
  gaqResolverDescriptions: GaqResolverDescription[]
): GetResolversFromDescriptionsOutput => {
  const resolvers = gaqResolverDescriptions.map(getQueryAndFieldResolver);

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
}: {
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
  const gaqResolvers = getResolversFromDescriptions(gaqResolverDescriptions);
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
