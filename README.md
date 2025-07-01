# gaq - GraphQL Auto Queries Library

`GAQ` (aka GraphQL Auto Queries) is a library for rapidly creating GraphQL servers with auto-generated queries and resolvers, designed for seamless integration with Apollo Server and custom database connectors. It is ideal for projects that need to expose flexible, filterable, and scalable GraphQL APIs with minimal boilerplate. It's meant to handle the 95% of queries that are purely standard.
It prefectly integrates with Apollo Graphql and still gives you the opportunity to customize everything you need.
Compared to classical REST APIs, it's meant to shift the intention from 'actions' to 'combinable resources' to query.

## Monorepo

This repository contains several libraries for database connectors, each with its own README for details:

- [MongoDB Connector](libs/db-connectors/mongo/README.md): Integrate MongoDB with the GAQ library for auto-generated GraphQL queries and resolvers.
- [Postgres Connector](libs/db-connectors/postgres/README.md): Integrate PostgreSQL with the GAQ library, supporting advanced SQL features and relationships.
- [SQL Converter](libs/db-connectors/sql-converter/README.md): Base utility for building custom SQL connectors for GAQ. Extend this to support your own SQL dialect or database.

## Summary

- [Features](#features)
- [Usage Example](#usage-example)
- [Filtering & Querying](#filtering--querying)
- [Limiting, sorting and pagination](#limiting-sorting-and-pagination)
- [Federation and subgraph](#federation-and-subgraph)
- [Optimized queries](#optimized-queries)
- [Extensible with Apollo GraphQL](#extensible-with-apollo-graphql)
- [Customizable and traceable logs](#customizable-and-traceable-logs)
- [TypeScript Support](#typescript-support)
- [Custom DB Adapter Interface](#custom-db-adapter-interface)
- [Handling One-to-Many and Many-to-One Relationships with @fieldResolver](#handling-one-to-many-and-many-to-one-relationships-with-fieldresolver)
- [Handling Many-to-Many Relationships with Intermediate Tables](#handling-many-to-many-relationships-with-intermediate-tables)
- [License](#license)

## Features

- **Auto-generates GraphQL queries and resolvers** from your type definitions
- **Database-agnostic**: plug in your own database connector
- **Advanced filtering and sorting** out of the box
- **Customizable logging** with traceable logs.
- **Extensible with Apollo Server options**
- **Route guards, authorization, authentication**
- **N+1 problem handled** automatically with dataloaders
- **Optimized DB queries**, automatically only request necessary fields and nothing more to increase performances and reduce read costs
- **Native support for Apollo Federation** as a subgraph server

## Usage Example

Below is a simple example on how to setup an Apollo server using GraphQL auto-queries.
In this example, we will use the native MongoDB adapter provided by our library.

```typescript
import { GaqContext, GaqFilterComparators, getGaqTools } from '@graphql-auto-queries/core';
import { getMongoGaqDbConnector } from '@graphql-auto-queries/mongo';
import { MongoClient } from 'mongodb';
import { DateTimeResolver } from 'graphql-scalars';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const { client, dbAdapter } = await getMongoGaqDbConnector({
  uri: process.env.MONGO_URI,
  dbName: 'sample_mflix',
});
mongoClient = client;
const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
  typeDefs: `
        scalar DateTime
          type Movie @dbCollection(collectionName: "movies"){
            _id: ID
            title: String
            year: Int
            released: DateTime
            comments: [Comment] @fieldResolver(parentKey: "_id", fieldKey: "movie_id")
          }

          type Comment @dbCollection(collectionName: "comments"){
            _id: ID
            name: String
            movie_id: String
            movie: Movie @fieldResolver(parentKey: "movie_id", fieldKey: "_id")
            date: DateTime
          }

          type Book @dbCollection(collectionName: "books") @gaqIgnore {
            id: ID!
            title: String!
          }
        `,
  dbAdapter,
});

server = new ApolloServer<GaqContext>({
  typeDefs,
  resolvers: {
    DateTime: DateTimeResolver,
    ...resolvers,
  },
});
startStandaloneServer(server, {
  listen: { port: 0 },
  context: async ({ req, res }) => {
    return withGaqContextFn({ req, res });
  },
});
```

Now let's see how to query that:

```typescript
const queryData = {
  query: `query($filters: GaqRootFiltersInput, $options: GaqQueryOptions) {
            bookGaqQueryResult(filters: $filters, options: $options) {
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
    },
    options: {
      limit: 10,
      offset: 20,
      sort: [{ key: 'title', order: 1 }],
    },
  },
};
```

## Filtering & Querying

Supports advanced query filters and comparators (e.g., `EQUAL`, `IN`, `ARRAY_CONTAINS`, etc.) for flexible data access.
Supported filter operations are:

```typescript
enum GaqFilterComparators {
  EQUAL = '==',
  NOT_EQUAL = '!=',
  GREATER = '>=',
  STRICTLY_GREATER = '>',
  LOWER = '<=',
  STRICTLY_LOWER = '<',
  IN = 'in',
  NOT_IN = 'not-in',
  ARRAY_CONTAINS = 'array-contains', // Not natively supported in SQL
  ARRAY_CONTAINS_ANY = 'array-contains-any', // Not natively supported in SQL
  ARRAY_ELEMENT_MATCH = 'array-element-match', // Not natively supported in SQL
}
```

To use them simply pass in your auto-queries something like:

```typescript
{
  query: `query($filters: GaqRootFiltersInput) {
      bookGaqQueryResult(filters: $filters) {
        result {
          title
          authorId
          author {
            name
          }
        }
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
}
```

### Limitations on filtering

Filtering will only work on properties directly in the queries collection.
It does **NOT** work on resolved fields.
If you want to query on nested fields you **MUST** to use document database such as Mongo and have every information you need directly in the collection.

### FilterComparators.IN

It applies on primitive fields. Value provided in the query filter must be an array.
If the field value matches any of the values provided in the filter. Then it returns a match.
Example 1:
Data
` {name: 'bob'};`
GaqFilterQuery
` {key: 'name', comparator: FilterComparators.IN, value: ['bob', 'martin']}`
This returns a match
Example 2:
Data
`{name: 'bob'};`
GaqFilterQuery
`{key: 'name', comparator: FilterComparators.IN, value: ['george', 'martin']}`
This does NOT return a match

### FilterComparators.ARRAY_CONTAINS

It applies on a field where the type is an array of primitives. Value provided in the query filter must be an array.
If the field value matches all the values provided in the filter. Then it returns a match.
Example 1:
Data
`{country: ['France, 'Canada']};`
GaqFilterQuery
`{key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France']}`
This returns a match
Example 2:
Data
` {country: ['France, 'Canada']};`
GaqFilterQuery
` {key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France', 'US']}`
This does NOT return a match

### FilterComparators.ARRAY_ELEMENT_MATCH

It applies on a field that is an array of nested documents. You need it, if you want to perform a query where at least one document must fulfill multiples conditions
When using this comparator, we do not provide the `value` property. This is replaced by the property `arrayElementCondition` being GaqRootQueryFilter<object>
Example 1:
Data
`{answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};`
GaqFilterQuery

```
{
  and: [
    {
      key: 'answers',
      comparator: FilterComparators.ARRAY_ELEMENT_MATCH,
      arrayElementCondition: {
        and: [
          {
            key: 'questionId',
            comparator: FilterComparators.EQUAL,
            value: 'xycv',
          },
          {
            key: 'value',
            comparator: FilterComparators.EQUAL,
            value: 'Yes',
          },
        ],
      },
    },
  ],
};
```

This returns a match because one document fullfills both the condition
Example 2:
Data
`{answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};`
GaqFilterQuery

```
 {
  and: [
        {
          key: 'answers',
          comparator: FilterComparators.ARRAY_ELEMENT_MATCH,
          arrayElementCondition: {
            and: [
              {
                key: 'questionId',
                comparator: FilterComparators.EQUAL,
                value: 'xycv'
              },
              {
                key: 'value',
                comparator: FilterComparators.EQUAL,
                value: 'Half'
              }
            ]
          }
        }
      ]
  }
```

This does NOT return a match because not document fullfills both conditions

Why not using simply a regular AND condition on nested fields? like below
Data
` {answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};`
GaqFilterQuery

```
{
  and: [
        {
          key: 'answers.questionId',
          comparator: FilterComparators.EQUAL,
          value: 'xycv'
        },
        {
          key: 'answers.value',
          comparator: FilterComparators.EQUAL,
          value: 'Half'
        }
      ]
}
```

In this use case, we would have a match, because the entity indeed has `answers` with some subdocuments that have `questionId` to `xycv` and some subdocuments that have `value` to `Half`.
This is different from having one subdocument that matches all conditions at the same time.
Depending on what you want to query, you need to be abl to provide the nuance in the query: Does one subdocument must match all conditions ? Or do you want that all subdocument in the array to partially meet all conditions?

### FilterComparators.ARRAY_CONTAINS_ANY

It applies on a field where the type is an array of primitives. Value provided in the query filter must be an array.
If the field value matches any of the values provided in the filter. Then it returns a match.
Example 1:
Data
`{country: ['France, 'Canada']};`
GaqFilterQuery
`{key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France', 'US']}`
This returns a match
Example 2:
Data
`{country: ['France, 'Canada']};`
GaqFilterQuery
`{key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['US']}`
This does NOT return a match

## Limiting, sorting and pagination

GraphQL Auto Queries support adding limit, sorting, and pagination out of the box via the `options` argument in your queries.

### Usage

You can pass an `options` object to your auto-generated query fields (e.g., `bookGaqQueryResult`) to control:

- **limit**: Maximum number of results to return.
- **offset**: Number of results to skip (for pagination).
- **sort**: Array of sorting parameters (field and order).

**Example Query:**

```graphql
query ($filters: GaqRootFiltersInput, $options: GaqQueryOptions) {
  bookGaqQueryResult(filters: $filters, options: $options) {
    result {
      title
      authorId
    }
    count
  }
}
```

**Example Variables:**

```json
{
  "filters": {
    "and": [
      {
        "key": "title",
        "comparator": "==",
        "value": "The Great Gatsby"
      }
    ]
  },
  "options": {
    "limit": 10,
    "offset": 20,
    "sort": [
      { "key": "title", "order": 1 } // 1 for ascending, -1 for descending
    ]
  }
}
```

### Default and Maximum Limits

- You can set default and maximum limits for a type using the `@limit(default: X, max: Y)` directive in your schema.
- If a client requests a limit higher than the maximum, the maximum is enforced.
- If no limit is provided, the default is used (if set).

**Example:**

```graphql
type Book @dbCollection(collectionName: "books") @limit(default: 10, max: 100) {
  id: ID
  title: String
  authorId: String
}
```

### Notes

- The `offset` option is useful for paginating through large result sets.
- The `sort` option allows multi-field sorting; the first field is the primary sort key. However, it's up to your DB choice to support multi field sorting.
- If no `@limit` directive is present, all results may be returned unless a limit is specified in the query.

## Federation and subgraph

`gaq` supports Apollo Federation out of the box, allowing you to use it as a subgraph in a federated GraphQL architecture.

### Example: Using `gaq` as an Apollo subgraph

```ts
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import { getGaqTools } from '@graphql-auto-queries/core';
import { getMongoGaqDbConnector } from '@graphql-auto-queries/mongo';

const { client, dbAdapter } = await getMongoGaqDbConnector({
  uri: process.env.MONGO_URI,
  dbName: 'sample_mflix',
});

const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
  typeDefs: `
    extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.0"
      import: ["@key", "@shareable"]
    )
    type Book @dbCollection(collectionName: "books") @key(fields: "_id") @key(fields: "authorId") @key(fields: "_id authorId") {
      _id: ID
      title: String
      authorId: String
    }
  `,
  dbAdapter,
});

const typeDefsNode = gql`
  ${typeDefs}
`;

const server = new ApolloServer({
  schema: buildSubgraphSchema({
    typeDefs: typeDefsNode,
    resolvers,
  }),
});

startStandaloneServer(server, {
  listen: { port: 4001 },
  context: async ({ req, res }) => withGaqContextFn({ req, res }),
}).then(({ url }) => {
  console.log(`🚀 Subgraph server ready at ${url}`);
});
```

**Key points:**

- Use the `@key` directive to define entity keys for federation.
- Use `buildSubgraphSchema` from `@apollo/subgraph` to create the schema.
- The rest of the setup is the same as a regular `gaq` server.

You can now compose this subgraph into your Apollo Gateway or any other federated setup.

## Optimized queries

The `gaq` library is designed to generate highly optimized GraphQL queries and resolvers out of the box, focusing on both performance and cost efficiency.

### Dataloader-powered field and reference resolution

- **N+1 Problem Solved:**  
  The library automatically uses [dataloaders](https://github.com/graphql/dataloader) for all field and reference resolutions. This means that when you request nested fields (e.g., fetching authors for a list of books), `gaq` batches and deduplicates the database calls, ensuring each related entity is fetched in a single, efficient query per request cycle.
- **How it works:**
  - When a query requests related data (e.g., `author` for each `Book`), the library collects all the required keys and performs a single batched database call.
  - This eliminates the classic N+1 problem, where a naive resolver would issue one query per parent object.

### Only the requested fields are queried

- **Field-level optimization:**  
  For every query, `gaq` analyzes the GraphQL selection set and only requests the fields that are actually needed from the database.
- **Why this matters:**
  - Reduces the amount of data transferred from the database.
  - Minimizes read costs, especially important for document databases or pay-per-read environments.
  - Improves overall query performance.

### Example

If you query:

```graphql
query {
  bookGaqQueryResult(filters: { ... }) {
    result {
      title
      author {
        name
      }
    }
  }
}
```

- The database will only be asked for the `title` and `authorId` fields for books, and only the `name` field for authors.
- All author lookups are batched into a single query, regardless of how many books are returned.

### Designed for GraphQL best practices

- The library's approach is as optimized as possible from a GraphQL perspective, leveraging batching, field selection, and minimal over-fetching.
- **Note:**  
  For most use cases, this provides excellent performance and scalability. However, if you need extreme performance for specific complex field resolutions (e.g., deep joins or aggregations), you may want to implement a custom resolver that performs a direct database JOIN or aggregation tailored to your needs.

## Extensible with Apollo GraphQL

The `gaq` library is designed to be fully compatible and composable with Apollo Server and the broader GraphQL ecosystem. It does **not** impose any constraints on how you use Apollo Server or other GraphQL tools.

### Seamless Composition

- **No lock-in:**  
  The auto-generated schema and resolvers from `gaq` are standard GraphQL constructs. You can merge them with your own type definitions, resolvers, and any Apollo Server plugins or middleware.
- **Composable:**  
  You can use `gaq` alongside other libraries such as `graphql-tools`, Apollo Federation, custom scalars, and more.

### Schema Customization: Merging Custom typeDefs and Resolvers

You can easily extend your API by merging your own custom type definitions and resolvers with those generated by `gaq`. This allows you to add custom queries, mutations, or override/extend any part of the schema.

```ts
const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({ ... });

const customTypeDefs = `
  extend type Query {
    customHello: String
  }
`;

const customResolvers = {
  Query: {
    customHello: () => 'Hello from custom resolver!',
  },
};

const mergedTypeDefs = [typeDefs, customTypeDefs];
const mergedResolvers = {
  ...resolvers,
  ...customResolvers,
};

const server = new ApolloServer({
  typeDefs: mergedTypeDefs,
  resolvers: mergedResolvers,
});
```

### Example: Adding authentication/authorization

You can easily extend your schema with custom directives and logic, such as authentication and authorization, using tools like `graphql-tools`. Here's an example adapted from the test suite:

```ts
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { makeExecutableSchema } from '@graphql-tools/schema';
import {
  mapSchema,
  getDirective,
  MapperKind,
  SchemaMapper,
} from '@graphql-tools/utils';
import { defaultFieldResolver, GraphQLSchema } from 'graphql';
import { getGaqTools } from '@graphql-auto-queries/core';
import { getMongoGaqDbConnector } from '@graphql-auto-queries/mongo';

const { client, dbAdapter } = await getMongoGaqDbConnector({
  uri: process.env.MONGO_URI,
  dbName: 'sample_mflix',
});

const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
  typeDefs: `
    directive @auth(role: String!) on OBJECT | FIELD_DEFINITION

    type Book @dbCollection(collectionName: "books") @auth(role: "user") {
      id: ID
      title: String
      authorId: String @auth(role: "admin")
      author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id") @auth(role: "paidUser")
    }

    type Author @dbCollection(collectionName: "authors") {
      id: ID
      name: String
      books: [Book]
    }
  `,
  dbAdapter,
});

// Example user function
const getUserFn = () => ({ roles: ['user', 'paidUser', 'admin'] });

const schemaMapper: SchemaMapper = {
  [MapperKind.TYPE]: (type) => {
    const authDirective = getDirective(type.schema, type, 'auth')?.[0];
    if (authDirective) {
      type.auth = authDirective;
    }
    return undefined;
  },
  [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
    const authDirective =
      getDirective(fieldConfig.schema, fieldConfig, 'auth')?.[0] ??
      (fieldConfig.schema.getType(typeName)?.auth || null);
    if (authDirective) {
      const { role } = authDirective;
      if (role) {
        const { resolve = defaultFieldResolver } = fieldConfig;
        fieldConfig.resolve = function (source, args, context, info) {
          const user = getUserFn();
          if (!user.roles.includes(role)) {
            throw new Error('not authorized');
          }
          return resolve(source, args, context, info);
        };
        return fieldConfig;
      }
    }
  },
};

const schemaWithAuth = mapSchema(
  makeExecutableSchema({ typeDefs, resolvers }),
  schemaMapper
);

const server = new ApolloServer({
  schema: schemaWithAuth,
});

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => withGaqContextFn({ req, res }),
});
```

### Overriding auto-generated resolvers

You are **never locked in** to the auto-generated resolvers. You can always override or extend them by merging your own resolvers:

```ts
const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({ ... });

const customResolvers = {
  // Override default resolver
  bookGaqQueryResult: parent, args, context, info) => {
      // Custom logic here
  },
  Book: {
    // Override the default resolver for the 'author' field
    author: (parent, args, context, info) => {
      // Custom logic here
    },
    // Override default reference resolver
    __resolveReference(entity,contextValue,info) {
      // Custom logic here
    }

  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers: {
    ...resolvers,
    ...customResolvers,
  },
});
```

### Summary

- `gaq` is fully compatible with Apollo Server and other GraphQL tools.
- You can add authentication, authorization, custom directives, and more.
- You can always override or extend any part of the auto-generated schema or resolvers.

## Customizable and traceable logs

The `gaq` library provides built-in, highly customizable, and traceable logging for all major operations, including query resolution, field resolution, database access, and error handling.

### How logging works

- **Logger Interface:**  
  The library defines a `GaqLogger` interface with four methods: `info`, `warn`, `error`, and `debug`. This allows for flexible integration with any logging system.

- **Default Logger:**  
  If you do not provide a custom logger, `gaq` uses a default logger based on [winston](https://github.com/winstonjs/winston), which outputs colorized, timestamped logs to the console.

  ```ts
  import { getDefaultLogger } from '@graphql-auto-queries/core';

  const logger = getDefaultLogger();
  ```

- **Custom Logger:**  
  You can inject your own logger by passing it to the `getGaqTools` configuration:

  ```ts
  import { getGaqTools } from '@graphql-auto-queries/core';

  const myLogger = {
    info: (msg) => { /* ... */ },
    warn: (msg) => { /* ... */ },
    error: (msg) => { /* ... */ },
    debug: (msg) => { /* ... */ },
  };

  const { typeDefs, resolvers, withGaqContextFn } = getGaqTools({
    typeDefs: /* ... */,
    dbAdapter: /* ... */,
    logger: myLogger,
  });
  ```

- **Trace IDs:**  
  Every request is assigned a unique `traceId`, which is included in all log messages related to that request. This makes it easy to trace the flow of a single request through the system.

- **Log Coverage:**  
  Logging is used throughout the codebase for:

  - Server startup and schema generation
  - Query and field resolution (including selected fields and database operations)
  - Dataloader operations (for N+1 problem mitigation)
  - Error handling and debugging

- **Log Levels:**
  - `info`: High-level events (e.g., server startup)
  - `debug`: Detailed tracing of query execution, field resolution, and database access
  - `warn`: Non-critical issues
  - `error`: Errors and exceptions

### Example log output

```
[2024-05-01T12:00:00.000Z] info: Creating GraphQL Auto Queries Server...
[2024-05-01T12:00:01.000Z] debug: [traceId] Selected fields for Book: title, authorId
[2024-05-01T12:00:01.001Z] debug: [traceId] Getting data from collection books
[2024-05-01T12:00:01.002Z] error: [traceId] Error fetching data for Book: Database connection failed
```

### Summary

- You get detailed, traceable logs out of the box.
- You can fully customize logging by providing your own logger.
- All logs are traceable per request, making debugging and monitoring easy.

## TypeScript Support

gaq is built with TypeScript from the ground up. All core APIs, context, and auto-generated resolvers are fully typed, providing excellent type safety and autocompletion in your editor. You can use generics to type your context and database models, and the library will infer types for your queries and resolvers.

## Custom DB Adapter Interface

The library is database-agnostic. You can plug in your own database connector by implementing the `GaqDbAdapter` interface.

**Required interface:**

```ts
export interface GaqDbAdapter {
  getCollectionAdapter: (
    collectionName: string
  ) => GaqCollectionClient<any> | null;
}

export interface GaqCollectionClient<T extends object> {
  count(filters: GaqRootQueryFilter<T>): Promise<number>;
  getFromGaqFilters(
    filters: GaqRootQueryFilter<T>,
    selectedFields: string[],
    opts: GaqDbQueryOptions
  ): Promise<T[]>;
  getValuesInField?(
    payload: { field: string; values: any[] },
    selectedFields: string[],
    opts: GaqDbQueryOptions
  ): Promise<T[]>;
}
```

You can see an example implementation in the MongoDB adapter or the test utilities (mocked datasource).

## Handling One-to-Many and Many-to-One Relationships with @fieldResolver

The `@fieldResolver` directive is a core feature of GAQ that enables you to easily define and resolve both one-to-many and many-to-one relationships between your GraphQL types, without writing custom resolver logic.

### How it works

- **One-to-Many**: Use `@fieldResolver` on a field that returns a list, specifying how the parent key relates to the child collection's field.
- **Many-to-One**: Use `@fieldResolver` on a field that returns a single object, specifying how the parent key relates to the referenced collection's field.

The directive takes two main arguments:

- `parentKey`: The field in the parent type to match.
- `fieldKey`: The field in the related type to match against.

#### Example: One-to-Many

Suppose you have `City` and `Address` types, where a city has many addresses:

```graphql
type City @dbCollection(collectionName: "city") {
  id: Int
  city: String
  addresses: [Address] @fieldResolver(parentKey: "id", fieldKey: "city_id")
}

type Address @dbCollection(collectionName: "address") {
  address_id: Int
  address: String
  city_id: Int
}
```

Here, the `addresses` field on `City` will automatically resolve to all `Address` records where `city_id` matches the `city_id` of the parent `City`.

#### Example: Many-to-One

Suppose each address belongs to a single city:

```graphql
type Address @dbCollection(collectionName: "address") {
  address_id: Int
  address: String
  city_id: Int
  city: City @fieldResolver(parentKey: "city_id", fieldKey: "id")
}
```

Here, the `city` field on `Address` will resolve to the `City` whose `city_id` matches the `city_id` of the parent `Address`.

#### Note

In document databases, if your entity is nested in your collection, you MUST NOT use the `fieldResolver` directive.
Simply require the field in your query and it will be loaded automatically. Field resolvers are only needed if the required entity belongs to a different collection.

### Benefits

- **No custom resolver code needed**: The relationship is handled automatically by GAQ.
- **Efficient data loading**: The library uses dataloaders to batch and cache related entity lookups, avoiding the N+1 problem.
- **Consistent schema**: Relationships are clearly defined in your schema, making it easy to understand and maintain.

## Handling Many-to-Many Relationships with Intermediate Tables

Many-to-many relationships are very common in SQL databases, where an intermediate (join) table is used to associate records from two collections (tables). While less common in document databases, it is still possible if you model your data this way.

GAQ provides a convenient way to handle these relationships using a combination of the `@fieldResolver` directive (as described above) and the `@manyToManyFieldResolver` directive.

### When to Use @manyToManyFieldResolver

- **Use this directive only when your database uses an intermediate table/collection to store the relationships.**
- This is typical in SQL databases (e.g., a `film_actor` table linking `film` and `actor`).
- In document databases, if all related IDs are nested within the document itself, you should NOT use this directive—just use `@fieldResolver`.

### Example: SQL-Style Many-to-Many

Suppose you have `Actor` and `Film` types, and a `film_actor` join table:

```graphql
type Actor @dbCollection(collectionName: "actor") {
  id: Int
  first_name: String
  last_name: String
  films: [Film]
    @fieldResolver(parentKey: "id", fieldKey: "film_id")
    @manyToManyFieldResolver(
      collectionName: "film_actor"
      fieldKeyAlias: "film_id"
      parentKeyAlias: "actor_id"
    )
}

type Film @dbCollection(collectionName: "film") {
  id: Int
  title: String
}
```

- The `films` field on `Actor` will resolve to all `Film` records associated with the actor via the `film_actor` join table.
- `@fieldResolver` specifies how to match the keys between `Actor` and `Film`.
- `@manyToManyFieldResolver` tells GAQ to use the `film_actor` table to look up the relationships, using the provided aliases for the join keys.

### Example: Document Database (No Join Table)

If you are using a document database and all related IDs are stored in an array within the document, you do **not** need `@manyToManyFieldResolver`:

```graphql
type Actor @dbCollection(collectionName: "actor") {
  id: Int
  first_name: String
  last_name: String
  film_ids: [Int]
  films: [Film] @fieldResolver(parentKey: "film_ids", fieldKey: "id")
}
```

Here, the `films` field is resolved directly using the array of IDs in the document.

### Summary

- Use `@manyToManyFieldResolver` **only** when an intermediate table/collection is present (common in SQL).
- For document databases with nested arrays, use only `@fieldResolver`.
- GAQ will efficiently resolve these relationships and batch queries as needed.

## License

MIT License
