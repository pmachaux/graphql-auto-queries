import {
  GaqDbAdapter,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqLogger,
  GaqResolverDescription,
  GaqRootQueryFilter,
} from '../../interfaces/common.interfaces';
import DataLoader = require('dataloader');

export const batchLoadFnForReferenceResolution =
  ({
    requestedFields,
    traceId,
  }: {
    requestedFields: string[];
    traceId: string;
  }) =>
  <T extends object = object>(
    resolverDescription: GaqResolverDescription,
    dbCollectionNameMap: Map<string, string>,
    gaqDbClient: GaqDbAdapter,
    logger: GaqLogger
  ): DataLoader.BatchLoadFn<Record<string, string>, T | T[] | null> => {
    return async (
      keyRecords: readonly Record<string, string>[]
    ): Promise<T[] | T[][]> => {
      const dbCollectionName = dbCollectionNameMap.get(
        resolverDescription.linkedType
      );
      logger.debug(
        `[${traceId}][${resolverDescription.federationReferenceResolver.dataloaderName}] Getting data from ${dbCollectionName} for values ${keyRecords} with dataloader`
      );
      const collectionClient =
        gaqDbClient.getCollectionAdapter(dbCollectionName);
      if (!collectionClient) {
        logger.warn(
          `[${traceId}][${resolverDescription.federationReferenceResolver.dataloaderName}] No collection client found for ${dbCollectionName}`
        );
        return new Array(keyRecords.length).fill(null);
      }
      const filters = keyRecords.map((record) => {
        return {
          and: [
            ...Object.keys(record).map((key) => {
              return {
                key,
                comparator: GaqFilterComparators.EQUAL,
                value: record[key],
              } satisfies GaqFilterQuery<object>;
            }),
          ],
        } satisfies GaqRootQueryFilter<object>;
      });
      try {
        const values = await collectionClient.getFromGaqFilters(
          {
            or: filters,
          },
          requestedFields,
          {
            logger,
            traceId,
          }
        );
        logger.debug(
          `[${traceId}][${resolverDescription.federationReferenceResolver.dataloaderName}] Found ${values.length} values for ${dbCollectionName}`
        );
        return matchingFnForReferenceResolution(values, keyRecords);
      } catch (error) {
        logger.error(
          `[${traceId}][${
            resolverDescription.federationReferenceResolver.dataloaderName
          }] Error getting reference data from ${dbCollectionName} for keys ${JSON.stringify(
            keyRecords
          )}`
        );
        logger.error(
          `[${traceId}][${
            resolverDescription.federationReferenceResolver.dataloaderName
          }]: ${JSON.stringify(error)}`
        );
        return new Array(keyRecords.length).fill(null);
      }
    };
  };

const matchingFnForReferenceResolution = <T extends object = object>(
  queryResults: T[],
  sourceRecords: readonly Record<string, string>[]
): Array<T | null> => {
  return sourceRecords.map((sourceRecord) => {
    const matchingRecord = queryResults.find((r: T) => {
      return Object.keys(sourceRecord).every((key) => {
        return r[key] === sourceRecord[key];
      });
    });
    return matchingRecord ?? null;
  });
};
