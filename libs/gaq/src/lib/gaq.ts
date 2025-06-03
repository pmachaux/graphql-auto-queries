import { ApolloServer, ApolloServerOptions, BaseContext } from '@apollo/server';
import {
  startStandaloneServer,
  StartStandaloneServerOptions,
} from '@apollo/server/standalone';
import {
  GaqContext,
  GaqServer,
  GaqServerOptions,
} from './interfaces/common.interfaces';
import { omit } from './utils';
import { getMergedSchemaAndResolvers } from './gql-utils/schema-analyzer';
import { ListenOptions } from 'net';
import { WithRequired } from './interfaces/ts-wizard.interface';

export function getGraphQLAutoQueriesServer<TContext extends GaqContext>(
  config: GaqServerOptions
): GaqServer<TContext> {
  const schema = getMergedSchemaAndResolvers(config).schema;

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

  const server = new ApolloServer<TContext>(apolloConfig);
  (server as GaqServer).startGraphQLAutoQueriesServer = async (
    options?: StartStandaloneServerOptions<BaseContext> & {
      listen?: ListenOptions;
    }
  ) => {
    const context = async ({ req, res }): Promise<TContext> => {
      const apolloContext = await options?.context?.({ req, res });
      return {
        ...apolloContext,
        gaqDbClient: await config.dbConnector.connect(),
      } as TContext;
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
}

/* 
export async function startStandaloneServer(
  server: ApolloServer<BaseContext>,
  options?: StartStandaloneServerOptions<BaseContext> & {
    listen?: ListenOptions;
  },
): Promise<{ url: string }>;
export async function startStandaloneServer<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  options: WithRequired<StartStandaloneServerOptions<TContext>, 'context'> & {
    listen?: ListenOptions;
  },
): Promise<{ url: string }>;
export async function startStandaloneServer<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  options?: StartStandaloneServerOptions<TContext> & { listen?: ListenOptions },
): Promise<{ url: string }> {
  const app: express.Express = express();
  const httpServer: http.Server = http.createServer(app);

  server.addPlugin(
    ApolloServerPluginDrainHttpServer({ httpServer: httpServer }),
  );

  await server.start();

  const context = options?.context ?? (async () => ({}) as TContext);
  app.use(
    cors(),
    express.json({ limit: '50mb' }),
    expressMiddleware(server, { context }),
  );

  const listenOptions = options?.listen ?? { port: 4000 };
  // Wait for server to start listening
  await new Promise<void>((resolve) => {
    httpServer.listen(listenOptions, resolve);
  });

  return { url: urlForHttpServer(httpServer) };
}

*/
