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

  type Query {
    booksResults: [Book]
  }
`;
  let server: GaqServer;

  beforeAll(async () => {
    const datasources = getMockedDatasource();
    server = getGraphQLAutoQueriesServer({
      autoTypes,
      datasources,
    });
    await server.start();
  });

  it('should return books when querying booksResults', async () => {
    const response = await server.executeOperation({
      query: `
        query($filters: GaqRootFiltersInput) {
          booksResults(filters: $filters) {
            title
            author
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
      booksResults: { title: string; author: string }[];
    }>(response.body);
    expect(response.body.kind).toBe('single');
    expect(body.singleResult.data.booksResults).toEqual([
      { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
    ]);
  });
});
