import { GaqFilterComparators } from '@gaq';
import { SqlConverter } from './sql-converter';
import { GaqSqlConverter } from './interface';

describe('sqlConverter', () => {
  let sqlConverter: GaqSqlConverter;
  beforeEach(() => {
    sqlConverter = new SqlConverter();
  });
  describe('basics', () => {
    it('should be able to select all when no filters are passed', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {},
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual('SELECT id, title FROM book');
      expect(params).toEqual([]);
    });
    it('should be able to add a limit', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {},
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {
          limit: 10,
        },
      });
      expect(sql).toEqual('SELECT id, title FROM book LIMIT 10');
      expect(params).toEqual([]);
    });
    it('should be able to add an offset', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {},
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {
          offset: 10,
        },
      });
      expect(sql).toEqual('SELECT id, title FROM book OFFSET 10');
      expect(params).toEqual([]);
    });
    it('should be able to add a sort', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {},
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {
          sort: [{ key: 'title', order: 1 }],
        },
      });
      expect(sql).toEqual('SELECT id, title FROM book ORDER BY title ASC');
      expect(params).toEqual([]);
    });
  });
  describe(' where clause', () => {
    it('should be able to add a simple filter', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
          ],
        },
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual('SELECT id, title FROM book WHERE (title = ?)');
      expect(params).toEqual(['The Great Gatsby']);
    });
    it('should be able to add an AND condition', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
            {
              key: 'author',
              comparator: GaqFilterComparators.EQUAL,
              value: 'F. Scott Fitzgerald',
            },
          ],
        },
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual(
        'SELECT id, title FROM book WHERE (title = ? AND author = ?)'
      );
      expect(params).toEqual(['The Great Gatsby', 'F. Scott Fitzgerald']);
    });
    it('should be able to add an OR condition', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {
          or: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
            {
              key: 'author',
              comparator: GaqFilterComparators.EQUAL,
              value: 'F. Scott Fitzgerald',
            },
          ],
        },
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual(
        'SELECT id, title FROM book WHERE (title = ? OR author = ?)'
      );
      expect(params).toEqual(['The Great Gatsby', 'F. Scott Fitzgerald']);
    });
    it('should be able to add a NOR condition', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {
          nor: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
            {
              key: 'author',
              comparator: GaqFilterComparators.EQUAL,
              value: 'F. Scott Fitzgerald',
            },
          ],
        },
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual(
        'SELECT id, title FROM book WHERE NOT (title = ? OR author = ?)'
      );
      expect(params).toEqual(['The Great Gatsby', 'F. Scott Fitzgerald']);
    });
    it('should be able to handle nested conditions', () => {
      const [sql, params] = sqlConverter.convert({
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
            {
              or: [
                {
                  key: 'author',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'F. Scott Fitzgerald',
                },
                {
                  key: 'author',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'Ernest Hemingway',
                },
              ],
            },
          ],
        },
        table: 'book',
        selectedFields: ['id', 'title'],
        opts: {},
      });
      expect(sql).toEqual(
        'SELECT id, title FROM book WHERE (title = ? AND (author = ? OR author = ?))'
      );
      expect(params).toEqual([
        'The Great Gatsby',
        'F. Scott Fitzgerald',
        'Ernest Hemingway',
      ]);
    });
  });
  it('should be able to handle the not equal comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.NOT_EQUAL,
            value: 'The Great Gatsby',
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual('SELECT id, title FROM book WHERE (title <> ?)');
    expect(params).toEqual(['The Great Gatsby']);
  });
  it('should support null equality', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.EQUAL,
            value: null,
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.EQUAL,
            value: null,
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title IS NULL AND author IS NULL)'
    );
    expect(params).toEqual([]);
  });
  it('should support not null equality', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.NOT_EQUAL,
            value: null,
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.NOT_EQUAL,
            value: null,
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title IS NOT NULL AND author IS NOT NULL)'
    );
    expect(params).toEqual([]);
  });
  it('should be able to handle the greater comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.GREATER,
            value: 'The Great Gatsby',
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.GREATER,
            value: 'F. Scott Fitzgerald',
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title >= ? AND author >= ?)'
    );
    expect(params).toEqual(['The Great Gatsby', 'F. Scott Fitzgerald']);
  });
  it('should be able to handle the strictly greater comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.STRICTLY_GREATER,
            value: 'The Great Gatsby',
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.STRICTLY_GREATER,
            value: 'F. Scott Fitzgerald',
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title > ? AND author > ?)'
    );
    expect(params).toEqual(['The Great Gatsby', 'F. Scott Fitzgerald']);
  });
  it('should be able to handle the lower comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.LOWER,
            value: 2,
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.LOWER,
            value: 1,
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title <= ? AND author <= ?)'
    );
    expect(params).toEqual([2, 1]);
  });
  it('should be able to handle the strictly lower comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.STRICTLY_LOWER,
            value: 2,
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.STRICTLY_LOWER,
            value: 1,
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title < ? AND author < ?)'
    );
    expect(params).toEqual([2, 1]);
  });
  it('should be able to handle the in comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.IN,
            value: ['The Great Gatsby', 'Test'],
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.IN,
            value: ['F. Scott Fitzgerald', 'Ernest Hemingway'],
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title IN (?, ?) AND author IN (?, ?))'
    );
    expect(params).toEqual([
      'The Great Gatsby',
      'Test',
      'F. Scott Fitzgerald',
      'Ernest Hemingway',
    ]);
  });
  it('should be able to handle the not in comparator', () => {
    const [sql, params] = sqlConverter.convert({
      filters: {
        and: [
          {
            key: 'title',
            comparator: GaqFilterComparators.NOT_IN,
            value: ['The Great Gatsby', 'Test'],
          },
          {
            key: 'author',
            comparator: GaqFilterComparators.NOT_IN,
            value: ['F. Scott Fitzgerald', 'Ernest Hemingway'],
          },
        ],
      },
      table: 'book',
      selectedFields: ['id', 'title'],
      opts: {},
    });
    expect(sql).toEqual(
      'SELECT id, title FROM book WHERE (title NOT IN (?, ?) AND author NOT IN (?, ?))'
    );
    expect(params).toEqual([
      'The Great Gatsby',
      'Test',
      'F. Scott Fitzgerald',
      'Ernest Hemingway',
    ]);
  });
});
