import { GaqServer } from './interfaces/common.interfaces';
import { getGraphQLAutoQueriesServer } from './gaq';
import { parseGraphQLBody } from './test-utils';
import { getMockedDatasource } from './test-utils/mocked-datasource';
import {
  GaqFilterComparators,
  GaqRootQueryFilter,
} from './interfaces/common.interfaces';

describe('gaq', () => {
  const autoTypes = `
  type Book {
    title: String
    author: String
  }
`;
  let server: GaqServer;

  beforeAll(async () => {
    server = getGraphQLAutoQueriesServer({
      autoTypes,
      dbConnector: getMockedDatasource(),
    });
    // await server.startGraphQLAutoQueriesServer();
  });

  it('should return books when querying bookGaqQueryResult', async () => {
    const response = await server.executeOperation({
      query: `
        query($filters: GaqRootFiltersInput) {
          bookGaqQueryResult(filters: $filters) {
            result {
              title
              author
            }
            count
          }
        }
      `,
      variables: {
        filters: {
          and: [
            {
              key: 'title',
              comparator: GaqFilterComparators.EQUAL,
              value: 'The Great Gatsby',
            },
          ],
        } satisfies GaqRootQueryFilter<{
          title: string;
          author: string;
        }>,
      },
    });
    const body = parseGraphQLBody<{
      bookGaqQueryResult: {
        result: { title: string; author: string }[];
        count: number;
      }[];
    }>(response.body);
    expect(response.body.kind).toBe('single');
    expect(body.singleResult.data.bookGaqQueryResult[0].result).toEqual([
      { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
    ]);
    expect(body.singleResult.data.bookGaqQueryResult[0].count).toBeDefined();
  });
});
