import { ApolloServer, ApolloServerOptions, BaseContext } from '@apollo/server';
import {
  startStandaloneServer,
  StartStandaloneServerOptions,
} from '@apollo/server/standalone';
import {
  GaqContext,
  GaqDbClient,
  GaqServer,
  GaqServerOptions,
} from './interfaces/common.interfaces';
import { omit } from './utils';
import { getMergedSchemaAndResolvers } from './gql-utils/schema-analyzer';
import { ListenOptions } from 'net';
import { WithRequired } from './interfaces/ts-wizard.interface';
import { getLogger, setLogger } from './logger';
import { GraphQLSchema } from 'graphql';

export function getGraphQLAutoQueriesServer<TContext extends GaqContext>(
  config: GaqServerOptions
): GaqServer<TContext> {
  setLogger(config.logger);
  const logger = getLogger();
  logger.info('Creating GraphQL Auto Queries Server...');
  let schema: GraphQLSchema;
  try {
    schema = getMergedSchemaAndResolvers(config).schema;
  } catch (error) {
    logger.error('Error creating auto schema and resolvers');
    logger.error(error);
    throw error;
  }

  const apolloOnlyConfig = omit(
    config,
    'autoTypes',
    'standardApolloResolvers',
    'standardGraphqlTypes'
  );

  const apolloConfig = {
    ...apolloOnlyConfig,
    schema,
  } as ApolloServerOptions<TContext>;

  try {
    const server = new ApolloServer<TContext>(apolloConfig);
    (server as GaqServer).startGraphQLAutoQueriesServer = async (
      options?: StartStandaloneServerOptions<BaseContext> & {
        listen?: ListenOptions;
      }
    ) => {
      logger.info('Starting GraphQL Auto Queries Server...');
      let gaqDbClient: GaqDbClient;
      try {
        gaqDbClient = await config.dbConnector.connect();
      } catch (error) {
        logger.error('Error connecting to database');
        logger.error(error);
        throw error;
      }

      const context = async ({ req, res }): Promise<TContext> => {
        const apolloContext = await options?.context?.({ req, res });
        return {
          ...apolloContext,
          gaqDbClient,
        } as unknown as TContext;
      };
      const optionsWithGaqContext = {
        ...options,
        context,
      } satisfies WithRequired<
        StartStandaloneServerOptions<TContext>,
        'context'
      > & {
        listen?: ListenOptions;
      };

      return startStandaloneServer<TContext>(server, optionsWithGaqContext);
    };
    return server as GaqServer<TContext>;
  } catch (error) {
    logger.error('Error building GraphQL Auto Queries Server');
    logger.error(error);
    throw error;
  }
}
