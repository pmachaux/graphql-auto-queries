import {
  extractQueriesFromSchema,
  extractAllTypesDefinitionsFromSchema,
} from './schema-analyzer';

describe('schema-analyzer', () => {
  describe('extractQueriesFromSchema', () => {
    it('should throw an error if the schema is not valid', () => {
      const schema = `
        type Query {
          books:
        }
      `;

      expect(() => extractQueriesFromSchema(schema)).toThrow();
    });
    it('should extract query names from a valid schema', () => {
      const schema = `
        type Book {
          title: String
          author: String
        }

        type Query {
          books: [Book]
          book(id: ID!): Book
          searchBooks(title: String): [Book]
        }
      `;

      const queries = extractQueriesFromSchema(schema);
      expect(queries).toEqual(['books', 'book', 'searchBooks']);
    });

    it('should return empty array when Query type is not defined', () => {
      const schema = `
        type Book {
          title: String
          author: String
        }
      `;

      const queries = extractQueriesFromSchema(schema);
      expect(queries).toEqual([]);
    });

    it('should return empty array when schema is empty', () => {
      const queries = extractQueriesFromSchema('');
      expect(queries).toEqual([]);
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
          title: { isReference: false, isArray: false, type: 'String' },
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
          title: { isReference: false, isArray: false, type: 'String' },
          author: { isReference: true, isArray: false, type: 'Author' },
          tags: { isReference: false, isArray: true, type: 'String' },
          reviews: { isReference: true, isArray: true, type: 'Review' },
        },
        Author: {
          name: { isReference: false, isArray: false, type: 'String' },
          books: { isReference: true, isArray: true, type: 'Book' },
        },
        Review: {
          rating: { isReference: false, isArray: false, type: 'Int' },
          comment: { isReference: false, isArray: false, type: 'String' },
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
          values: { isReference: false, isArray: true, type: 'Int' },
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
          title: { isReference: false, isArray: false, type: 'String' },
          content: { isReference: false, isArray: false, type: 'String' },
        },
        Comment: {
          text: { isReference: false, isArray: false, type: 'String' },
        },
        User: {
          id: { isReference: false, isArray: false, type: 'ID' },
          name: { isReference: false, isArray: false, type: 'String' },
          email: { isReference: false, isArray: false, type: 'String' },
          posts: { isReference: true, isArray: true, type: 'Post' },
          comments: { isReference: true, isArray: true, type: 'Comment' },
        },
      });
    });
  });
});
