import DataLoader = require('dataloader');
import {
  GaqDbAdapter,
  GaqFieldResolverDescription,
  GaqLogger,
} from '../../interfaces/common.interfaces';

export const matchingFnForManyToManyFieldResolution = <
  T extends object = object
>(
  values: Array<{ entities: T[]; parentId: string | number }>,
  keys: (string | number)[]
): Array<T[]> => {
  return keys.map((key) => {
    const matchingValue = values.find((value) => {
      return value.parentId === key;
    });
    return matchingValue?.entities ?? [];
  });
};

export const batchLoadFnForManyToManyFieldResolution =
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
  ): DataLoader.BatchLoadFn<string | number, T[]> => {
    return async (keys: (string | number)[]): Promise<T[][]> => {
      logger.debug(
        `[${traceId}][${fieldResolver.mtmDataloaderName}] Getting data from ${fieldResolver.mtmCollectionName} for values ${keys} with dataloader`
      );
      const mtmCollectionClient = gaqDbClient.getCollectionAdapter(
        fieldResolver.mtmCollectionName
      );
      if (!mtmCollectionClient) {
        logger.warn(
          `[${traceId}][${fieldResolver.mtmDataloaderName}] No collection client found for ${fieldResolver.mtmCollectionName}`
        );
        return new Array(keys.length).fill(null);
      }

      const fieldCollectionName = dbCollectionNameMap.get(
        fieldResolver.fieldType
      );

      try {
        const values = await mtmCollectionClient.resolveManyToMany(
          keys,
          {
            mtmCollectionName: fieldResolver.mtmCollectionName,
            mtmFieldKeyAlias: fieldResolver.mtmFieldKeyAlias,
            mtmParentKeyAlias: fieldResolver.mtmParentKeyAlias,
            requestedFields,
            fieldCollectionName,
            fieldKey: fieldResolver.fieldKey,
          },
          {
            logger,
            traceId,
          }
        );
        logger.debug(
          `[${traceId}][${fieldResolver.mtmDataloaderName}] Found ${values.length} values for ${fieldResolver.mtmCollectionName}`
        );
        return matchingFnForManyToManyFieldResolution(values, keys);
      } catch (error) {
        logger.error(
          `[${traceId}][${fieldResolver.mtmDataloaderName}] Error getting data from Many to Many collection ${fieldResolver.mtmCollectionName} for keys ${keys}`
        );
        logger.error(
          `[${traceId}][${fieldResolver.mtmDataloaderName}]: ${JSON.stringify(
            error
          )}`
        );
        return new Array(keys.length).fill(null);
      }
    };
  };
