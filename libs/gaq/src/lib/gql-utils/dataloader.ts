import {
  GaqDbAdapter,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqResolverDescription,
} from '../interfaces/common.interfaces';
import DataLoader = require('dataloader');
import { getLogger } from '../logger';
import {
  DocumentNode,
  FieldNode,
  Kind,
  OperationDefinitionNode,
} from 'graphql';

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

export const batchLoadFn =
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

export const createDataLoaderFactory = ({
  requestedFields,
  traceId,
  fieldResolver,
  dbCollectionNameMap,
  gaqDbClient,
}: {
  requestedFields: string[];
  traceId: string;
  fieldResolver: GaqFieldResolverDescription;
  dbCollectionNameMap: Map<string, string>;
  gaqDbClient: GaqDbAdapter;
}) => {
  const batchFn = batchLoadFn({ requestedFields, traceId });
  return new DataLoader<any, any, any>(
    batchFn(fieldResolver, dbCollectionNameMap, gaqDbClient, getLogger())
  );
};

const findRequestedFieldsForDataloaderFromQueryDefinition = (
  queryDefinition: OperationDefinitionNode,
  resolverDescription: GaqResolverDescription,
  fieldResolver: GaqFieldResolverDescription
): string[] => {
  const requestedFields: string[] = [fieldResolver.fieldKey];
  const fieldSelection = queryDefinition.selectionSet.selections.find(
    (selection) =>
      selection.kind === Kind.FIELD &&
      selection.name.value === resolverDescription.queryName
  ) as FieldNode | undefined;

  if (fieldSelection?.selectionSet) {
    const resultSelection = fieldSelection.selectionSet.selections.find(
      (selection) =>
        selection.kind === Kind.FIELD && selection.name.value === 'result'
    ) as FieldNode | undefined;

    if (resultSelection?.selectionSet) {
      const linkedTypeSelection = resultSelection.selectionSet.selections.find(
        (selection) =>
          selection.kind === Kind.FIELD &&
          selection.name.value === fieldResolver.fieldName
      ) as FieldNode | undefined;

      if (linkedTypeSelection?.selectionSet) {
        linkedTypeSelection.selectionSet.selections.forEach((selection) => {
          if (selection.kind === Kind.FIELD) {
            requestedFields.push(selection.name.value);
          }
        });
      }
    }
  }
  return requestedFields;
};

export const analyzeQueryForDataloaders = (
  ast: DocumentNode,
  opts: {
    traceId: string;
    gaqResolverDescriptions: GaqResolverDescription[];
    dbCollectionNameMap: Map<string, string>;
    gaqDbClient: GaqDbAdapter;
  }
): { gaqDataloaders: Map<string, DataLoader<any, any, any>> } => {
  const gaqDataloaders = new Map<string, DataLoader<any, any, any>>();

  const queryDefinition = ast.definitions.find(
    (def) => def.kind === Kind.OPERATION_DEFINITION && def.operation === 'query'
  );
  if (!queryDefinition || queryDefinition.kind !== Kind.OPERATION_DEFINITION) {
    return { gaqDataloaders };
  }

  const queryName = (queryDefinition.selectionSet.selections[0] as FieldNode)
    ?.name?.value;
  if (!queryName) {
    return { gaqDataloaders };
  }
  const resolverDescription = opts.gaqResolverDescriptions.find(
    (resolver) => resolver.queryName === queryName
  );
  if (!resolverDescription) {
    return { gaqDataloaders };
  }

  resolverDescription.fieldResolvers.forEach((fieldResolver) => {
    const dataloader = createDataLoaderFactory({
      requestedFields: findRequestedFieldsForDataloaderFromQueryDefinition(
        queryDefinition,
        resolverDescription,
        fieldResolver
      ),
      traceId: opts.traceId,
      fieldResolver,
      dbCollectionNameMap: opts.dbCollectionNameMap,
      gaqDbClient: opts.gaqDbClient,
    });
    const dataloaderName = `${resolverDescription.linkedType}${fieldResolver.fieldName}Dataloader`;
    gaqDataloaders.set(dataloaderName, dataloader);
  });

  return { gaqDataloaders };
};
