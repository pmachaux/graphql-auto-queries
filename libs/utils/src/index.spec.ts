import {
  omit,
  pick,
  pickNonNullable,
  isNullOrUndefinedOrEmptyObject,
  getFieldDataloaderName,
} from './index';

describe('Utils', () => {
  describe('omit', () => {
    it('should omit specified keys from object', () => {
      const source = { a: 1, b: 2, c: 3 };
      const result = omit(source, 'a', 'c');
      expect(result).toEqual({ b: 2 });
    });

    it('should return empty object when all keys are omitted', () => {
      const source = { a: 1, b: 2 };
      const result = omit(source, 'a', 'b');
      expect(result).toEqual({});
    });

    it('should return original object when no keys are omitted', () => {
      const source = { a: 1, b: 2 };
      const result = omit(source);
      expect(result).toEqual(source);
    });
  });

  describe('pick', () => {
    it('should pick specified keys from object', () => {
      const source = { a: 1, b: 2, c: 3 };
      const result = pick(source, 'a', 'c');
      expect(result).toEqual({ a: 1, c: 3 });
    });

    it('should return empty object when no keys are picked', () => {
      const source = { a: 1, b: 2 };
      const result = pick(source);
      expect(result).toEqual({});
    });

    it('should handle non-existent keys gracefully', () => {
      const source = { a: 1, b: 2 };
      const result = pick(source, 'a', 'nonExistent' as keyof typeof source);
      expect(result).toEqual({ a: 1, nonExistent: undefined });
    });
  });

  describe('pickNonNullable', () => {
    it('should pick only non-null and non-undefined values', () => {
      const source = { a: 1, b: null, c: undefined, d: 'test' };
      const result = pickNonNullable(source, 'a', 'b', 'c', 'd');
      expect(result).toEqual({ a: 1, d: 'test' });
    });

    it('should return empty object when all values are null or undefined', () => {
      const source = { a: null, b: undefined };
      const result = pickNonNullable(source, 'a', 'b');
      expect(result).toEqual({});
    });

    it('should handle empty key list', () => {
      const source = { a: 1, b: 2 };
      const result = pickNonNullable(source);
      expect(result).toEqual({});
    });
  });

  describe('isNullOrUndefinedOrEmptyObject', () => {
    it('should return true for null', () => {
      expect(isNullOrUndefinedOrEmptyObject(null)).toBe(true);
    });

    it('should return true for undefined', () => {
      expect(isNullOrUndefinedOrEmptyObject(undefined)).toBe(true);
    });

    it('should return true for empty object', () => {
      expect(isNullOrUndefinedOrEmptyObject({})).toBe(true);
    });

    it('should return false for object with properties', () => {
      expect(isNullOrUndefinedOrEmptyObject({ a: 1 })).toBe(false);
    });

    it('should return false for non-empty object', () => {
      expect(isNullOrUndefinedOrEmptyObject({ a: 1, b: 2 })).toBe(false);
    });
  });

  describe('getFieldDataloaderName', () => {
    it('should generate correct dataloader name', () => {
      const result = getFieldDataloaderName({
        typeName: 'User',
        fieldName: 'posts',
      });
      expect(result).toBe('UserpostsDataloader');
    });

    it('should handle empty strings', () => {
      const result = getFieldDataloaderName({
        typeName: '',
        fieldName: '',
      });
      expect(result).toBe('Dataloader');
    });

    it('should handle special characters in names', () => {
      const result = getFieldDataloaderName({
        typeName: 'User_Type',
        fieldName: 'field-name',
      });
      expect(result).toBe('User_Typefield-nameDataloader');
    });
  });
});
