# GAQ Postgres Connector

This package provides a PostgreSQL connector for the GAQ (GraphQL Auto Queries) library, enabling seamless integration between your PostgreSQL database and auto-generated GraphQL queries and resolvers.

## Overview

The GAQ Postgres connector allows you to connect your PostgreSQL tables to a GraphQL API with minimal boilerplate. It implements the required GAQ database adapter interface, so you can use all of GAQ's features—filtering, sorting, pagination, and relationship resolution—directly on your SQL data.

## Installation

Install via your package manager (pnpm, npm, or yarn):

```sh
pnpm add @gaq/postgres pg
# or
npm install @gaq/postgres pg
# or
yarn add @gaq/postgres pg
```

## Usage Example

Below is a minimal example of how to use the Postgres connector with the GAQ library and Apollo Server:

```typescript
import { GaqContext, getGaqTools } from '@gaq';
import { getPostgresGaqDbConnector } from '@gaq/postgres';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const { client, dbAdapter } = await getPostgresGaqDbConnector({
  config: {
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    user: process.env.PG_USER,
    password: process.env.PG_PWD,
    database: process.env.PG_DB,
    ssl: false, // or your SSL config
  },
  logger: console, // or your custom logger
});

const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
  typeDefs: `
    type Actor @dbCollection(collectionName: "actor") {
      id: Int
      first_name: String
      last_name: String
      films: [Film] @fieldResolver(parentKey: "id", fieldKey: "film_id") @manyToManyFieldResolver(collectionName: "film_actor", fieldKeyAlias: "film_id", parentKeyAlias: "actor_id")
    }
    type Film @dbCollection(collectionName: "film") {
      id: Int
      title: String
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

## Features

- **Automatic mapping of PostgreSQL tables to GraphQL types**
- **Advanced filtering, sorting, and pagination**
- **Relationship resolution using @fieldResolver and @manyToManyFieldResolver**
- **Batching and caching with dataloaders to avoid N+1 problems**
- **Works with any PostgreSQL-compatible deployment**

## Configuration

- The connector requires a valid PostgreSQL connection config (host, port, user, password, database, and optional SSL).
- You can pass additional options to the underlying `pg` client if needed.
- The returned `client` is a standard `pg.Client` instance, which you should close when your app shuts down.
- Use the returned `dbAdapter` to pass it into your `getGaqTools` function to create your GAQ / Apollo schema and resolvers.

## Notes

- Use the `@dbCollection` directive to map GraphQL types to PostgreSQL tables.
- Use the `@fieldResolver` directive to define one-to-many and many-to-one relationships between tables.
- Use the `@manyToManyFieldResolver` directive for many-to-many relationships with join tables.
- All filtering and sorting is performed natively in PostgreSQL for maximum efficiency.

## License

MIT License
