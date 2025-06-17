import gql from 'graphql-tag';
import {
  getGaqTypeDefsAndResolvers,
  setDbCollectionNameMap,
} from './schema-analyzer';
import { getTestLogger } from '../../mocks';

describe('schema-analyzer', () => {
  describe('getDbCollectionNameMap', () => {
    it('should extract collection names from type definitions', () => {
      const typeDefs = `
      type Book @dbCollection(collectionName: "books") {
        title: String
      }
      type Author @dbCollection(collectionName: "authors") {
        name: String
      }
      type Query {
        books: [Book]
      }
    `;

      const dbCollectionNameMap = new Map<string, string>();
      setDbCollectionNameMap(
        gql`
          ${typeDefs}
        `,
        dbCollectionNameMap
      );

      expect(dbCollectionNameMap.get('Book')).toBe('books');
      expect(dbCollectionNameMap.get('Author')).toBe('authors');
      expect(dbCollectionNameMap.size).toBe(2);
    });

    it('should ignore types without dbCollection directive', () => {
      const typeDefs = `
      type Book {
        title: String
      }
      type Author @dbCollection(collectionName: "authors") {
        name: String
      }
    `;

      const dbCollectionNameMap = new Map<string, string>();
      setDbCollectionNameMap(
        gql`
          ${typeDefs}
        `,
        dbCollectionNameMap
      );

      expect(dbCollectionNameMap.has('Book')).toBe(false);
      expect(dbCollectionNameMap.get('Author')).toBe('authors');
      expect(dbCollectionNameMap.size).toBe(1);
    });

    it('should ignore Query and Mutation types', () => {
      const typeDefs = `
      type Query @dbCollection(collectionName: "queries") {
        books: [Book]
      }
      type Mutation @dbCollection(collectionName: "mutations") {
        createBook: Book
      }
      type Book @dbCollection(collectionName: "books") {
        title: String
      }
    `;

      const dbCollectionNameMap = new Map<string, string>();
      setDbCollectionNameMap(
        gql`
          ${typeDefs}
        `,
        dbCollectionNameMap
      );

      expect(dbCollectionNameMap.has('Query')).toBe(false);
      expect(dbCollectionNameMap.has('Mutation')).toBe(false);
      expect(dbCollectionNameMap.get('Book')).toBe('books');
      expect(dbCollectionNameMap.size).toBe(1);
    });

    it('should handle types with invalid dbCollection directive', () => {
      const typeDefs = `
      type Book @dbCollection {
        title: String
      }
      type Author @dbCollection(collectionName: "authors") {
        name: String
      }
    `;

      const dbCollectionNameMap = new Map<string, string>();
      setDbCollectionNameMap(
        gql`
          ${typeDefs}
        `,
        dbCollectionNameMap
      );

      expect(dbCollectionNameMap.has('Book')).toBe(false);
      expect(dbCollectionNameMap.get('Author')).toBe('authors');
      expect(dbCollectionNameMap.size).toBe(1);
    });
  });
  describe('getAutoSchemaAndResolvers', () => {
    it('should generate schema and resolvers from auto types', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          title: String
          authorId: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { typeDefs, gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(
        options,
        { logger: getTestLogger() }
      );

      expect(gaqResolverDescriptions).toEqual([
        {
          queryName: 'bookGaqQueryResult',
          resultType: 'BookGaqResult',
          linkedType: 'Book',
          fieldResolvers: [],
          dbCollectionName: 'books',
          defaultLimit: null,
          maxLimit: null,
        },
      ]);

      expect(typeDefs).toContain(`scalar GaqNestedFilterQuery`);
      expect(typeDefs).toContain(`type BookGaqResult {
        result: [Book]
        count: Int
      }`);

      expect(typeDefs).toContain('type Query {');
      expect(typeDefs).toContain(
        'bookGaqQueryResult(filters: GaqRootFiltersInput): BookGaqResult'
      );

      expect(typeDefs).toContain(options.typeDefs);
    });
    it('should generate schema and resolvers from auto types with field resolvers', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          title: String
          authorId: String
          author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id")
        }
        type Author @dbCollection(collectionName: "authors") {
          id: String
          name: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });
      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
            dataloaderName: 'BookauthorDataloader',
            limit: null,
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'authorGaqQueryResult',
        resultType: 'AuthorGaqResult',
        linkedType: 'Author',
        dbCollectionName: 'authors',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [],
      });
    });
    it('should generate schema and resolvers from auto types with field resolvers and limit and maxLimit', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") @limit(default: 10, max: 100) {
          title: String
          authorId: String
          author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id", limit: 5)
        }
        type Author @dbCollection(collectionName: "authors") {
          id: String
          name: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });
      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        defaultLimit: 10,
        maxLimit: 100,
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
            dataloaderName: 'BookauthorDataloader',
            limit: 5,
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'authorGaqQueryResult',
        resultType: 'AuthorGaqResult',
        linkedType: 'Author',
        dbCollectionName: 'authors',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [],
      });
    });
    it('should generate schema and resolvers from auto types with field resolvers and array fields', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          id: ID
          title: String
          reviews: [Review] @fieldResolver(parentKey: "id", fieldKey: "bookId")
        }
        type Review @dbCollection(collectionName: "reviews") {
          id: String
          bookId: String
          book: Book @fieldResolver(parentKey: "bookId", fieldKey: "id")
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };
      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });

      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [
          {
            parentKey: 'id',
            fieldKey: 'bookId',
            isArray: true,
            fieldType: 'Review',
            fieldName: 'reviews',
            dataloaderName: 'BookreviewsDataloader',
            limit: null,
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'reviewGaqQueryResult',
        resultType: 'ReviewGaqResult',
        linkedType: 'Review',
        dbCollectionName: 'reviews',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [
          {
            parentKey: 'bookId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Book',
            fieldName: 'book',
            dataloaderName: 'ReviewbookDataloader',
            limit: null,
          },
        ],
      });
    });

    it('should handle empty auto types', () => {
      const options = {
        typeDefs: '',
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { typeDefs: typeDefs, gaqResolverDescriptions } =
        getGaqTypeDefsAndResolvers(options, { logger: getTestLogger() });

      expect(gaqResolverDescriptions).toEqual([]);
      expect(typeDefs).toBe('');
    });

    // Additional test cases
    it('should throw error when @dbCollection directive is missing', () => {
      const options = {
        typeDefs: `
        type Book {
          title: String
          authorId: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      expect(() =>
        getGaqTypeDefsAndResolvers(options, { logger: getTestLogger() })
      ).toThrow('@dbCollection directive is required on type Book');
    });

    it('should throw error when @dbCollection directive is missing collectionName argument', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection {
          title: String
          authorId: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      expect(() =>
        getGaqTypeDefsAndResolvers(options, { logger: getTestLogger() })
      ).toThrow(
        'collectionName argument is required on directive @dbCollection on type Book'
      );
    });

    it('should throw error when @fieldResolver directive is missing required arguments', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          title: String
          author: Author @fieldResolver
        }
        type Author @dbCollection(collectionName: "authors") {
          id: String
          name: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      expect(() =>
        getGaqTypeDefsAndResolvers(options, { logger: getTestLogger() })
      ).toThrow('parentKey argument is required on directive @fieldResolver');
    });

    it('should handle non-nullable fields correctly', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          id: ID!
          title: String!
          author: Author! @fieldResolver(parentKey: "authorId", fieldKey: "id")
          reviews: [Review!]! @fieldResolver(parentKey: "id", fieldKey: "bookId")
        }
        type Author @dbCollection(collectionName: "authors") {
          id: String!
          name: String!
        }
        type Review @dbCollection(collectionName: "reviews") {
          id: String!
          bookId: String!
          rating: Int!
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };
      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });

      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        defaultLimit: null,
        maxLimit: null,
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
            dataloaderName: 'BookauthorDataloader',
            limit: null,
          },
          {
            parentKey: 'id',
            fieldKey: 'bookId',
            isArray: true,
            fieldType: 'Review',
            fieldName: 'reviews',
            dataloaderName: 'BookreviewsDataloader',
            limit: null,
          },
        ],
      });
    });

    it('should handle circular references between types', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") {
          id: ID!
          title: String!
          author: Author! @fieldResolver(parentKey: "authorId", fieldKey: "id")
          authorId: String!
        }
        type Author @dbCollection(collectionName: "authors") {
          id: String!
          name: String!
          books: [Book!]! @fieldResolver(parentKey: "id", fieldKey: "authorId")
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });

      expect(gaqResolverDescriptions).toHaveLength(2);
      expect(gaqResolverDescriptions[0].fieldResolvers).toHaveLength(1);
      expect(gaqResolverDescriptions[1].fieldResolvers).toHaveLength(1);

      // Verify circular reference is handled correctly
      expect(gaqResolverDescriptions[0].fieldResolvers[0]).toEqual({
        parentKey: 'authorId',
        fieldKey: 'id',
        isArray: false,
        fieldType: 'Author',
        fieldName: 'author',
        dataloaderName: 'BookauthorDataloader',
        limit: null,
      });
      expect(gaqResolverDescriptions[1].fieldResolvers[0]).toEqual({
        parentKey: 'id',
        fieldKey: 'authorId',
        isArray: true,
        fieldType: 'Book',
        fieldName: 'books',
        limit: null,
        dataloaderName: 'AuthorbooksDataloader',
      });
    });
    it('should handle @gaqIgnore directive and not generate resolvers for when directive is present', () => {
      const options = {
        typeDefs: `
        type Book @dbCollection(collectionName: "books") @gaqIgnore {
          id: ID!
          title: String!
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };
      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });
      expect(gaqResolverDescriptions).toEqual([]);
    });
    it('should ignore input types', () => {
      const options = {
        typeDefs: `
        input BookInput {
          title: String!
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };
      const { gaqResolverDescriptions } = getGaqTypeDefsAndResolvers(options, {
        logger: getTestLogger(),
      });
      expect(gaqResolverDescriptions).toEqual([]);
    });
  });
});
