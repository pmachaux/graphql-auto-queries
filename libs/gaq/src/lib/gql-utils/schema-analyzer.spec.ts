import {
  extractAllTypesDefinitionsFromSchema,
  getAutoSchemaAndResolvers,
} from './schema-analyzer';

describe('schema-analyzer', () => {
  describe('getAutoSchemaAndResolvers', () => {
    it('should generate schema and resolvers from auto types', () => {
      const options = {
        autoTypes: `
        type Book {
          title: String
          author: Author
        }
        type Author {
          name: String
          books: [Book]
        }
      `,
      };

      const { gaqSchema, gaqResolverDescriptions } =
        getAutoSchemaAndResolvers(options);

      expect(gaqResolverDescriptions).toEqual([
        {
          queryName: 'bookGaqQueryResult',
          resultType: 'BookGaqResult',
          linkedType: 'Book',
        },
        {
          queryName: 'authorGaqQueryResult',
          resultType: 'AuthorGaqResult',
          linkedType: 'Author',
        },
      ]);

      expect(gaqSchema).toContain(`scalar GaqNestedFilterQuery`);
      expect(gaqSchema).toContain(`type BookGaqResult {
        result: [Book]
        count: Int
      }`);

      expect(gaqSchema).toContain(`type AuthorGaqResult {
        result: [Author]
        count: Int
      }`);

      expect(gaqSchema).toContain('type Query {');
      expect(gaqSchema).toContain(
        'bookGaqQueryResult(filters: GaqRootFiltersInput): BookGaqResult'
      );
      expect(gaqSchema).toContain(
        'authorGaqQueryResult(filters: GaqRootFiltersInput): AuthorGaqResult'
      );

      expect(gaqSchema).toContain(options.autoTypes);
    });

    it('should handle empty auto types', () => {
      const options = {
        autoTypes: '',
      };

      const { gaqSchema, gaqResolverDescriptions } =
        getAutoSchemaAndResolvers(options);

      expect(gaqResolverDescriptions).toEqual([]);
      expect(gaqSchema).toBe('');
    });
  });
  describe('extractAllTypesDefinitionsFromSchema', () => {
    it('should throw an error if the schema is not valid', () => {
      const schema = `
        type Book {
          title: String
          author:
        }
      `;

      expect(() => extractAllTypesDefinitionsFromSchema(schema)).toThrow();
    });
    it('should return empty object when schema is empty', () => {
      const types = extractAllTypesDefinitionsFromSchema('');
      expect(types).toEqual({});
    });
    it('should exclude Query and Mutation types', () => {
      const schema = `
        type Book {
          title: String
        }
        type Query {
          books: [Book]
        }
        type Mutation {
          addBook(title: String): Book
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Book: {
          title: { resolveField: false, isArray: false, type: 'String' },
        },
      });
    });
    it('should extract all types with their properties', () => {
      const schema = `
        type Book {
          title: String!
          author: Author
          tags: [String!]!
          reviews: [Review]
        }
        type Author {
          name: String!
          books: [Book!]!
        }
        type Review {
          rating: Int!
          comment: String
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Book: {
          title: { resolveField: false, isArray: false, type: 'String' },
          author: { resolveField: true, isArray: false, type: 'Author' },
          tags: { resolveField: false, isArray: true, type: 'String' },
          reviews: { resolveField: true, isArray: true, type: 'Review' },
        },
        Author: {
          name: { resolveField: false, isArray: false, type: 'String' },
          books: { resolveField: true, isArray: true, type: 'Book' },
        },
        Review: {
          rating: { resolveField: false, isArray: false, type: 'Int' },
          comment: { resolveField: false, isArray: false, type: 'String' },
        },
      });
    });

    it('should handle nested array types', () => {
      const schema = `
        type Matrix {
          values: [[Int!]!]!
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Matrix: {
          values: { resolveField: false, isArray: true, type: 'Int' },
        },
      });
    });

    it('should handle nullable and non-nullable fields', () => {
      const schema = `
        type Post {
          title: String!
          content: String
        }
        type Comment {
          text: String!
        }

        type User {
          id: ID!
          name: String
          email: String!
          posts: [Post!]
          comments: [Comment]!
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Post: {
          title: { resolveField: false, isArray: false, type: 'String' },
          content: { resolveField: false, isArray: false, type: 'String' },
        },
        Comment: {
          text: { resolveField: false, isArray: false, type: 'String' },
        },
        User: {
          id: { resolveField: false, isArray: false, type: 'ID' },
          name: { resolveField: false, isArray: false, type: 'String' },
          email: { resolveField: false, isArray: false, type: 'String' },
          posts: { resolveField: true, isArray: true, type: 'Post' },
          comments: { resolveField: true, isArray: true, type: 'Comment' },
        },
      });
    });
  });
});
