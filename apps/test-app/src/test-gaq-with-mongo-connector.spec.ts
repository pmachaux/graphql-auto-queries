import {
  GaqFilterComparators,
  GaqServer,
  getGraphQLAutoQueriesServer,
} from '@gaq';
import { getMongoGaqDbConnector } from '@gaq/mongo';
import { MongoClient } from 'mongodb';
import { DateTimeResolver } from 'graphql-scalars';
import request from 'supertest';

describe('Testing Gaq With Mongo connector', () => {
  let server: GaqServer;
  let url: string;
  let mongoClient: MongoClient;
  beforeAll(async () => {
    const { client, dbAdapter } = await getMongoGaqDbConnector({
      uri: process.env.MONGO_URI,
      dbName: 'sample_mflix',
    });
    mongoClient = client;
    server = getGraphQLAutoQueriesServer({
      autoTypes: `
          type Movie @dbCollection(collectionName: "movies"){
            _id: ID
            title: String
            year: Int
            comments: [Comment] @fieldResolver(parentKey: "_id", fieldKey: "movie_id")
          }
        
          type Comment @dbCollection(collectionName: "comments"){
            _id: ID
            name: String
            movie_id: String
            movie: Movie @fieldResolver(parentKey: "movie_id", fieldKey: "_id")
            date: DateTime
          }
  
        `,
      standardGraphqlTypes: `
          scalar DateTime
        `,
      standardApolloResolvers: {
        DateTime: DateTimeResolver,
      },
      dbAdapter,
    });
    ({ url } = await server.startGraphQLAutoQueriesServer({
      listen: { port: 0 },
    }));
  }, 20000);

  afterAll(async () => {
    await server.stop();
    await mongoClient.close();
  });
  it('create a gaq server with a mongo connector and make a simple query with fields to resolve', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput) {
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
      title: 'The Great Gatsby',
      authorId: '1',
    });
  });
});
