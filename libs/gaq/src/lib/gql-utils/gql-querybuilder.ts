import type { ISchemaLevelResolver } from '@graphql-tools/utils';
import type {
  GaqContext,
  GaqResolverDescription,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';
import { isNullOrUndefinedOrEmptyObject } from '../utils';
import { getLogger } from '../logger';
import { GaqErrorCodes } from '../interfaces/gaq-errors.interface';

type GaqSchemaLevelResolver = ISchemaLevelResolver<
  any,
  GaqContext,
  { filters: GaqRootQueryFilter<any> },
  any
>;

const getStandardResolver = (linkedType: string): GaqSchemaLevelResolver => {
  const logger = getLogger();
  const standardResolver: GaqSchemaLevelResolver = (
    parent: any,
    args: { filters: GaqRootQueryFilter<any> },
    contextValue: GaqContext,
    info: any
  ) => {
    // logger.debug(`Parent: ${JSON.stringify(parent)}`);
    // logger.debug(`Args: ${JSON.stringify(args)}`);
    // logger.debug(`Context value: ${JSON.stringify(contextValue)}`);
    // logger.debug(`Info: ${JSON.stringify(info)}`);
    logger.debug(`Getting standard resolver for ${linkedType}`);
    const collectionClient = contextValue.gaqDbClient.collection(linkedType);
    if (!collectionClient || !isNullOrUndefinedOrEmptyObject(parent)) {
      logger.debug(`No collection client or parent found for ${linkedType}`);
      return null;
    }
    logger.debug(`Getting data for ${linkedType}`);

    return collectionClient
      .get(args.filters)
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
