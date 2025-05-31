// libs/gaq/src/lib/gaq.ts
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
var books = [
  {
    title: "The Awakening",
    author: "Kate Chopin"
  },
  {
    title: "City of Glass",
    author: "Paul Auster"
  }
];
var typeDefs = `
type Book {
  title: String
  author: String
}

type Query {
  books: [Book]
}
`;
var resolvers = {
  Query: {
    books: () => books
  }
};
function getGraphQLAutoQueriesServer() {
  const server2 = new ApolloServer({
    typeDefs,
    resolvers
  });
  return server2;
}
var startGraphQLAutoQueriesServer = startStandaloneServer;

// apps/test-app/src/main.ts
var server = getGraphQLAutoQueriesServer();
var { url } = await startGraphQLAutoQueriesServer(server, {
  listen: { port: 4200 }
});
console.log(`\u{1F680}  Server ready at: ${url}`);
//# sourceMappingURL=main.js.map
