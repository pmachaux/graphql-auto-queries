import { GaqContext, GaqServerOptions } from './interfaces/common.interfaces';
import {
  getSchemaIndex,
  getTypeDefsAndResolvers,
} from './gql-utils/schema-analyzer';
import { getDefaultLogger } from './logger';
import { DocumentNode, parse } from 'graphql';
import { randomUUID } from 'crypto';
import { analyzeQueryForDataloaders } from './gql-utils/dataloaders/dataloader.factories';
import {} from '@apollo/server';
import type { GraphQLResolverMap } from '@apollo/subgraph/dist/schema-helper';

type GqlContextFn = ({ req, res }: { req: any; res: any }) => Promise<any>;

export function getGaqTools<TContext extends GaqContext>(
  config: GaqServerOptions
): {
  typeDefs: DocumentNode;
  resolvers: GraphQLResolverMap<TContext>;
  withGaqContextFn: ({ req, res }: { req: any; res: any }) => Promise<TContext>;
} {
  const logger = config.logger ?? getDefaultLogger();

  logger.info('Creating GraphQL Auto Queries Server...');
  try {
    const {
      typeDefs,
      resolvers,
      gaqResolverDescriptions,
      dbCollectionNameMap,
    } = getTypeDefsAndResolvers(config, { logger });

    const schemaIndex = getSchemaIndex(typeDefs);

    const withGaqContextFn: GqlContextFn = async ({ req, res }) => {
      const ast = req.body.query ? parse(req.body.query) : null;
      const traceId = randomUUID();
      return {
        gaqDbClient: config.dbAdapter,
        gaqDataloaders: ast
          ? analyzeQueryForDataloaders(ast, {
              traceId,
              gaqResolverDescriptions,
              dbCollectionNameMap,
              gaqDbClient: config.dbAdapter,
              logger,
              schemaIndex,
            }).gaqDataloaders
          : new Map(),
        traceId,
      } as unknown as TContext;
    };

    return {
      typeDefs,
      resolvers,
      withGaqContextFn,
    };
  } catch (error) {
    logger.error('Error creating auto schema and resolvers');
    logger.error(error);
    throw error;
  }
}
