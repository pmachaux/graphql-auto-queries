import { getResolversFromDescriptions } from './gql-querybuilder';
import { GaqResolverDescription } from '../interfaces/common.interfaces';

describe('getResolversFromDescriptions', () => {
  it('should create resolvers from descriptions', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
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
});
