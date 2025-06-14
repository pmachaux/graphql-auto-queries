import {
  generateResolvers,
  getResolversFromDescriptions,
} from './resolver-builder';
import {
  GaqFilterComparators,
  GaqResolverDescription,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';
import DataLoader = require('dataloader');
import { getTestLogger } from '../test-utils/test-logger';
import { setLogger } from '../logger';

jest.mock('graphql-fields', () =>
  jest.fn().mockReturnValue({
    result: {
      title: true,
      id: true,
    },
    count: true,
  })
);
describe('getResolversFromDescriptions', () => {
  let dbCollectionNameMap: Map<string, string>;
  let gaqDataloaders: Map<string, DataLoader<any, any, any>>;
  let BookauthorDataloader: jest.Mock;
  let BookreviewsDataloader: jest.Mock;
  let getFromGaqFiltersSpy: jest.Mock;
  beforeEach(() => {
    setLogger(getTestLogger());
    dbCollectionNameMap = new Map([
      ['Book', 'books'],
      ['Author', 'authors'],
      ['Review', 'reviews'],
    ]);
    BookauthorDataloader = jest.fn();
    BookreviewsDataloader = jest.fn();

    gaqDataloaders = new Map();
    gaqDataloaders.set('BookauthorDataloader', {
      load: BookauthorDataloader,
    } as any);
    gaqDataloaders.set('BookreviewsDataloader', {
      load: BookreviewsDataloader,
    } as any);
  });
  it('should create resolvers from descriptions', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'bookGaqQueryResult',
        resultType: 'BookGaqResult',
        linkedType: 'Book',
        dbCollectionName: 'books',
        fieldResolvers: [],
      },
    ];

    const getFromGaqFiltersSpy = jest.fn().mockResolvedValue([]);

    const mockContext = {
      gaqDbClient: {
        getCollectionAdapter: jest.fn().mockImplementation((type) => ({
          getFromGaqFilters: getFromGaqFiltersSpy,
          getByField: jest.fn().mockResolvedValue([]),
        })),
      },
      gaqDataloaders,
      traceId: 'test',
    };

    const resolvers = getResolversFromDescriptions(
      mockDescriptions,
      dbCollectionNameMap
    );
    expect(resolvers).toHaveProperty('Query');
    expect(resolvers.Query).toHaveProperty('bookGaqQueryResult');

    // Test resolver execution
    const bookResolver = resolvers.Query.bookGaqQueryResult;
    const result = bookResolver(
      null,
      {
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
          ],
          limit: 10,
          offset: 0,
          sort: [
            {
              key: 'title',
              order: 1,
            },
          ],
        },
      },
      mockContext,
      null
    );
    expect(mockContext.gaqDbClient.getCollectionAdapter).toHaveBeenCalledWith(
      'books'
    );
    expect(getFromGaqFiltersSpy.mock.calls[0][0]).toEqual({
      and: [
        {
          key: 'title',
          comparator: GaqFilterComparators.EQUAL,
          value: 'The Great Gatsby',
        },
      ],
    });
    expect(getFromGaqFiltersSpy.mock.calls[0][1]).toEqual(['title', 'id']);
    expect(getFromGaqFiltersSpy.mock.calls[0][2].limit).toEqual(10);
    expect(getFromGaqFiltersSpy.mock.calls[0][2].offset).toEqual(0);
    expect(getFromGaqFiltersSpy.mock.calls[0][2].sort).toEqual([
      {
        key: 'title',
        order: 1,
      },
    ]);
    expect(result).resolves.toEqual({ count: 0, result: [] });
  });

  it('should return null when parent is not null', () => {
    const mockDescriptions: GaqResolverDescription[] = [
      {
        queryName: 'userGaqQueryResult',
        resultType: 'UserGaqResult',
        linkedType: 'User',
        dbCollectionName: 'users',
        fieldResolvers: [],
      },
    ];

    const mockContext = {
      gaqDbClient: {
        getCollectionAdapter: jest.fn(),
      },
      gaqDataloaders,
      traceId: 'test',
    };

    const resolvers = getResolversFromDescriptions(
      mockDescriptions,
      dbCollectionNameMap
    );
    const userResolver = resolvers.Query.userGaqQueryResult;
    const result = userResolver(
      { someData: 'test' },
      { filters: {} } as any,
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
        dbCollectionName: 'users',
        fieldResolvers: [],
      },
    ];

    const mockContext = {
      gaqDbClient: {
        getCollectionAdapter: jest.fn().mockReturnValue(null),
      },
      gaqDataloaders,
      traceId: 'test',
    };

    const resolvers = getResolversFromDescriptions(
      mockDescriptions,
      dbCollectionNameMap
    );
    const userResolver = resolvers.Query.userGaqQueryResult;
    const result = userResolver(
      null,
      { filters: {} } as any,
      mockContext,
      null
    );
    expect(result).toBeNull();
    expect(mockContext.gaqDbClient.getCollectionAdapter).toHaveBeenCalledWith(
      'users'
    );
  });

  describe('generateResolvers', () => {
    it('should generate resolvers from descriptions', () => {
      const gaqResolverDescriptions: GaqResolverDescription[] = [
        {
          queryName: 'bookGaqQueryResult',
          resultType: 'BookGaqResult',
          linkedType: 'Book',
          dbCollectionName: 'books',
          fieldResolvers: [
            {
              parentKey: 'authorId',
              fieldKey: 'id',
              isArray: false,
              fieldType: 'Author',
              fieldName: 'author',
              dataloaderName: 'BookauthorDataloader',
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
        dbCollectionNameMap,
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
          dbCollectionName: 'books',
          fieldResolvers: [],
        },
      ];

      const resolvers = generateResolvers({
        dbCollectionNameMap,
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
          dbCollectionName: 'books',
          fieldResolvers: [
            {
              parentKey: 'authorId',
              fieldKey: 'id',
              isArray: false,
              fieldType: 'Author',
              fieldName: 'author',
              dataloaderName: 'BookauthorDataloader',
            },
          ],
        },
      ];
      const resolvers = generateResolvers({
        dbCollectionNameMap,
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
