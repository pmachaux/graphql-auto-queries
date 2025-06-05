import {
  generateResolvers,
  getResolversFromDescriptions,
} from './resolver-builder';
import { GaqResolverDescription } from '../interfaces/common.interfaces';

describe('getResolversFromDescriptions', () => {
  it('should create resolvers from descriptions', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        fieldResolvers: [],
      },
    ];

    const mockContext = {
      gaqDbClient: {
        collection: jest.fn().mockImplementation((type) => ({
          get: jest.fn().mockResolvedValue([]),
        })),
      },
    };

    const resolvers = getResolversFromDescriptions(mockDescriptions);
    expect(resolvers).toHaveProperty('Query');
    expect(resolvers.Query).toHaveProperty('bookGaqQueryResult');

    // Test resolver execution
    const bookResolver = resolvers.Query.bookGaqQueryResult;
    const result = bookResolver(null, { filter: {} } as any, mockContext, null);
    expect(mockContext.gaqDbClient.collection).toHaveBeenCalledWith('Book');
    expect(result).resolves.toEqual({ count: 0, result: [] });
  });

  it('should return null when parent is not null', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'userGaqQueryResult',
        resultType: 'UserGaqResult',
        linkedType: 'User',
        fieldResolvers: [],
      },
    ];

    const mockContext = {
      gaqDbClient: {
        collection: jest.fn(),
      },
    };

    const resolvers = getResolversFromDescriptions(mockDescriptions);
    const userResolver = resolvers.Query.userGaqQueryResult;
    const result = userResolver(
      { someData: 'test' },
      { filter: {} } as any,
      mockContext,
      null
    );
    expect(result).toBeNull();
  });

  it('should return null when collection client is not available', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'userGaqQueryResult',
        resultType: 'UserGaqResult',
        linkedType: 'User',
        fieldResolvers: [],
      },
    ];

    const mockContext = {
      gaqDbClient: {
        collection: jest.fn().mockReturnValue(null),
      },
    };

    const resolvers = getResolversFromDescriptions(mockDescriptions);
    const userResolver = resolvers.Query.userGaqQueryResult;
    const result = userResolver(null, { filter: {} } as any, mockContext, null);
    expect(result).toBeNull();
    expect(mockContext.gaqDbClient.collection).toHaveBeenCalledWith('User');
  });

  describe('generateResolvers', () => {
    it('should generate resolvers from descriptions', () => {
      const gaqResolverDescriptions: GaqResolverDescription[] = [
        {
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
        },
      ];

      const standardApolloResolvers = {
        Query: {
          customQuery: () => 'custom result',
        },
        Book: {
          title: (parent: any) => parent.title,
        },
      };

      const resolvers = generateResolvers({
        gaqResolverDescriptions,
        standardApolloResolvers,
      });

      expect(resolvers).toHaveProperty('Query');
      expect(resolvers.Query).toHaveProperty('bookGaqQueryResult');
      expect(resolvers.Query).toHaveProperty('customQuery');
      expect(resolvers).toHaveProperty('Book');
      expect(resolvers).toHaveProperty('GaqNestedFilterQuery');
    });

    it('should handle undefined standardApolloResolvers', () => {
      const gaqResolverDescriptions: GaqResolverDescription[] = [
        {
          queryName: 'bookGaqQueryResult',
          resultType: 'BookGaqResult',
          linkedType: 'Book',
          fieldResolvers: [],
        },
      ];

      const resolvers = generateResolvers({
        gaqResolverDescriptions,
        standardApolloResolvers: undefined,
      });

      expect(resolvers).toHaveProperty('Query');
      expect(resolvers.Query).toHaveProperty('bookGaqQueryResult');
      expect(resolvers).toHaveProperty('GaqNestedFilterQuery');
      expect(resolvers).not.toHaveProperty('Book');
    });
    it('should generate field resolvers from descriptions', () => {
      const gaqResolverDescriptions: GaqResolverDescription[] = [
        {
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
        },
      ];
      const resolvers = generateResolvers({
        gaqResolverDescriptions,
        standardApolloResolvers: undefined,
      });
      expect(resolvers).toHaveProperty('Query');
      expect(resolvers.Query).toHaveProperty('bookGaqQueryResult');
      expect(resolvers).toHaveProperty('GaqNestedFilterQuery');
      expect(resolvers).toHaveProperty('Book');
      expect((resolvers as any).Book).toHaveProperty('author');
      expect(typeof (resolvers as any).Book.author).toBe('function');
    });
  });
});
