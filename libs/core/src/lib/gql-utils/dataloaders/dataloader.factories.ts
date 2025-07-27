import {
  GaqDbAdapter,
  GaqFieldResolverDescription,
  GaqLogger,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';
import DataLoader = require('dataloader');
import { DocumentNode } from 'graphql';
import {
  getFieldDataloaderName,
  getTypeDataLoaderName,
  isFieldResolverInQuery,
  isTypeResolverInQuery,
} from '../../utils';
import { batchLoadFnForReferenceResolution } from './entity-dataloader';
import { batchLoadFnForFieldResolution } from './field-dataloader';
import { batchLoadFnForManyToManyFieldResolution } from './mtm-dataloader';
import { findAllTypesInQueries } from './dataloaders.utils';

const createFieldDataLoaderFactory = ({
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

const createManyToManyFieldDataLoaderFactory = ({
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

const createrReferenceDataLoaderFactory = ({
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
  const gaqDataloaders = new Map<string, DataLoader<any, any, any>>();

  findAllTypesInQueries(ast, opts.gaqResolverDescriptions).forEach(
    (resolver) => {
      if (isTypeResolverInQuery(resolver)) {
        const dataloader = createrReferenceDataLoaderFactory({
          requestedFields: resolver.selectionFields,
          traceId: opts.traceId,
          resolverDescription: resolver.typeResolver,
          dbCollectionNameMap: opts.dbCollectionNameMap,
          gaqDbClient: opts.gaqDbClient,
          logger: opts.logger,
        });
        gaqDataloaders.set(
          getTypeDataLoaderName(resolver.typeResolver),
          dataloader
        );
      }
      if (isFieldResolverInQuery(resolver)) {
        if (resolver.fieldResolver.mtmDataloaderName) {
          const dataloader = createManyToManyFieldDataLoaderFactory({
            requestedFields: resolver.selectionFields,
            traceId: opts.traceId,
            fieldResolver: resolver.fieldResolver,
            dbCollectionNameMap: opts.dbCollectionNameMap,
            gaqDbClient: opts.gaqDbClient,
            logger: opts.logger,
          });
          gaqDataloaders.set(
            resolver.fieldResolver.mtmDataloaderName,
            dataloader
          );
        } else {
          const dataloader = createFieldDataLoaderFactory({
            requestedFields: resolver.selectionFields,
            traceId: opts.traceId,
            fieldResolver: resolver.fieldResolver,
            dbCollectionNameMap: opts.dbCollectionNameMap,
            gaqDbClient: opts.gaqDbClient,
            logger: opts.logger,
          });
          const dataloaderName = getFieldDataloaderName({
            typeName: resolver.parentResolver.linkedType,
            fieldName: resolver.fieldResolver.fieldName,
          });
          gaqDataloaders.set(dataloaderName, dataloader);
        }
      }
    }
  );

  return {
    gaqDataloaders,
  };
};
