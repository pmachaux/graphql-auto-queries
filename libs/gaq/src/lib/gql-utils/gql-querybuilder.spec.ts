import { getResolversFromQueries } from './gql-querybuilder';
import {
  GaqResolverDescription,
  GaqResult,
} from '../interfaces/common.interfaces';

describe('getResolversFromQueries', () => {
  it('should return resolvers for queries with matching datasources and resolve them', async () => {
    const queries: GaqResolverDescription[] = [
      { queryName: 'getUsersGaqQuery', linkedType: 'User' },
    ];
    const mockUserResult = [{ id: '1', name: 'John Doe' }];
    const datasources = {
      User: {
        resolver: () =>
          Promise.resolve(mockUserResult) as Promise<GaqResult<any[]>>,
      },
    };
    const result = getResolversFromQueries(queries, datasources);
    expect(result.Query).toHaveProperty('getUsersGaqQuery');
    const getUsersGaqQueryResult = await result?.Query.getUsersGaqQuery(
      {},
      {},
      {},
      {} as any
    );
    expect(getUsersGaqQueryResult).toBe(mockUserResult);
  });
  it('should have a resolver returning null if no datasource is attached', async () => {
    const queries: GaqResolverDescription[] = [
      { queryName: 'getUsersGaqQuery', linkedType: 'User' },
    ];

    const result = getResolversFromQueries(queries, {});

    const getUsersGaqQueryResult = await result?.Query.getUsersGaqQuery(
      {},
      {},
      {},
      {} as any
    );

    expect(getUsersGaqQueryResult).toBeNull();
  });
});
