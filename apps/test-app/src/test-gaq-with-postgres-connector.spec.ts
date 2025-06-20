import { ApolloServer } from '@apollo/server';
import { GaqContext, GaqFilterComparators } from '@gaq';
import { Client } from 'pg';
import { getPostgresGaqDbConnector } from '@gaq/postgres';
import fs from 'fs';
import { getTestLogger } from '@gaq/mocks';
import { DateTimeResolver } from 'graphql-scalars';
import { startStandaloneServer } from '@apollo/server/standalone';
import { getGaqTools } from '@gaq';
import request from 'supertest';
describe('GaqPostgresConnector', () => {
  let server: ApolloServer<GaqContext>;
  let url: string;
  let postgresClient: Client;
  beforeAll(async () => {
    const ca = fs.readFileSync('./ca.pem');
    const config = {
      host: process.env.PG_HOST,
      port: parseInt(process.env.PG_PORT),
      user: process.env.PG_USER,
      password: process.env.PG_PWD,
      database: process.env.PG_DB,
      ssl: {
        rejectUnauthorized: true,
        ca: ca.toString(),
      },
    };
    const { client, dbAdapter } = await getPostgresGaqDbConnector({
      config,
      logger: getTestLogger(),
    });
    postgresClient = client;

    const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
      typeDefs: `
          scalar DateTime
            type Actor @dbCollection(collectionName: "actor"){
                actor_id: ID
                first_name: String
                last_name: String
                last_update: DateTime
            }
          `,
      dbAdapter,
      logger: getTestLogger(),
    });

    server = new ApolloServer<GaqContext>({
      typeDefs,
      resolvers: {
        DateTime: DateTimeResolver,
        ...resolvers,
      },
    });
    ({ url } = await startStandaloneServer(server, {
      listen: { port: 0 },
      context: async ({ req, res }) => {
        return withGaqContextFn({ req, res });
      },
    }));
  }, 20000);
  afterAll(async () => {
    await server?.stop();
    await postgresClient?.end();
  });
  it('should be able to perform a simple query', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
              actorGaqQueryResult(filters: $filters) {
                result {
                  actor_id
                  first_name
                  last_name
                }
              }
            }`,
      variables: {
        filters: {
          and: [
            {
              key: 'actor_id',
              comparator: GaqFilterComparators.EQUAL,
              value: 1,
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.actorGaqQueryResult.result[0]).toEqual({
      actor_id: 1,
      first_name: 'PENELOPE',
      last_name: 'GUINESS',
    });
  });
});
