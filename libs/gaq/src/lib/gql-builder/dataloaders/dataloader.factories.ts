import {
  GaqDbAdapter,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';
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
} from '../../utils';
import { batchLoadFnForReferenceResolution } from './entity-dataloader';
import { batchLoadFnForFieldResolution } from './field-dataloader';
import { batchLoadFnForManyToManyFieldResolution } from './mtm-dataloader';

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
  return Array.from(new Set(requestedFields));
};

const getFieldAndMTMDataloadersMap = (
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
  const fieldDataloadersMap = getFieldAndMTMDataloadersMap(ast, opts);
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
