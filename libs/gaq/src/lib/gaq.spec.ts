import { GaqServer } from './interfaces/common.interfaces';
import { getGraphQLAutoQueriesServer } from './gaq';
import { getMockedDatasource } from './test-utils/mocked-datasource';
import {
  GaqFilterComparators,
  GaqRootQueryFilter,
} from './interfaces/common.interfaces';
import * as request from 'supertest';
describe('gaq', () => {
  const autoTypes = `
  type Book {
    title: String
    authorId: String
    author: Author
  }
  type Author {
    id: String
    name: String
    books: [Book]
  }
`;
  let server: GaqServer;
  let url: string;
  beforeAll(async () => {
    server = getGraphQLAutoQueriesServer({
      autoTypes,
      dbConnector: getMockedDatasource(),
    });
    ({ url } = await server.startGraphQLAutoQueriesServer({
      listen: { port: 0 },
    }));
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should return books when querying bookGaqQueryResult', async () => {
    const queryData = {
      query: `query($filters: GaqRootFiltersInput) {
          bookGaqQueryResult(filters: $filters) {
            result {
              title
              authorId
            }
            count
          }
        }`,
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
    };
    const response = await request(url).post('/').send(queryData);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data?.bookGaqQueryResult.result[0]).toEqual({
      title: 'The Great Gatsby',
      authorId: '1',
    });
  });
});
