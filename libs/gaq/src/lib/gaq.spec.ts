import { gaq } from './gaq';

describe('gaq', () => {
  it('should work', () => {
    expect(gaq()).toEqual('gaq');
  });
});
