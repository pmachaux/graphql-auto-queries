import { GaqServer } from './interfaces/common.interfaces';
import { getGraphQLAutoQueriesServer } from './gaq';
import { getMockedDatasource } from './test-utils/mocked-datasource';
import {
  GaqFilterComparators,
  GaqRootQueryFilter,
} from './interfaces/common.interfaces';
import * as request from 'supertest';
describe('gaq', () => {
  describe('basic features', () => {
    let server: GaqServer;
    let url: string;
    beforeAll(async () => {
      server = getGraphQLAutoQueriesServer({
        autoTypes: `
          type Book @dbCollection(collectionName: "books"){
            id: ID
            title: String
            authorId: String
            author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id")
            reviews: [Review] @fieldResolver(parentKey: "id", fieldKey: "bookId")
          }
        
          type Author @dbCollection(collectionName: "authors"){
            id: ID
            name: String
            books: [Book]
          }

          type Review @dbCollection(collectionName: "reviews"){
            id: ID
            content: String
            bookId: String
            book: Book @fieldResolver(parentKey: "bookId", fieldKey: "id")
          }
        `,
        dbConnector: getMockedDatasource(),
      });
      ({ url } = await server.startGraphQLAutoQueriesServer({
        listen: { port: 0 },
      }));
    });

    afterAll(async () => {
      await server.stop();
    });
    it('should return books when querying bookGaqQueryResult', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput) {
            bookGaqQueryResult(filters: $filters) {
              result {
                title
                authorId
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
                value: 'The Great Gatsby',
              },
            ],
          } satisfies GaqRootQueryFilter<{
            title: string;
            author: string;
          }>,
        },
      };
      const response = await request(url).post('/').send(queryData);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
        title: 'The Great Gatsby',
        authorId: '1',
      });
    });
    it('should be able to retun the author name when querying bookGaqQueryResult', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput) {
            bookGaqQueryResult(filters: $filters) {
              result {
                title
                authorId
                author {
                  name
                }
              }
            }
          }`,
        variables: {
          filters: {
            and: [
              {
                key: 'title',
                comparator: GaqFilterComparators.EQUAL,
                value: 'The Great Gatsby',
              },
            ],
          } satisfies GaqRootQueryFilter<{
            title: string;
            author: string;
          }>,
        },
      };
      const response = await request(url).post('/').send(queryData);

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
        title: 'The Great Gatsby',
        authorId: '1',
        author: {
          name: 'F. Scott Fitzgerald',
        },
      });
    });
    it('should be able to resolve fields that are arrays', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput) {
            bookGaqQueryResult(filters: $filters) {
              result {
                title
                id
                reviews {
                  id
                  content
                }
              }
            }
          }`,
        variables: {
          filters: {
            and: [
              {
                key: 'title',
                comparator: GaqFilterComparators.EQUAL,
                value: 'The Great Gatsby',
              },
            ],
          },
        },
      };
      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
        title: 'The Great Gatsby',
        id: '1',
        reviews: [
          { id: '1', content: 'Great book' },
          { id: '2', content: 'I loved it' },
        ],
      });
    });
    it('should be able to support custom directives such as authentication through a schema mapper', async () => {});
  });

  describe('schema transformation support', () => {
    let protectedServer: GaqServer;
    let urlProtectedServer: string;
    beforeAll(async () => {
      protectedServer = getGraphQLAutoQueriesServer({
        autoTypes: `
          directive @auth(
            role: String!,
          ) on OBJECT | FIELD_DEFINITION

          type Book @dbCollection(collectionName: "books") @auth(role: "user"){
            id: ID
            title: String
            authorId: String @auth(role: "admin")
            author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id") @auth(role: "paidUser")
          }
        
          type Author @dbCollection(collectionName: "authors"){
            id: ID
            name: String
            books: [Book]
          }
        `,
        dbConnector: getMockedDatasource(),
      });
      ({ url: urlProtectedServer } =
        await protectedServer.startGraphQLAutoQueriesServer({
          listen: { port: 0 },
        }));
    });
    afterAll(async () => {
      await protectedServer.stop();
    });
    describe('authentication support', () => {
      it('should prevent the user from querying Book if he does not have the role user', async () => {
        const queryData = {
          query: `query($filters: GaqRootFiltersInput) {
              bookGaqQueryResult(filters: $filters) {
                result {
                  title
                }
              }
            }`,
          variables: {
            filters: {
              and: [
                {
                  key: 'title',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'The Great Gatsby',
                },
              ],
            } satisfies GaqRootQueryFilter<{
              title: string;
              author: string;
            }>,
          },
        };
        const response = await request(urlProtectedServer)
          .post('/')
          .send(queryData);
        expect(response.body.errors).toBeDefined();
      });
      it('should prevent the user from querying the protected if he does not have the proper roles', async () => {
        const queryData = {
          query: `query($filters: GaqRootFiltersInput) {
              bookGaqQueryResult(filters: $filters) {
                result {
                  title
                  authorId
                  author {
                    name
                  }
                }
              }
            }`,
          variables: {
            filters: {
              and: [
                {
                  key: 'title',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'The Great Gatsby',
                },
              ],
            } satisfies GaqRootQueryFilter<{
              title: string;
              author: string;
            }>,
          },
        };
        const response = await request(urlProtectedServer)
          .post('/')
          .send(queryData);
        expect(response.body.errors).toBeDefined();
      });
      it('should let the user perform the query if he has the proper roles', async () => {
        const queryData = {
          query: `query($filters: GaqRootFiltersInput) {
              bookGaqQueryResult(filters: $filters) {
                result {
                  title
                  authorId
                  author {
                    name
                  }
                }
              }
            }`,
          variables: {
            filters: {
              and: [
                {
                  key: 'title',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'The Great Gatsby',
                },
              ],
            } satisfies GaqRootQueryFilter<{
              title: string;
              author: string;
            }>,
          },
        };
        const response = await request(urlProtectedServer)
          .post('/')
          .send(queryData);
        expect(response.body.errors).toBeUndefined();
        expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
          title: 'The Great Gatsby',
          authorId: '1',
          author: {
            name: 'F. Scott Fitzgerald',
          },
        });
      });
    });
  });
});
