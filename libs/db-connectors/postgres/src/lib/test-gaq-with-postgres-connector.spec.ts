/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ApolloServer } from '@apollo/server';
import { GaqContext, GaqFilterComparators, getGaqTools } from '@gaq';
import { Client } from 'pg';
import * as fs from 'fs';
import { getTestLogger } from '@gaq/mocks';
import { DateTimeResolver } from 'graphql-scalars';
import { startStandaloneServer } from '@apollo/server/standalone';
import * as request from 'supertest';
import { getPostgresGaqDbConnector } from './postgres';
import * as path from 'path';
describe('GaqPostgresConnector', () => {
  let server: ApolloServer<GaqContext>;
  let url: string;
  let postgresClient: Client;
  beforeAll(async () => {
    const ca = fs.readFileSync(
      path.resolve(__dirname, '../../../../../ca.pem')
    );
    const config = {
      host: process.env.PG_HOST!,
      port: parseInt(process.env.PG_PORT as string),
      user: process.env.PG_USER!,
      password: process.env.PG_PWD!,
      database: process.env.PG_DB!,
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
                actor_id: Int
                first_name: String
                last_name: String
                last_update: DateTime
                films: [Film] @fieldResolver(parentKey: "actor_id", fieldKey: "film_id") @manyToManyFieldResolver(collectionName: "film_actor", fieldKeyAlias: "film_id", parentKeyAlias: "actor_id")
            }
            type Address @dbCollection(collectionName: "address"){
                address_id: Int
                address: String
                city_id: Int
                city: City @fieldResolver(parentKey: "city_id", fieldKey: "city_id")
            }
            type City @dbCollection(collectionName: "city"){
                city_id: Int
                city: String
                addresses: [Address] @fieldResolver(parentKey: "city_id", fieldKey: "city_id")
            }
            type Film @dbCollection(collectionName: "film"){
                film_id: Int
                title: String
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
                count 
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
    expect(response.body.data?.actorGaqQueryResult.count).toEqual(1);
  });
  it('should be able to query with count only', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            actorGaqQueryResult(filters: $filters) {
              count
            }
          }`,
      variables: {
        filters: {},
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.actorGaqQueryResult.count).toEqual(200);
  });
  it('should be able to query with sorting', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            actorGaqQueryResult(filters: $filters, options: $options) {
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
              key: 'first_name',
              comparator: GaqFilterComparators.EQUAL,
              value: 'JOHNNY',
            },
          ],
        },
        options: {
          sort: [{ key: 'last_name', order: 1 }],
        },
      },
    };
    const responseWithAscendingSort = await request(url)
      .post('/')
      .send(queryData);
    expect(responseWithAscendingSort.body.errors).toBeUndefined();
    expect(
      responseWithAscendingSort.body.data?.actorGaqQueryResult.result[0]
    ).toEqual({
      actor_id: 40,
      first_name: 'JOHNNY',
      last_name: 'CAGE',
    });
    expect(
      responseWithAscendingSort.body.data?.actorGaqQueryResult.result[1]
    ).toEqual({
      actor_id: 5,
      first_name: 'JOHNNY',
      last_name: 'LOLLOBRIGIDA',
    });

    const responseWithDescendingSort = await request(url)
      .post('/')
      .send({
        ...queryData,
        variables: {
          ...queryData.variables,
          filters: {
            ...queryData.variables.filters,
          },
          options: {
            sort: [{ key: 'last_name', order: -1 }],
          },
        },
      });

    expect(
      responseWithDescendingSort.body.data?.actorGaqQueryResult.result[0]
    ).toEqual({
      actor_id: 5,
      first_name: 'JOHNNY',
      last_name: 'LOLLOBRIGIDA',
    });
    expect(
      responseWithDescendingSort.body.data?.actorGaqQueryResult.result[1]
    ).toEqual({
      actor_id: 40,
      first_name: 'JOHNNY',
      last_name: 'CAGE',
    });
  });
  it('should be able to query with limit', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            actorGaqQueryResult(filters: $filters, options: $options) {
              result {
                actor_id
                first_name
                last_name
              }
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'first_name',
              comparator: GaqFilterComparators.EQUAL,
              value: 'JOHNNY',
            },
          ],
        },
        options: {
          sort: [{ key: 'last_name', order: 1 }],
          limit: 1,
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.actorGaqQueryResult.result[0]).toEqual({
      actor_id: 40,
      first_name: 'JOHNNY',
      last_name: 'CAGE',
    });
    expect(response.body.data?.actorGaqQueryResult.count).toEqual(1);
  });
  it('should be able to query with offset', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            actorGaqQueryResult(filters: $filters, options: $options) {
              result {
                actor_id
                first_name
                last_name
              }
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'first_name',
              comparator: GaqFilterComparators.EQUAL,
              value: 'JOHNNY',
            },
          ],
        },
        options: {
          limit: 1,
          sort: [{ key: 'last_name', order: 1 }],
          offset: 1,
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.actorGaqQueryResult.result[0]).toEqual({
      actor_id: 5,
      first_name: 'JOHNNY',
      last_name: 'LOLLOBRIGIDA',
    });
    expect(response.body.data?.actorGaqQueryResult.count).toEqual(1);
  });
  it('should be able to query with many-to-many relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            actorGaqQueryResult(filters: $filters) {
              result {
                actor_id
                first_name
                last_name
                films { 
                  film_id
                  title
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'actor_id',
              comparator: GaqFilterComparators.IN,
              value: [1, 2],
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.actorGaqQueryResult.result[0].actor_id).toBe(1);
    expect(
      response.body.data?.actorGaqQueryResult.result[0].films
    ).toHaveLength(19);
    expect(response.body.data?.actorGaqQueryResult.result[1].actor_id).toBe(2);
    expect(
      response.body.data?.actorGaqQueryResult.result[1].films
    ).toHaveLength(25);
  });
  it('should be able to resolve many to one relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            addressGaqQueryResult(filters: $filters) {
              result {
                address_id
                address
                city_id
                city{
                  city_id
                  city
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'address_id',
              comparator: GaqFilterComparators.EQUAL,
              value: 1,
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.addressGaqQueryResult.result[0].address_id).toBe(
      1
    );
    expect(
      response.body.data?.addressGaqQueryResult.result[0].city.city_id
    ).toBe(300);
    expect(response.body.data?.addressGaqQueryResult.result[0].city.city).toBe(
      'Lethbridge'
    );
  });
  it('should be able to resolve one to many relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            cityGaqQueryResult(filters: $filters) {
              result {
                city_id
                city
                addresses {
                  address_id
                  address
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'city_id',
              comparator: GaqFilterComparators.EQUAL,
              value: 300,
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.cityGaqQueryResult.result[0].city_id).toBe(300);
    expect(response.body.data?.cityGaqQueryResult.result[0].city).toBe(
      'Lethbridge'
    );
    expect(
      response.body.data?.cityGaqQueryResult.result[0].addresses
    ).toHaveLength(2);
    expect(
      response.body.data?.cityGaqQueryResult.result[0].addresses[0].address_id
    ).toBe(1);
    expect(
      response.body.data?.cityGaqQueryResult.result[0].addresses[1].address_id
    ).toBe(3);
  });
});
