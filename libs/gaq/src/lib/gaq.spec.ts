import { getGaqTools } from './gaq';
import { getMockedDatasource } from './test-utils/mocked-datasource';
import {
  GaqContext,
  GaqFilterComparators,
  GaqRootQueryFilter,
} from './interfaces/common.interfaces';
import * as request from 'supertest';
import {
  getDirective,
  MapperKind,
  mapSchema,
  SchemaMapper,
} from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { getTestLogger } from '../mocks';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
describe('gaq', () => {
  describe('basic features', () => {
    let server: ApolloServer<GaqContext>;
    let url: string;
    let bookSpy: jest.SpyInstance;
    let bookCountSpy: jest.SpyInstance;
    beforeAll(async () => {
      bookSpy = jest.fn();
      bookCountSpy = jest.fn();
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
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
        dbAdapter: getMockedDatasource({
          bookSpy: bookSpy as any,
          bookCountSpy: bookCountSpy as any,
        }),
      });
      server = new ApolloServer<GaqContext>({
        typeDefs,
        resolvers,
      });
      ({ url } = await startStandaloneServer(server, {
        listen: { port: 0 },
        context: async ({ req, res }) => {
          return withGaqContextFn({ req, res });
        },
      }));
    });
    beforeEach(() => {
      bookSpy.mockClear();
      bookCountSpy.mockClear();
    });

    afterAll(async () => {
      await server.stop();
    });
    it('should return books when querying bookGaqQueryResult', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            bookGaqQueryResult(filters: $filters, options: $options) {
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
    it('should return books when querying bookGaqQueryResult even if the filters are passed inline and not in the variables', async () => {
      const queryData = {
        query: `query {
            bookGaqQueryResult(filters: {
              and: [
                {
                  key: "title",
                  comparator: "==",
                  value: "The Great Gatsby",
                },
              ],
            }) {
              result {
                title
                authorId
              }
              count
            }
          }`,
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
        query: `query($filters: GaqRootFiltersInput!) {
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
        query: `query($filters: GaqRootFiltersInput!) {
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
    it('should request to the db provider only the selected fields in the query and nothing more', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            bookGaqQueryResult(filters: $filters, options: $options) {
              result {
                title
                authorId
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
          options: {
            limit: 1,
            offset: 0,
            sort: [{ key: 'title', order: 1 }],
          },
        },
      };
      await request(url).post('/').send(queryData);

      expect(bookSpy.mock.calls[0][0]).toEqual({
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.EQUAL,
            value: 'The Great Gatsby',
          },
        ],
      });
      expect(bookSpy.mock.calls[0][1]).toEqual(['title', 'authorId']);
      expect(bookSpy.mock.calls[0][2].limit).toEqual(1);
      expect(bookSpy.mock.calls[0][2].offset).toEqual(0);
      expect(bookSpy.mock.calls[0][2].sort).toEqual([
        { key: 'title', order: 1 },
      ]);
    });
    it('should call the count method only if no fields are selected', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!) {
            bookGaqQueryResult(filters: $filters) {
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
      expect(response.body.data?.bookGaqQueryResult.count).toEqual(1);
      expect(bookCountSpy).toHaveBeenCalledTimes(1);
      expect(bookSpy).not.toHaveBeenCalled();
    });
    it('should be able to select all when no filters are passed', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            bookGaqQueryResult(filters: $filters, options: $options) {
              result {
                title
                authorId
              }
            }
          }`,
        variables: {
          filters: {},
        },
      };
      await request(url).post('/').send(queryData);

      expect(bookSpy.mock.calls[0][0]).toEqual({});
    });
  });
  describe('solving n+1 problem', () => {
    let server: ApolloServer<GaqContext>;
    let url: string;
    let bookSpy: jest.SpyInstance;
    let authorSpy: jest.SpyInstance;
    let reviewSpy: jest.SpyInstance;
    beforeAll(async () => {
      bookSpy = jest.fn();
      authorSpy = jest.fn();
      reviewSpy = jest.fn();
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
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
        dbAdapter: getMockedDatasource({
          bookSpy: bookSpy as any,
          authorSpy: authorSpy as any,
          reviewSpy: reviewSpy as any,
        }),
      });
      server = new ApolloServer<GaqContext>({
        typeDefs,
        resolvers,
      });
      ({ url } = await startStandaloneServer(server, {
        listen: { port: 0 },
        context: async ({ req, res }) => {
          return withGaqContextFn({ req, res });
        },
      }));
    });
    beforeEach(() => {
      bookSpy.mockClear();
      authorSpy.mockClear();
      reviewSpy.mockClear();
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
        query: `query($filters: GaqRootFiltersInput!) {
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
        query: `query($filters: GaqRootFiltersInput!) {
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
    it('should call the the field resolver in the dataloader with only the selected fields and the field key even if not requested', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!) {
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
      expect(authorSpy.mock.calls[0][1]).toEqual(['id', 'name']);
      expect(reviewSpy.mock.calls[0][1]).toEqual(['bookId', 'id', 'content']);
    });
  });
  describe('limit and maxLimit support', () => {
    let server: ApolloServer<GaqContext>;
    let bookSpy: jest.SpyInstance;
    let reviewSpy: jest.SpyInstance;
    let url: string;
    beforeAll(async () => {
      bookSpy = jest.fn();
      reviewSpy = jest.fn();
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
          type Book @dbCollection(collectionName: "books") @limit(default: 1, max: 3){
            id: ID
            title: String
            authorId: String
            reviews: [Review] @fieldResolver(parentKey: "id", fieldKey: "bookId", limit: 1)
          }
        
          type Review @dbCollection(collectionName: "reviews"){
            id: ID
            content: String
            bookId: String
            book: Book @fieldResolver(parentKey: "bookId", fieldKey: "id")
          }
        `,
        dbAdapter: getMockedDatasource({
          bookSpy: bookSpy as any,
          reviewSpy: reviewSpy as any,
        }),
      });
      server = new ApolloServer<GaqContext>({
        typeDefs,
        resolvers,
      });
      ({ url } = await startStandaloneServer(server, {
        listen: { port: 0 },
        context: async ({ req, res }) => {
          return withGaqContextFn({ req, res });
        },
      }));
    });
    beforeEach(() => {
      bookSpy.mockClear();
      reviewSpy.mockClear();
    });
    afterAll(async () => {
      await server.stop();
    });
    it('should call the db provider and pass the default limit if no limit is passed', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!) {
            bookGaqQueryResult(filters: $filters) {
              result {
                id
                title
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
          },
        },
      };

      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(bookSpy.mock.calls[0][2].limit).toEqual(1);
      expect(reviewSpy.mock.calls[0][2].limit).toEqual(1);
    });
    it('should call the db provider and pass the max limit if the limit is passed and is greater than the max limit', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
            bookGaqQueryResult(filters: $filters, options: $options) {
              result {
                id
                title
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
          },
          options: {
            limit: 10,
          },
        },
      };

      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(bookSpy.mock.calls[0][2].limit).toEqual(3);
      expect(reviewSpy.mock.calls[0][2].limit).toEqual(1);
    });
    it('should call the db provider and NOT pass a limit if the directive is not present', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!) {
            reviewGaqQueryResult(filters: $filters) {
              result {
                  id
                  content
              }
            }
          }`,
        variables: {
          filters: {
            and: [],
          },
        },
      };

      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(reviewSpy.mock.calls[0][2].limit).toBeNull();
    });
  });

  describe('schema transformation support', () => {
    let protectedServer: ApolloServer<GaqContext>;
    let urlProtectedServer: string;
    let getUserFn: jest.Mock;
    beforeAll(async () => {
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
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
        dbAdapter: getMockedDatasource(),
      });

      const authTransformer = (schema: GraphQLSchema) => {
        const typeDirectiveArgumentMaps: Record<string, any> = {};
        return mapSchema(schema, {
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
        } satisfies SchemaMapper);
      };

      const schemaWithAuth = authTransformer(
        makeExecutableSchema({
          typeDefs,
          resolvers,
        })
      );

      protectedServer = new ApolloServer({
        schema: schemaWithAuth,
      });
      ({ url: urlProtectedServer } = await startStandaloneServer(
        protectedServer,
        {
          listen: { port: 0 },
          context: async ({ req, res }) => {
            return withGaqContextFn({ req, res });
          },
        }
      ));
    });
    afterAll(async () => {
      await protectedServer.stop();
    });
    describe('authentication support', () => {
      it('should prevent the user from querying Book if he does not have the role user', async () => {
        getUserFn = jest.fn().mockReturnValue({ roles: [] });
        const queryData = {
          query: `query($filters: GaqRootFiltersInput!) {
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
          query: `query($filters: GaqRootFiltersInput!) {
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
          query: `query($filters: GaqRootFiltersInput!) {
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
  describe('resolve reference in federation context', () => {
    let server: ApolloServer<GaqContext>;
    let bookSpy: jest.SpyInstance;
    let url: string;
    beforeAll(async () => {
      bookSpy = jest.fn();
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
          extend schema
          @link(
            url: "https://specs.apollo.dev/federation/v2.0"
            import: ["@key", "@shareable"]
          )
          type Book @dbCollection(collectionName: "books") @key(fields: "id") @key(fields: "authorId") @key(fields: "id authorId"){
            id: ID
            title: String
            authorId: String
          }
        `,
        dbAdapter: getMockedDatasource({
          bookSpy: bookSpy as any,
        }),
      });
      const typeDefsNode = gql`
        ${typeDefs}
      `;
      server = new ApolloServer<GaqContext>({
        schema: buildSubgraphSchema({
          typeDefs: typeDefsNode,
          resolvers,
        }),
      });
      ({ url } = await startStandaloneServer(server, {
        listen: { port: 0 },
        context: async ({ req, res }) => {
          return withGaqContextFn({ req, res });
        },
      }));
    });
    beforeEach(() => {
      bookSpy.mockClear();
    });
    afterAll(async () => {
      await server.stop();
    });
    it('should be able to resolve book as a reference on the id key in a federation context', async () => {
      const representations = [{ __typename: 'Book', id: '1' }];
      const query = `
        query($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Book {
              id
              title
            }
          }
        }
      `;
      const response = await request(url).post('/').send({
        query,
        variables: { representations },
      });

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data._entities[0]).toEqual({
        id: '1',
        title: 'The Great Gatsby',
      });
      // Check is tries to load with the proper filters and only the requested fields
      expect(bookSpy.mock.calls[0][0]).toEqual({
        or: [
          {
            and: [
              { key: 'id', comparator: GaqFilterComparators.EQUAL, value: '1' },
            ],
          },
        ],
      });
      expect(bookSpy.mock.calls[0][1]).toEqual(['id', 'title']);
    });
    it('should be able to resolve book as a reference on the authorId key in a federation context', async () => {
      const representations = [{ __typename: 'Book', authorId: '2' }];
      const query = `
        query($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Book {
              id
              authorId
              title
            }
          }
        }
      `;
      const response = await request(url).post('/').send({
        query,
        variables: { representations },
      });

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data._entities[0]).toEqual({
        id: '2',
        authorId: '2',
        title: 'To Kill a Mockingbird',
      });
      expect(bookSpy.mock.calls[0][0]).toEqual({
        or: [
          {
            and: [
              {
                key: 'authorId',
                comparator: GaqFilterComparators.EQUAL,
                value: '2',
              },
            ],
          },
        ],
      });
      expect(bookSpy.mock.calls[0][1]).toEqual(['id', 'authorId', 'title']);
    });
    it('should be able to resolve book as a reference on the id and authorId keys in a federation context', async () => {
      const representations = [{ __typename: 'Book', id: '1', authorId: '1' }];
      const query = `
        query($representations: [_Any!]!) {
          _entities(representations: $representations) {
            ... on Book {
              id
              authorId
              title
            }
          }
        }
      `;
      const response = await request(url).post('/').send({
        query,
        variables: { representations },
      });

      expect(response.body.errors).toBeUndefined();
      expect(response.body.data._entities[0]).toEqual({
        id: '1',
        authorId: '1',
        title: 'The Great Gatsby',
      });
    });
    it('should be able to handle when requesting with multiple representations and keep the same order of the representations', async () => {
      const representations = [
        { __typename: 'Book', id: '1' },
        { __typename: 'Book', id: '3' },
        { __typename: 'Book', id: '2' },
      ];
      const query = `
      query($representations: [_Any!]!) {
        _entities(representations: $representations) {
          ... on Book {
            id
            authorId
            title
          }
        }
      }
    `;
      const response = await request(url).post('/').send({
        query,
        variables: { representations },
      });
      expect(response.body.errors).toBeUndefined();
      expect(response.body.data._entities).toEqual([
        { id: '1', authorId: '1', title: 'The Great Gatsby' },
        { id: '3', authorId: '3', title: '1984' },
        { id: '2', authorId: '2', title: 'To Kill a Mockingbird' },
      ]);
    });
  });
  describe('many to many support', () => {
    let server: ApolloServer<GaqContext>;
    let url: string;
    let bookAuthorsSpy: jest.SpyInstance;
    beforeAll(async () => {
      bookAuthorsSpy = jest.fn();
      const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
        logger: getTestLogger(),
        typeDefs: `
          type Book @dbCollection(collectionName: "books"){
            id: ID
            title: String
            authors: [Author] @fieldResolver(parentKey: "authorId", fieldKey: "id") @manyToManyFieldResolver(collectionName: "books_authors", fieldKeyAlias: "authorId", parentKeyAlias: "bookId")
          }
        
          type Author @dbCollection(collectionName: "awesome_authors"){
            id: ID
            name: String
          }
        `,
        dbAdapter: getMockedDatasource({
          bookAuthorsSpy: bookAuthorsSpy as any,
        }),
      });
      server = new ApolloServer<GaqContext>({
        typeDefs,
        resolvers,
      });
      ({ url } = await startStandaloneServer(server, {
        listen: { port: 0 },
        context: async ({ req, res }) => {
          return withGaqContextFn({ req, res });
        },
      }));
    });
    beforeEach(() => {
      bookAuthorsSpy.mockClear();
    });
    afterAll(async () => {
      await server.stop();
    });
    it('should be able to resolve many to many fields and query the dbAdapters with the proper arguments', async () => {
      const queryData = {
        query: `query($filters: GaqRootFiltersInput!) {
            bookGaqQueryResult(filters: $filters) {
              result {
                title
                authors {
                  name
                }
              }
            }
          }`,
        variables: {
          filters: {},
        },
      };
      const response = await request(url).post('/').send(queryData);
      expect(response.body.errors).toBeUndefined();
      expect(bookAuthorsSpy.mock.calls[0][0]).toEqual(['1', '2', '3']);
      expect(bookAuthorsSpy.mock.calls[0][1]).toEqual({
        mtmCollectionName: 'books_authors',
        mtmFieldKeyAlias: 'authorId',
        mtmParentKeyAlias: 'bookId',
        requestedFields: ['id', 'name'],
        fieldCollectionName: 'awesome_authors',
      });
      expect(bookAuthorsSpy.mock.calls[0][2].traceId).toBeDefined();

      expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
        title: 'The Great Gatsby',
        authors: [{ name: 'F. Scott Fitzgerald' }, { name: 'Harper Lee' }],
      });
    }, 20000);
  });
});
