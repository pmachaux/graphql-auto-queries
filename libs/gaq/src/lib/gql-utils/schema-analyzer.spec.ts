import gql from 'graphql-tag';
import {
  getAutoSchemaAndResolvers,
  setDbCollectionNameMap,
} from './schema-analyzer';
import { getTestLogger } from '../test-utils/test-logger';
import { setLogger } from '../logger';

describe('schema-analyzer', () => {
  beforeAll(() => {
    setLogger(getTestLogger());
  });
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
        autoTypes: `
        type Book @dbCollection(collectionName: "books") {
          title: String
          authorId: String
        }
      `,
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { gaqSchema, gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        new Map<string, string>()
      );

      expect(gaqResolverDescriptions).toEqual([
        {
          queryName: 'bookGaqQueryResult',
          resultType: 'BookGaqResult',
          linkedType: 'Book',
          fieldResolvers: [],
          dbCollectionName: 'books',
        },
      ]);

      expect(gaqSchema).toContain(`scalar GaqNestedFilterQuery`);
      expect(gaqSchema).toContain(`type BookGaqResult {
        result: [Book]
        count: Int
      }`);

      expect(gaqSchema).toContain('type Query {');
      expect(gaqSchema).toContain(
        'bookGaqQueryResult(filters: GaqRootFiltersInput): BookGaqResult'
      );

      expect(gaqSchema).toContain(options.autoTypes);
    });
    it('should generate schema and resolvers from auto types with field resolvers', () => {
      const options = {
        autoTypes: `
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

      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        new Map<string, string>()
      );
      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
            dataloaderName: 'BookauthorDataloader',
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'authorGaqQueryResult',
        resultType: 'AuthorGaqResult',
        linkedType: 'Author',
        dbCollectionName: 'authors',
        fieldResolvers: [],
      });
    });
    it('should generate schema and resolvers from auto types with field resolvers and array fields', () => {
      const options = {
        autoTypes: `
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
      const dbCollectionNameMap = new Map<string, string>();
      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        dbCollectionNameMap
      );

      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        fieldResolvers: [
          {
            parentKey: 'id',
            fieldKey: 'bookId',
            isArray: true,
            fieldType: 'Review',
            fieldName: 'reviews',
            dataloaderName: 'BookreviewsDataloader',
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'reviewGaqQueryResult',
        resultType: 'ReviewGaqResult',
        linkedType: 'Review',
        dbCollectionName: 'reviews',
        fieldResolvers: [
          {
            parentKey: 'bookId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Book',
            fieldName: 'book',
            dataloaderName: 'ReviewbookDataloader',
          },
        ],
      });
    });

    it('should handle empty auto types', () => {
      const options = {
        autoTypes: '',
        dbAdapter: {
          getCollectionAdapter: jest.fn(),
        },
      };

      const { gaqSchema, gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        new Map<string, string>()
      );

      expect(gaqResolverDescriptions).toEqual([]);
      expect(gaqSchema).toBe('');
    });

    // Additional test cases
    it('should throw error when @dbCollection directive is missing', () => {
      const options = {
        autoTypes: `
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
        getAutoSchemaAndResolvers(options, new Map<string, string>())
      ).toThrow('@dbCollection directive is required on type Book');
    });

    it('should throw error when @dbCollection directive is missing collectionName argument', () => {
      const options = {
        autoTypes: `
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
        getAutoSchemaAndResolvers(options, new Map<string, string>())
      ).toThrow(
        'collectionName argument is required on directive @dbCollection on type Book'
      );
    });

    it('should throw error when @fieldResolver directive is missing required arguments', () => {
      const options = {
        autoTypes: `
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
        getAutoSchemaAndResolvers(options, new Map<string, string>())
      ).toThrow('parentKey argument is required on directive @fieldResolver');
    });

    it('should handle non-nullable fields correctly', () => {
      const options = {
        autoTypes: `
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
      const dbCollectionNameMap = new Map<string, string>();
      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        dbCollectionNameMap
      );

      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
            dataloaderName: 'BookauthorDataloader',
          },
          {
            parentKey: 'id',
            fieldKey: 'bookId',
            isArray: true,
            fieldType: 'Review',
            fieldName: 'reviews',
            dataloaderName: 'BookreviewsDataloader',
          },
        ],
      });
    });

    it('should handle circular references between types', () => {
      const options = {
        autoTypes: `
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
      const dbCollectionNameMap = new Map<string, string>();
      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(
        options,
        dbCollectionNameMap
      );

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
      });
      expect(gaqResolverDescriptions[1].fieldResolvers[0]).toEqual({
        parentKey: 'id',
        fieldKey: 'authorId',
        isArray: true,
        fieldType: 'Book',
        fieldName: 'books',
        dataloaderName: 'AuthorbooksDataloader',
      });
    });
  });
});
