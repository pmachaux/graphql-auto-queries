import {
  GaqDbClient,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqResolverDescription,
} from '../interfaces/common.interfaces';
import * as DataLoader from 'dataloader';

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

export const batchLoadFn = <
  T extends object = object,
  K extends object = object
>(
  fieldResolver: GaqFieldResolverDescription,
  gaqResolverDescription: GaqResolverDescription,
  gaqDbClient: GaqDbClient,
  logger: GaqLogger
): DataLoader.BatchLoadFn<string, T | T[] | null> => {
  return async (keys: string[]) => {
    logger.debug(
      `Getting data from ${gaqResolverDescription.dbCollectionName} for keys ${keys}`
    );
    const collectionClient = gaqDbClient.collection(
      gaqResolverDescription.dbCollectionName
    );
    if (!collectionClient) {
      logger.error(
        `No collection client found for ${gaqResolverDescription.dbCollectionName}`
      );
      return [];
    }
    try {
      const values = await collectionClient.getValuesInField({
        field: fieldResolver.fieldKey,
        values: keys,
      });
      logger.debug(
        `Found ${values.length} values for ${gaqResolverDescription.dbCollectionName}`
      );
      return fieldResolver.isArray
        ? matchingFnForArrays(fieldResolver, values, keys)
        : matchingFnForEntity(fieldResolver, values, keys);
    } catch (error) {
      logger.error(
        `Error getting data from ${gaqResolverDescription.dbCollectionName} for keys ${keys}`
      );
      logger.error(error);
      return [];
    }
  };
};

export const getNewDataLoaderFromFieldResolver = (
  fieldResolver: GaqFieldResolverDescription,
  gaqResolverDescription: GaqResolverDescription,
  gaqDbClient: GaqDbClient,
  logger: GaqLogger
) => {
  const dataloader = new DataLoader<any, any, any>(
    batchLoadFn(fieldResolver, gaqResolverDescription, gaqDbClient, logger)
  );
  return dataloader;
};
