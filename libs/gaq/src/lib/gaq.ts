import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { extractQueriesFromSchema } from './schema-analyzer';

const typeDefs = `
  type Book {
    title: String
    author: String
  }

  type Query {
    booksResults: [Book]
  }
`;

// Extract and log available queries
const availableQueries = extractQueriesFromSchema(typeDefs);
console.log('Available GraphQL queries:', availableQueries);

export function getGraphQLAutoQueriesServer(): ApolloServer {
  const server = new ApolloServer({
    typeDefs,
    resolvers: {},
  });

  return server;
}

export const startGraphQLAutoQueriesServer = startStandaloneServer;
