# gaq - GraphQL Auto Queries Library

`GAQ` (aka GraphQL Auto Queries) is a library for rapidly creating GraphQL servers with auto-generated queries and resolvers, designed for seamless integration with Apollo Server and custom database connectors. It is ideal for projects that need to expose flexible, filterable, and scalable GraphQL APIs with minimal boilerplate. It's meant to handle the 95% of queries that are purely standard.
It prefectly integrates with Apollo Graphql and still gives you the opportunity to customize everything you need.
Compared to classical REST APIs, it's meant to shift the intention from 'actions' to 'combinable resources' to query.

## Features

- **Auto-generates GraphQL schema and resolvers** from your type definitions
- **Database-agnostic**: plug in your own database connector
- **Advanced filtering and sorting** out of the box
- **Customizable logging**
- **Extensible with Apollo Server options**
- **Route guards, authorization, authentication**
- **N+1 problem handled automatically with dataloaders**

## Incoming features

- Mongo DB connector
- Federation support as subgraph
- PostGres connector
- Add traceId on logs for better request tracking

## Usage Example

Below is a minimal example of how to use `gaq` to create and start a GraphQL server:

```ts
import { getGraphQLAutoQueriesServer, GaqServerOptions } from 'gaq';

const options: GaqServerOptions = {
  autoTypes: `
    type Book @dbCollection(collectionName: "books") {
      id: ID!
      title: String
      author: String
    }
  `,
  dbConnector: {
    connect: async () => {
      /* Your connexion logic */
      return {
        collection: (name) => ({
            /* Adapter to the collection*/
            return {
                getFromGaqFilters: async () => [
                     { id: '1', title: 'GAQ Book', author: 'AI' },
                ],
                 getByField: async () => [
                     { id: '1', title: 'GAQ Book', author: 'AI' },
                ],
            }
        }),
      };
    },
  },
};

const server = getGraphQLAutoQueriesServer(options);
server
  .startGraphQLAutoQueriesServer({ listen: { port: 4000 } })
  .then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
  });
```

See how to make a query at [Filtering & Querying](#filtering--querying)

## API Highlights

### Main Entry Point

- `getGraphQLAutoQueriesServer<TContext>(config: GaqServerOptions): GaqServer<TContext>`
  - Creates an Apollo Server instance with auto-generated schema and resolvers.

### Filtering & Querying

Supports advanced query filters and comparators (e.g., `EQUAL`, `IN`, `ARRAY_CONTAINS`, etc.) for flexible data access.
Supported filter operations are:

```
enum GaqFilterComparators {
  EQUAL = '==',
  NOT_EQUAL = '!=',
  GREATER = '>=',
  STRICTLY_GREATER = '>',
  LOWER = '<=',
  STRICTLY_LOWER = '<',
  IN = 'in',
  NOT_IN = 'not-in',
  ARRAY_CONTAINS = 'array-contains',
  ARRAY_CONTAINS_ANY = 'array-contains-any',
  ARRAY_ELEMENT_MATCH = 'array-element-match',
  EXISTS = 'exists',
  NOT_EXISTS = 'not-exists',
}
```

To use them simply pass in your auto-queries something like:

```
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

#### Limitations on filtering

Filtering will only work on properties directly in the queries collection.
It does NOT work on resolved fields.
If you want to query on nested fields you need to use document database such as Mongo and have every information you need directly in the collection.

#### FilterComparators.IN

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

#### FilterComparators.ARRAY_CONTAINS

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

#### FilterComparators.ARRAY_ELEMENT_MATCH

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

#### FilterComparators.ARRAY_CONTAINS_ANY

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

### Adding route guards, authentication and authorization

The solution is based on the graphql-tools/utils: See https://the-guild.dev/graphql/tools/docs/schema-directives#enforcing-access-permissions

You simply need to pass the schemaMapper into the server options.
The adaption of example provided in the link would look like this:

```
      protectedServer = getGraphQLAutoQueriesServer({
        autoTypes: `
          directive @auth(
            role: String!,
          ) on OBJECT | FIELD_DEFINITION

          type Book @dbCollection(collectionName: "books") @auth(role: "user"){
            id: ID
            title: String
            authorId: String @auth(role: "admin")
            author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id") @auth(role: "paidUser")
          }

          type Author @dbCollection(collectionName: "authors"){
            id: ID
            name: String
            books: [Book]
          }
        `,
        dbConnector: getMockedDatasource(),
        schemaMapper: (schema: GraphQLSchema) => {
          const typeDirectiveArgumentMaps: Record<string, any> = {};
          return {
            [MapperKind.TYPE]: (type) => {
              const authDirective = getDirective(schema, type, 'auth')?.[0];
              if (authDirective) {
                typeDirectiveArgumentMaps[type.name] = authDirective;
              }
              return undefined;
            },
            [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
              const authDirective =
                getDirective(schema, fieldConfig, 'auth')?.[0] ??
                typeDirectiveArgumentMaps[typeName];
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
          } satisfies SchemaMapper;
        },
      });
      ({ url: urlProtectedServer } =
        await protectedServer.startGraphQLAutoQueriesServer({
          listen: { port: 0 },
        }));
```

## License

MIT License
