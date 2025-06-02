import { ApolloServer, ApolloServerOptions, BaseContext } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import {
  GaqContext,
  GaqServer,
  GaqServerOptions,
} from './interfaces/common.interfaces';
import { omit } from './utils';
import { getMergedSchemaAndResolvers } from './gql-utils/schema-analyzer';

export function getGraphQLAutoQueriesServer(
  config: GaqServerOptions
): GaqServer {
  const schema = getMergedSchemaAndResolvers(config);

  const apolloOnlyConfig = omit(
    config,
    'autoTypes',
    'standardApolloResolvers',
    'standardGraphqlTypes',
    'datasources'
  );

  const apolloConfig = {
    ...apolloOnlyConfig,
    schema,
  } as ApolloServerOptions<GaqContext>;
  const server = new ApolloServer<GaqContext>(apolloConfig);
  return server;
}

export const startGraphQLAutoQueriesServer = startStandaloneServer;
