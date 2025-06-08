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

## Incoming features

- Auto-generate dataloaders to solve the n+1 problems
- Mongo DB connector
- Federation support as subgraph

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

## API Highlights

### Main Entry Point

- `getGraphQLAutoQueriesServer<TContext>(config: GaqServerOptions): GaqServer<TContext>`
  - Creates an Apollo Server instance with auto-generated schema and resolvers.

### Filtering & Querying

Supports advanced query filters and comparators (e.g., `EQUAL`, `IN`, `ARRAY_CONTAINS`, etc.) for flexible data access. See `common.interfaces.ts` for all options and examples.

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
