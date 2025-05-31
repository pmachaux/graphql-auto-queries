import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const books = [
  {
    title: 'The Awakening',
    author: 'Kate Chopin',
  },
  {
    title: 'City of Glass',
    author: 'Paul Auster',
  },
];

const typeDefs = `
type Book {
  title: String
  author: String
}

type Query {
  books: [Book]
}
`;

const resolvers = {
  Query: {
    books: () => books,
  },
};

export function getGraphQLAutoQueriesServer(): ApolloServer {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  return server;
}

export const startGraphQLAutoQueriesServer = startStandaloneServer;
