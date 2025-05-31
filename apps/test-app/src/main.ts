import {
  getGraphQLAutoQueriesServer,
  startGraphQLAutoQueriesServer,
} from '@gaq';

const server = getGraphQLAutoQueriesServer();
const { url } = await startGraphQLAutoQueriesServer(server, {
  listen: { port: 4200 },
});

console.log(`🚀  Server ready at: ${url}`);
