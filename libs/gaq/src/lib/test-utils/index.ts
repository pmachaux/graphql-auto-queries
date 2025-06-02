import { GraphQLResponseBody } from '@apollo/server/dist/esm/externalTypes/graphql';

export const parseGraphQLBody = <T extends object>(
  body: GraphQLResponseBody<Record<string, unknown>>
) => {
  return body as {
    singleResult: { data: T; errors: unknown };
  };
};
