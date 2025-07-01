# GAQ MongoDB Connector

This package provides a MongoDB connector for the GAQ (GraphQL Auto Queries) library, enabling seamless integration between your MongoDB database and auto-generated GraphQL queries and resolvers.

## Overview

The GAQ MongoDB connector allows you to quickly connect your MongoDB collections to a GraphQL API with minimal boilerplate. It implements the required GAQ database adapter interface, so you can use all of GAQ's features—filtering, sorting, pagination, and relationship resolution—directly on your MongoDB data.

## Installation

Install via your package manager (pnpm, npm, or yarn):

```sh
pnpm add @graphql-auto-queries/mongo
# or
npm install @graphql-auto-queries/mongo
# or
yarn add @graphql-auto-queries/mongo
```

## Usage Example

Below is a minimal example of how to use the Mongo connector with the GAQ library and Apollo Server:

```typescript
import { GaqContext, getGaqTools } from '@graphql-auto-queries/core';
import { getMongoGaqDbConnector } from '@graphql-auto-queries/mongo';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const { client, dbAdapter } = await getMongoGaqDbConnector({
  uri: process.env.MONGO_URI, // e.g., 'mongodb://localhost:27017'
  dbName: 'sample_mflix',
});

const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
  typeDefs: `
    type Movie @dbCollection(collectionName: "movies") {
      _id: ID
      title: String
      year: Int
      comments: [Comment] @fieldResolver(parentKey: "_id", fieldKey: "movie_id")
    }
    type Comment @dbCollection(collectionName: "comments") {
      _id: ID
      name: String
      movie_id: String
      movie: Movie @fieldResolver(parentKey: "movie_id", fieldKey: "_id")
      date: DateTime
    }
  `,
  dbAdapter,
});

const server = new ApolloServer<GaqContext>({
  typeDefs,
  resolvers,
});

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => withGaqContextFn({ req, res }),
});
```

## Configuration

- The connector requires a valid MongoDB URI and database name.
- You can pass additional options to the underlying MongoDB client if needed.
- The returned `client` is a standard MongoClient instance, which you should close when your app shuts down.
- Use the returned dbAdapter to pass it into your `getGaqTools` function to create your GAQ / Apollo schema and resolvers

## Notes

- For nested/embedded documents, you do not need a field resolver—just query the nested field directly.
- All filtering and sorting is performed natively in MongoDB for maximum efficiency.

## License

MIT License
