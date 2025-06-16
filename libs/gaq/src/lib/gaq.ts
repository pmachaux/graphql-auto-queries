import { GaqContext, GaqServerOptions } from './interfaces/common.interfaces';
import { getMergedSchemaAndResolvers } from './gql-utils/schema-analyzer';
import { getLogger, setLogger } from './logger';
import { GraphQLSchema, parse } from 'graphql';
import { randomUUID } from 'crypto';
import { analyzeQueryForDataloaders } from './gql-utils/dataloader';

type GqlContextFn = ({ req, res }: { req: any; res: any }) => Promise<any>;

export function getGaqTools<TContext extends GaqContext>(
  config: GaqServerOptions
): {
  gqaSchema: GraphQLSchema;
  withGaqContextFn: ({ req, res }: { req: any; res: any }) => Promise<TContext>;
} {
  setLogger(config.logger);
  const logger = getLogger();

  logger.info('Creating GraphQL Auto Queries Server...');
  try {
    const { schema, gaqResolverDescriptions, dbCollectionNameMap } =
      getMergedSchemaAndResolvers(config);

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
            }).gaqDataloaders
          : new Map(),
        traceId,
      } as unknown as TContext;
    };

    return {
      gqaSchema: schema,
      withGaqContextFn,
    };
  } catch (error) {
    logger.error('Error creating auto schema and resolvers');
    logger.error(error);
    throw error;
  }
}
