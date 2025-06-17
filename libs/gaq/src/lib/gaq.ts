import { GaqContext, GaqServerOptions } from './interfaces/common.interfaces';
import { getTypeDefsAndResolvers } from './gql-utils/schema-analyzer';
import { getDefaultLogger } from './logger';
import { parse } from 'graphql';
import { randomUUID } from 'crypto';
import { analyzeQueryForDataloaders } from './gql-utils/dataloader';
import { ApolloServerOptions } from '@apollo/server';

type GqlContextFn = ({ req, res }: { req: any; res: any }) => Promise<any>;

export function getGaqTools<TContext extends GaqContext>(
  config: GaqServerOptions
): {
  typeDefs: ApolloServerOptions<TContext>['typeDefs'];
  resolvers: ApolloServerOptions<TContext>['resolvers'];
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
