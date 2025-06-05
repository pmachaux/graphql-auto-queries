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
          authorId: String
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
          fieldResolvers: [],
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
        type Book {
          title: String
          authorId: String
          author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id")
        }
        type Author {
          id: String
          name: String
        }
      `,
      };

      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(options);
      console.log('gaqResolverDescriptions', gaqResolverDescriptions);
      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        fieldResolvers: [
          {
            parentKey: 'authorId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Author',
            fieldName: 'author',
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'authorGaqQueryResult',
        resultType: 'AuthorGaqResult',
        linkedType: 'Author',
        fieldResolvers: [],
      });
    });
    it('should generate schema and resolvers from auto types with field resolvers and array fields', () => {
      const options = {
        autoTypes: `
        type Book {
          id: ID
          title: String
          reviews: [Review] @fieldResolver(parentKey: "id", fieldKey: "bookId")
        }
        type Review {
          id: String
          bookId: String
          book: Book @fieldResolver(parentKey: "bookId", fieldKey: "id")
        }
      `,
      };

      const { gaqResolverDescriptions } = getAutoSchemaAndResolvers(options);

      expect(gaqResolverDescriptions[0]).toEqual({
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        fieldResolvers: [
          {
            parentKey: 'id',
            fieldKey: 'bookId',
            isArray: true,
            fieldType: 'Review',
            fieldName: 'reviews',
          },
        ],
      });
      expect(gaqResolverDescriptions[1]).toEqual({
        queryName: 'reviewGaqQueryResult',
        resultType: 'ReviewGaqResult',
        linkedType: 'Review',
        fieldResolvers: [
          {
            parentKey: 'bookId',
            fieldKey: 'id',
            isArray: false,
            fieldType: 'Book',
            fieldName: 'book',
          },
        ],
      });
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
          title: {
            fieldResolver: null,
            isArray: false,
            type: 'String',
          },
        },
      });
    });
    it('should extract all types with their properties', () => {
      const schema = `
        type Book {
          title: String!
          tags: [String!]!
        }
        type Author {
          name: String!
        }
        type Review {
          rating: Int!
          comment: String
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Book: {
          title: {
            fieldResolver: null,
            isArray: false,
            type: 'String',
          },
          tags: { fieldResolver: null, isArray: true, type: 'String' },
        },
        Author: {
          name: { fieldResolver: null, isArray: false, type: 'String' },
        },
        Review: {
          rating: { fieldResolver: null, isArray: false, type: 'Int' },
          comment: { fieldResolver: null, isArray: false, type: 'String' },
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
          values: { fieldResolver: null, isArray: true, type: 'Int' },
        },
      });
    });

    it('should handle nullable and non-nullable fields', () => {
      const schema = `
        type Post {
          title: String!
          content: String
          comments: [String!]!
        }
      `;

      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types).toEqual({
        Post: {
          title: { fieldResolver: null, isArray: false, type: 'String' },
          content: { fieldResolver: null, isArray: false, type: 'String' },
          comments: { fieldResolver: null, isArray: true, type: 'String' },
        },
      });
    });
    it('should be able to populate fieldResolver when @fieldResolver directive is present', () => {
      const schema = `
        type Book {
          id: ID
          title: String
          authorId: String
          author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id")
          reviews: [Review] @fieldResolver(parentKey: "id", fieldKey: "bookId")
        }
        type Author {
          id: String
          name: String
        }
        type Review {
          id: ID
          bookId: ID
          rating: Int
          comment: String
        }
      `;
      const types = extractAllTypesDefinitionsFromSchema(schema);
      expect(types.Book).toEqual({
        id: { fieldResolver: null, isArray: false, type: 'ID' },
        title: { fieldResolver: null, isArray: false, type: 'String' },
        authorId: { fieldResolver: null, isArray: false, type: 'String' },
        author: {
          fieldResolver: { parentKey: 'authorId', fieldKey: 'id' },
          isArray: false,
          type: 'Author',
        },
        reviews: {
          fieldResolver: { parentKey: 'id', fieldKey: 'bookId' },
          isArray: true,
          type: 'Review',
        },
      });
    });
  });
});
