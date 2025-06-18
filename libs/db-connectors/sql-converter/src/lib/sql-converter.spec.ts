import { sqlConverter } from './sql-converter';

describe('sqlConverter', () => {
  it('should work', () => {
    expect(sqlConverter()).toEqual('sql-converter');
  });
});
