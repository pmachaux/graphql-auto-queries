import DataLoader = require('dataloader');
import {
  GaqFieldResolverDescription,
  GaqDbAdapter,
  GaqLogger,
} from '../../interfaces/common.interfaces';

const matchingFnForArrays = <T extends object = object>(
  fieldsResolverOption: GaqFieldResolverDescription,
  queryResults: T[],
  sourceKeys: readonly string[]
): Array<T[]> => {
  return sourceKeys.map((parentKey) => {
    return (
      queryResults.filter((r: T) => {
        const matchingId = r[fieldsResolverOption.fieldKey as keyof T];
        return matchingId === parentKey;
      }) ?? []
    );
  });
};
const matchingFnForEntity = <T extends object = object>(
  fieldsResolverOption: GaqFieldResolverDescription,
  queryResults: T[],
  sourceKeys: readonly string[]
): Array<T | null> => {
  return sourceKeys.map((parentKey) => {
    return (
      queryResults.find((r: T) => {
        const matchingId = r[fieldsResolverOption.fieldKey as keyof T];
        return matchingId === parentKey;
      }) ?? null
    );
  });
};

export const batchLoadFnForFieldResolution =
  ({
    requestedFields,
    traceId,
  }: {
    requestedFields: string[];
    traceId: string;
  }) =>
  <T extends object = object>(
    fieldResolver: GaqFieldResolverDescription,
    dbCollectionNameMap: Map<string, string>,
    gaqDbClient: GaqDbAdapter,
    logger: GaqLogger
  ): DataLoader.BatchLoadFn<string, T | T[] | null> => {
    return async (keys: readonly string[]): Promise<T[] | T[][]> => {
      const dbCollectionName = dbCollectionNameMap.get(fieldResolver.fieldType);
      logger.debug(
        `[${traceId}][${fieldResolver.dataloaderName}] Getting data from ${dbCollectionName} for values ${keys} with dataloader`
      );
      const collectionClient =
        gaqDbClient.getCollectionAdapter(dbCollectionName);
      if (!collectionClient) {
        logger.warn(
          `[${traceId}][${fieldResolver.dataloaderName}] No collection client found for ${dbCollectionName}`
        );
        return new Array(keys.length).fill(null);
      }
      try {
        const values = await collectionClient.getValuesInField(
          {
            field: fieldResolver.fieldKey,
            values: keys as any,
          },
          requestedFields,
          {
            logger,
            traceId: fieldResolver.dataloaderName,
            limit: fieldResolver.limit,
          }
        );
        logger.debug(
          `[${traceId}][${fieldResolver.dataloaderName}] Found ${values.length} values for ${dbCollectionName}`
        );
        return fieldResolver.isArray
          ? matchingFnForArrays(fieldResolver, values, keys)
          : matchingFnForEntity(fieldResolver, values, keys);
      } catch (error) {
        logger.error(
          `[${traceId}][${fieldResolver.dataloaderName}] Error getting data from ${dbCollectionName} for keys ${keys}`
        );
        logger.error(
          `[${traceId}][${fieldResolver.dataloaderName}]: ${JSON.stringify(
            error
          )}`
        );
        return new Array(keys.length).fill(null);
      }
    };
  };
