import { getResolversFromDescriptions } from './gql-querybuilder';
import {
  GaqResolverDescription,
  GaqResult,
} from '../interfaces/common.interfaces';

describe('getResolversFromQueries', () => {
  it('should return resolvers for queries with matching datasources and resolve them', async () => {
    const queries: GaqResolverDescription[] = [
      { queryName: 'getUsersGaqQuery', linkedType: 'User', resultType: 'User' },
    ];
    const mockUserResult = [{ id: '1', name: 'John Doe' }];
    const datasources = {
      User: {
        dbAdapter: {
          get: () => {
            return Promise.resolve(mockUserResult) as Promise<GaqResult<any[]>>;
          },
        },
      },
    };
    const result = getResolversFromDescriptions(queries);
    expect(result.Query).toHaveProperty('getUsersGaqQuery');
    const getUsersGaqQueryResult = await result?.Query.getUsersGaqQuery(
      {},
      {} as any,
      { datasources },
      {} as any
    );
    expect(getUsersGaqQueryResult).toBe(mockUserResult);
  });
  it('should have a resolver returning null if no datasource is attached', async () => {
    const queries: GaqResolverDescription[] = [
      { queryName: 'getUsersGaqQuery', linkedType: 'User', resultType: 'User' },
    ];

    const result = getResolversFromDescriptions(queries);

    const getUsersGaqQueryResult = await result?.Query.getUsersGaqQuery(
      {},
      {} as any,
      { datasources: {} },
      {} as any
    );

    expect(getUsersGaqQueryResult).toBeNull();
  });
});
