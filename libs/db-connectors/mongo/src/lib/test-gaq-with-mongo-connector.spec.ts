import {
  GaqContext,
  GaqFilterComparators,
  getGaqTools,
} from '@graphql-auto-queries/core';
import { getMongoGaqDbConnector } from './mongo';
import { MongoClient } from 'mongodb';
import { DateTimeResolver } from 'graphql-scalars';
import * as request from 'supertest';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { getTestLogger } from '@graphql-auto-queries/mocks';

describe('Testing Gaq With Mongo connector', () => {
  let server: ApolloServer<GaqContext>;
  let url: string;
  let mongoClient: MongoClient;
  beforeAll(async () => {
    const { client, dbAdapter } = await getMongoGaqDbConnector({
      uri: process.env.MONGO_URI,
      dbName: 'sample_mflix',
    });
    mongoClient = client;
    const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
      typeDefs: `
        scalar DateTime
          type Movie @dbCollection(collectionName: "movies"){
            _id: ID
            title: String
            year: Int
            released: DateTime
            comments: [Comment] @fieldResolver(parentKey: "_id", fieldKey: "movie_id")
            runningIn: [Theater] @fieldResolver(parentKey: "_id", fieldKey: "_id") @manyToManyFieldResolver(collectionName: "movies_theaters", fieldKeyAlias: "theater_id", parentKeyAlias: "movie_id")
          }
        
          type Comment @dbCollection(collectionName: "comments"){
            _id: ID
            name: String
            movie_id: String
            movie: Movie @fieldResolver(parentKey: "movie_id", fieldKey: "_id")
            date: DateTime
          }

          type Theater @dbCollection(collectionName: "theaters"){
            _id: ID
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
    await server.stop();
    await mongoClient.close();
  });
  it('create a gaq server with a mongo connector and make a simple query with fields to resolve', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            movieGaqQueryResult(filters: $filters) {
              result {
                _id
                title
                year
                comments {
                  name
                  date
                }
              }
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Four Horsemen of the Apocalypse',
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.movieGaqQueryResult.result[0]).toEqual({
      _id: '573a1391f29313caabcd70b4',
      title: 'The Four Horsemen of the Apocalypse',
      year: 1921,
      comments: [
        {
          name: 'Olenna Tyrell',
          date: '2007-06-27T20:27:44.000Z',
        },
      ],
    });
    expect(response.body.data?.movieGaqQueryResult.count).toEqual(1);
  });
  it('should be able to query with count only', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            movieGaqQueryResult(filters: $filters) {
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Four Horsemen of the Apocalypse',
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.movieGaqQueryResult.count).toEqual(1);
  });
  it('should be able to query with sorting', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            movieGaqQueryResult(filters: $filters, options: $options) {
              result {
                _id
                released
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'released',
              comparator: GaqFilterComparators.GREATER,
              value: new Date('2016-03-04'),
            },
          ],
        },
        options: {
          sort: [{ key: 'released', order: 1 }],
        },
      },
    };
    const responseWithAscendingSort = await request(url)
      .post('/')
      .send(queryData);
    expect(responseWithAscendingSort.body.errors).toBeUndefined();
    expect(
      responseWithAscendingSort.body.data?.movieGaqQueryResult.result[0]
    ).toEqual({
      _id: '573a13d6f29313caabda10e6',
      released: '2016-03-04T00:00:00.000Z',
    });
    expect(
      responseWithAscendingSort.body.data?.movieGaqQueryResult.result[1]
    ).toEqual({
      _id: '573a13f8f29313caabde8d7a',
      released: '2016-03-23T00:00:00.000Z',
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
            sort: [{ key: 'released', order: -1 }],
          },
        },
      });

    expect(
      responseWithDescendingSort.body.data?.movieGaqQueryResult.result[0]
    ).toEqual({
      _id: '573a13f8f29313caabde8d7a',
      released: '2016-03-23T00:00:00.000Z',
    });
    expect(
      responseWithDescendingSort.body.data?.movieGaqQueryResult.result[1]
    ).toEqual({
      _id: '573a13d6f29313caabda10e6',
      released: '2016-03-04T00:00:00.000Z',
    });
  });
  it('should be able to query with limit', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            movieGaqQueryResult(filters: $filters, options: $options) {
              result {
                _id
              }
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'released',
              comparator: GaqFilterComparators.GREATER,
              value: new Date('2014-03-04'),
            },
          ],
        },
        options: {
          limit: 2,
          sort: [{ key: 'released', order: 1 }],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.movieGaqQueryResult.result[0]).toEqual({
      _id: '573a13e8f29313caabdc9c3a',
    });
    expect(response.body.data?.movieGaqQueryResult.result[1]).toEqual({
      _id: '573a13d8f29313caabda53e0',
    });
    expect(response.body.data?.movieGaqQueryResult.count).toEqual(2);
  });
  it('should be able to query with offset', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            movieGaqQueryResult(filters: $filters, options: $options) {
              result {
                _id
              }
              count
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'released',
              comparator: GaqFilterComparators.GREATER,
              value: new Date('2014-03-04'),
            },
          ],
        },
        options: {
          limit: 2,
          sort: [{ key: 'released', order: 1 }],
          offset: 1,
        },
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.movieGaqQueryResult.result[0]).toEqual({
      _id: '573a13def29313caabdb6575',
    });
    expect(response.body.data?.movieGaqQueryResult.result[1]).toEqual({
      _id: '573a13d8f29313caabda53e0',
    });
    expect(response.body.data?.movieGaqQueryResult.count).toEqual(2);
  });
  it('should be able to select all when no filters are passed', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            movieGaqQueryResult(filters: $filters) {
              count
            }
          }`,
      variables: {
        filters: {},
      },
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.movieGaqQueryResult.count).toEqual(21349);
  });
  it('should be able to resolve one to many relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            movieGaqQueryResult(filters: $filters) {
              result {
                _id
                title
                comments {
                  name
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: '_id',
              comparator: GaqFilterComparators.EQUAL,
              value: '573a1397f29313caabce8bad',
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data?.movieGaqQueryResult.result[0].comments
    ).toHaveLength(2);
    expect(
      response.body.data?.movieGaqQueryResult.result[0].comments[0].name
    ).toBe('Bronn');
    expect(
      response.body.data?.movieGaqQueryResult.result[0].comments[1].name
    ).toBe('Mace Tyrell');
  });
  it('should be able to resolve many to one relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            commentGaqQueryResult(filters: $filters) {
              result {
                name
                movie_id
                movie {
                  _id
                  title
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: 'movie_id',
              comparator: GaqFilterComparators.EQUAL,
              value: '573a1397f29313caabce8bad',
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data?.commentGaqQueryResult.result[0].movie.title
    ).toBe('The Moon in the Gutter');
    expect(response.body.data?.commentGaqQueryResult.result[0].name).toBe(
      'Bronn'
    );
    expect(response.body.data?.commentGaqQueryResult.result[0].movie._id).toBe(
      '573a1397f29313caabce8bad'
    );
    expect(response.body.data?.commentGaqQueryResult.result[1].name).toBe(
      'Mace Tyrell'
    );
    expect(response.body.data?.commentGaqQueryResult.result[1].movie._id).toBe(
      '573a1397f29313caabce8bad'
    );
  });
  it('should be able to resolve many to many relationship', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput!) {
            movieGaqQueryResult(filters: $filters) {
              result {
                _id
                title
                runningIn {
                  _id
                }
              }
            }
          }`,
      variables: {
        filters: {
          and: [
            {
              key: '_id',
              comparator: GaqFilterComparators.EQUAL,
              value: '573a1390f29313caabcd42e8',
            },
          ],
        },
      },
    };
    const response = await request(url).post('/').send(queryData);
    expect(response.body.errors).toBeUndefined();
    expect(
      response.body.data?.movieGaqQueryResult.result[0].runningIn
    ).toHaveLength(2);
    const sortedRunningIn =
      response.body.data?.movieGaqQueryResult.result[0].runningIn.sort((a, b) =>
        a._id.localeCompare(b._id)
      );
    expect(sortedRunningIn[0]._id).toBe('59a47286cfa9a3a73e51e72c');
    expect(sortedRunningIn[1]._id).toBe('59a47286cfa9a3a73e51e72d');
  });
});
