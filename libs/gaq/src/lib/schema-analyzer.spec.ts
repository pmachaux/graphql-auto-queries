import { extractQueriesFromSchema } from './schema-analyzer';

describe('schema-analyzer', () => {
  describe('extractQueriesFromSchema', () => {
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
});
