import { GaqServer } from './interfaces/common.interfaces';
import { getGraphQLAutoQueriesServer } from './gaq';
import { getMockedDatasource } from './test-utils/mocked-datasource';
import {
  GaqFilterComparators,
  GaqRootQueryFilter,
} from './interfaces/common.interfaces';
import * as request from 'supertest';
import { getDirective, MapperKind, SchemaMapper } from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';
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
        dbClient: getMockedDatasource(),
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
  });
  describe('solving n+1 problem', () => {
    let server: GaqServer;
    let url: string;
    let bookSpy: jest.SpyInstance;
    let authorSpy: jest.SpyInstance;
    let reviewSpy: jest.SpyInstance;
    beforeAll(async () => {
      bookSpy = jest.fn();
      authorSpy = jest.fn();
      reviewSpy = jest.fn();
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
        dbClient: getMockedDatasource({
          bookSpy: bookSpy as any,
          authorSpy: authorSpy as any,
          reviewSpy: reviewSpy as any,
        }),
      });
      ({ url } = await server.startGraphQLAutoQueriesServer({
        listen: { port: 0 },
      }));
    });

    afterAll(async () => {
      await server.stop();
    });

    beforeEach(() => {
      bookSpy.mockClear();
      authorSpy.mockClear();
      reviewSpy.mockClear();
    });
    it('should resolve fields by calling the field resolver only once', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput) {
            bookGaqQueryResult(filters: $filters) {
              result {
                id
                title
                authorId
                author {
                  name
                }
                reviews {
                  id
                  content
                }
              }
            }
          }`,
        variables: {
          filters: {
            and: [],
          } satisfies GaqRootQueryFilter<{
            title: string;
            author: string;
          }>,
        },
      };

      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data?.bookGaqQueryResult.result.length).toEqual(3);
      expect(bookSpy).toHaveBeenCalledTimes(1);
      expect(authorSpy).toHaveBeenCalledTimes(1);
      expect(reviewSpy).toHaveBeenCalledTimes(1);
    });
    it('should not keep the cache after the request is done and recall the datasources on a new query', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput) {
            bookGaqQueryResult(filters: $filters) {
              result {
                id
                title
                authorId
                author {
                  name
                }
                reviews {
                  id
                  content
                }
              }
            }
          }`,
        variables: {
          filters: {
            and: [],
          } satisfies GaqRootQueryFilter<{
            title: string;
            author: string;
          }>,
        },
      };

      await request(url).post('/').send(queryData);
      await request(url).post('/').send(queryData);

      expect(bookSpy).toHaveBeenCalledTimes(2);
      expect(authorSpy).toHaveBeenCalledTimes(2);
      expect(reviewSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('schema transformation support', () => {
    let protectedServer: GaqServer;
    let urlProtectedServer: string;
    let getUserFn: jest.Mock;
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
        dbClient: getMockedDatasource(),
        schemaMapper: (schema: GraphQLSchema) => {
          const typeDirectiveArgumentMaps: Record<string, any> = {};
          return {
            [MapperKind.TYPE]: (type) => {
              const authDirective = getDirective(schema, type, 'auth')?.[0];
              if (authDirective) {
                typeDirectiveArgumentMaps[type.name] = authDirective;
              }
              return undefined;
            },
            [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
              const authDirective =
                getDirective(schema, fieldConfig, 'auth')?.[0] ??
                typeDirectiveArgumentMaps[typeName];
              if (authDirective) {
                const { role } = authDirective;
                if (role) {
                  const { resolve = defaultFieldResolver } = fieldConfig;
                  fieldConfig.resolve = function (source, args, context, info) {
                    const user = getUserFn();
                    if (!user.roles.includes(role)) {
                      throw new Error('not authorized');
                    }
                    return resolve(source, args, context, info);
                  };
                  return fieldConfig;
                }
              }
            },
          } satisfies SchemaMapper;
        },
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
        getUserFn = jest.fn().mockReturnValue({ roles: [] });
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
        expect(response.body.errors?.[0].message).toContain('not authorized');
      });
      it('should prevent the user from querying the protected if he does not have the proper roles', async () => {
        getUserFn = jest.fn().mockReturnValue({ roles: ['user'] });
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
        expect(response.body.errors?.[0].message).toContain('not authorized');
      });
      it('should let the user perform the query if he has the proper roles', async () => {
        getUserFn = jest
          .fn()
          .mockReturnValue({ roles: ['paidUser', 'user', 'admin'] });
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
