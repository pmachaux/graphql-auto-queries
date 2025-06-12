import {
  GaqDbClient,
  GaqFieldResolverDescription,
  GaqLogger,
} from '../interfaces/common.interfaces';
import DataLoader = require('dataloader');
import { getLogger } from '../logger';

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

export const batchLoadFn = <T extends object = object>(
  fieldResolver: GaqFieldResolverDescription,
  dbCollectionNameMap: Map<string, string>,
  gaqDbClient: GaqDbClient,
  logger: GaqLogger
): DataLoader.BatchLoadFn<string, T | T[] | null> => {
  return async (keys: readonly string[]): Promise<T[] | T[][]> => {
    const dbCollectionName = dbCollectionNameMap.get(fieldResolver.fieldType);
    logger.debug(
      `[${fieldResolver.dataloaderName}] Getting data from ${dbCollectionName} for keys ${keys} with dataloader`
    );
    const collectionClient = gaqDbClient.getCollectionAdapter(dbCollectionName);
    if (!collectionClient) {
      logger.warn(
        `[${fieldResolver.dataloaderName}] No collection client found for ${dbCollectionName}`
      );
      return new Array(keys.length).fill(null);
    }
    try {
      const values = await collectionClient.getValuesInField(
        {
          field: fieldResolver.fieldKey,
          values: keys as any,
        },
        {
          logger,
          traceId: fieldResolver.dataloaderName,
        }
      );
      logger.debug(
        `[${fieldResolver.dataloaderName}] Found ${values.length} values for ${dbCollectionName}`
      );
      return fieldResolver.isArray
        ? matchingFnForArrays(fieldResolver, values, keys)
        : matchingFnForEntity(fieldResolver, values, keys);
    } catch (error) {
      logger.error(
        `[${fieldResolver.dataloaderName}] Error getting data from ${dbCollectionName} for keys ${keys}`
      );
      logger.error(error);
      return new Array(keys.length).fill(null);
    }
  };
};

export const getNewDataLoaderFromFieldResolver = (
  fieldResolver: GaqFieldResolverDescription,
  dbCollectionNameMap: Map<string, string>,
  gaqDbClient: GaqDbClient
) => {
  const dataloader = new DataLoader<any, any, any>(
    batchLoadFn(fieldResolver, dbCollectionNameMap, gaqDbClient, getLogger()),
    { cache: false }
  );
  return dataloader;
};
