"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGraphQLAutoQueriesServer = void 0;
exports.getGraphQLAutoQueriesServer = getGraphQLAutoQueriesServer;
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
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
`;
const resolvers = {
    Query: {
        books: () => books,
    },
};
function getGraphQLAutoQueriesServer() {
    const server = new server_1.ApolloServer({
        typeDefs,
        resolvers,
    });
    return server;
}
exports.startGraphQLAutoQueriesServer = standalone_1.startStandaloneServer;
//# sourceMappingURL=gaq.js.map