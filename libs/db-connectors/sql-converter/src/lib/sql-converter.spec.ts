import { sqlConverter } from './sql-converter';

describe('sqlConverter', () => {
  it('should be able to select all when no filters are passed', () => {
    const sql = sqlConverter('book')({}, ['id', 'title'], {});
    expect(sql).toEqual('SELECT id, title FROM book');
  });
  it('should be able to add a limit', () => {
    const sql = sqlConverter('book')({}, ['id', 'title'], {
      limit: 10,
    });
    expect(sql).toEqual('SELECT id, title FROM book LIMIT 10');
  });
  it('should be able to add an offset', () => {
    const sql = sqlConverter('book')({}, ['id', 'title'], {
      offset: 10,
    });
    expect(sql).toEqual('SELECT id, title FROM book OFFSET 10');
  });
  it('should be able to add a sort', () => {
    const sql = sqlConverter('book')({}, ['id', 'title'], {
      sort: [{ key: 'title', order: 1 }],
    });
    expect(sql).toEqual('SELECT id, title FROM book ORDER BY title ASC');
  });
});
