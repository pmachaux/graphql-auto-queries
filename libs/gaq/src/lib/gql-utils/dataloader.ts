import {
  GaqDbAdapter,
  GaqFieldResolverDescription,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqLogger,
  GaqResolverDescription,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';
import DataLoader = require('dataloader');
import {
  DocumentNode,
  FieldNode,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
} from 'graphql';
import {
  getFieldDataloaderName,
  getManyToManyFieldDataloaderName,
} from '../utils';

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

const matchingFnForReferenceResolution = <T extends object = object>(
  resolverDescription: GaqResolverDescription,
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

export const createFieldDataLoaderFactory = ({
  requestedFields,
  traceId,
  fieldResolver,
  dbCollectionNameMap,
  gaqDbClient,
  logger,
}: {
  requestedFields: string[];
  traceId: string;
  fieldResolver: GaqFieldResolverDescription;
  dbCollectionNameMap: Map<string, string>;
  gaqDbClient: GaqDbAdapter;
  logger: GaqLogger;
}) => {
  const batchFn = batchLoadFnForFieldResolution({ requestedFields, traceId });
  return new DataLoader<any, any, any>(
    batchFn(fieldResolver, dbCollectionNameMap, gaqDbClient, logger)
  );
};

export const createManyToManyFieldDataLoaderFactory = ({
  requestedFields,
  traceId,
  fieldResolver,
  dbCollectionNameMap,
  gaqDbClient,
  logger,
}: {
  requestedFields: string[];
  traceId: string;
  fieldResolver: GaqFieldResolverDescription;
  dbCollectionNameMap: Map<string, string>;
  gaqDbClient: GaqDbAdapter;
  logger: GaqLogger;
}) => {
  const batchFn = batchLoadFnForManyToManyFieldResolution({
    requestedFields,
    traceId,
  });
  return new DataLoader<any, any, any>(
    batchFn(fieldResolver, dbCollectionNameMap, gaqDbClient, logger)
  );
};

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
        return matchingFnForReferenceResolution(
          resolverDescription,
          values,
          keyRecords
        );
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

export const createrReferenceDataLoaderFactory = ({
  requestedFields,
  traceId,
  resolverDescription,
  dbCollectionNameMap,
  gaqDbClient,
  logger,
}: {
  requestedFields: string[];
  traceId: string;
  resolverDescription: GaqResolverDescription;
  dbCollectionNameMap: Map<string, string>;
  gaqDbClient: GaqDbAdapter;
  logger: GaqLogger;
}) => {
  const batchFn = batchLoadFnForReferenceResolution({
    requestedFields,
    traceId,
  });
  return new DataLoader<any, any, any>(
    batchFn(resolverDescription, dbCollectionNameMap, gaqDbClient, logger)
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

const getFieldDataloadersMap = (
  ast: DocumentNode,
  opts: {
    traceId: string;
    gaqResolverDescriptions: GaqResolverDescription[];
    dbCollectionNameMap: Map<string, string>;
    gaqDbClient: GaqDbAdapter;
    logger: GaqLogger;
  }
): { fieldDataloaders: Map<string, DataLoader<any, any, any>> } => {
  const fieldDataloaders = new Map<string, DataLoader<any, any, any>>();

  const queryDefinition = ast.definitions.find(
    (def) => def.kind === Kind.OPERATION_DEFINITION && def.operation === 'query'
  );
  if (!queryDefinition || queryDefinition.kind !== Kind.OPERATION_DEFINITION) {
    return { fieldDataloaders };
  }

  const queryName = (queryDefinition.selectionSet.selections[0] as FieldNode)
    ?.name?.value;
  if (!queryName) {
    return { fieldDataloaders };
  }
  const resolverDescription = opts.gaqResolverDescriptions.find(
    (resolver) => resolver.queryName === queryName
  );
  if (!resolverDescription) {
    return { fieldDataloaders };
  }

  resolverDescription.fieldResolvers.forEach((fieldResolver) => {
    const dataloader = createFieldDataLoaderFactory({
      requestedFields: findRequestedFieldsForDataloaderFromQueryDefinition(
        queryDefinition,
        resolverDescription,
        fieldResolver
      ),
      traceId: opts.traceId,
      fieldResolver,
      dbCollectionNameMap: opts.dbCollectionNameMap,
      gaqDbClient: opts.gaqDbClient,
      logger: opts.logger,
    });
    const dataloaderName = getFieldDataloaderName({
      typeName: resolverDescription.linkedType,
      fieldName: fieldResolver.fieldName,
    });
    fieldDataloaders.set(dataloaderName, dataloader);

    if (fieldResolver.mtmCollectionName) {
      const manyToManyFieldResolver = createManyToManyFieldDataLoaderFactory({
        requestedFields: findRequestedFieldsForDataloaderFromQueryDefinition(
          queryDefinition,
          resolverDescription,
          fieldResolver
        ),
        traceId: opts.traceId,
        fieldResolver,
        dbCollectionNameMap: opts.dbCollectionNameMap,
        gaqDbClient: opts.gaqDbClient,
        logger: opts.logger,
      });
      const manyToManyDataloaderName = getManyToManyFieldDataloaderName({
        typeName: resolverDescription.linkedType,
        fieldName: fieldResolver.fieldName,
      });
      fieldDataloaders.set(manyToManyDataloaderName, manyToManyFieldResolver);
    }
  });

  return { fieldDataloaders: fieldDataloaders };
};

function getEntitiesRequestedTypesAndFields(ast: DocumentNode): {
  type: string;
  fields: string[];
}[] {
  // Find the operation definition (query)
  const op = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION && def.operation === 'query'
  );
  if (!op) return [];

  // Find the _entities field in the selection set
  const entitiesField = op.selectionSet.selections.find(
    (sel): sel is any =>
      sel.kind === Kind.FIELD && sel.name.value === '_entities'
  );
  if (!entitiesField || !entitiesField.selectionSet) return [];

  // For each inline fragment (e.g., ... on Book), extract type and fields
  return entitiesField.selectionSet.selections
    .filter((sel): sel is any => sel.kind === Kind.INLINE_FRAGMENT)
    .map((frag) => ({
      type: frag.typeCondition.name.value,
      fields: frag.selectionSet.selections
        .filter((s: SelectionNode) => s.kind === Kind.FIELD)
        .map((s: any) => s.name.value),
    }));
}

export const getReferenceDataloadersMap = (
  ast: DocumentNode,
  opts: {
    traceId: string;
    gaqResolverDescriptions: GaqResolverDescription[];
    dbCollectionNameMap: Map<string, string>;
    gaqDbClient: GaqDbAdapter;
    logger: GaqLogger;
  }
): {
  referenceDataloadersMap: Map<string, DataLoader<any, any, any>>;
} => {
  const referenceDataloadersMap = new Map<string, DataLoader<any, any, any>>();

  const entitiesRequestedTypesAndFields =
    getEntitiesRequestedTypesAndFields(ast);

  entitiesRequestedTypesAndFields.forEach(({ type, fields }) => {
    const resolverDescription = opts.gaqResolverDescriptions.find(
      (resolver) => resolver.linkedType === type
    );
    if (!resolverDescription) {
      return;
    }
    const dataloader = createrReferenceDataLoaderFactory({
      requestedFields: fields,
      traceId: opts.traceId,
      resolverDescription,
      dbCollectionNameMap: opts.dbCollectionNameMap,
      gaqDbClient: opts.gaqDbClient,
      logger: opts.logger,
    });
    const dataloaderName = `${resolverDescription.linkedType}federationReferenceDataloader`;
    referenceDataloadersMap.set(dataloaderName, dataloader);
  });
  return { referenceDataloadersMap };
};

export const analyzeQueryForDataloaders = (
  ast: DocumentNode,
  opts: {
    traceId: string;
    gaqResolverDescriptions: GaqResolverDescription[];
    dbCollectionNameMap: Map<string, string>;
    gaqDbClient: GaqDbAdapter;
    logger: GaqLogger;
  }
): { gaqDataloaders: Map<string, DataLoader<any, any, any>> } => {
  const fieldDataloadersMap = getFieldDataloadersMap(ast, opts);
  const referenceDataloadersMap = getReferenceDataloadersMap(ast, opts);

  const gaqDataloaders = new Map<string, DataLoader<any, any, any>>();

  // Merge field dataloaders
  fieldDataloadersMap.fieldDataloaders.forEach((dataloader, key) => {
    gaqDataloaders.set(key, dataloader);
  });

  // Merge reference dataloaders
  referenceDataloadersMap.referenceDataloadersMap.forEach((dataloader, key) => {
    gaqDataloaders.set(key, dataloader);
  });

  return {
    gaqDataloaders,
  };
};
