import {
  parse,
  Kind,
  ObjectTypeDefinitionNode,
  DocumentNode,
  DefinitionNode,
  FieldDefinitionNode,
  TypeNode,
} from 'graphql';
import {
  DetailedGaqFieldDefinition,
  DetailedGaqTypeDefinition,
  GaqContext,
  GaqResolverDescription,
  GaqServerOptions,
} from '../interfaces/common.interfaces';
import gql from 'graphql-tag';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { ApolloServerOptions } from '@apollo/server';
import { omit } from '../utils';
import { IResolvers } from '@graphql-tools/utils';
import { getResolversFromDescriptions } from './gql-querybuilder';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { GraphQLSchemaModule } from '@apollo/subgraph/dist/buildSubgraphSchema';

/**
 * Extracts all type definitions from a GraphQL schema and returns them as a record.
 * Each type is represented as a record where the keys are field names and the values are field types.
 *
 * @param {string} schemaString - The GraphQL schema as a string
 * @returns {Record<string, Record<string, string>>} A record where:
 *   - Keys are type names (e.g., 'Book', 'Author')
 *   - The value is an object with two properties:
 *     - `plainProperties`: an array of the type's plain properties (e.g., ['title', 'author'])
 *     - `references`: an array of the type's references (e.g., ['Book'])
 * @example
 *
 * // For schema:
 * type Book {
 *   title: String
 *   author: Author
 * }
 * type Author {
 *   name: String
 *   books: [Book]
 * }
 *
 * // Returns:
 * {
 *   Book: {
 *     title: { resolveField: false, isArray: false },
 *     author: { resolveField: true, isArray: false },
 *   },
 *   Author: {
 *     name: { resolveField: false, isArray: false },
 *     books: { resolveField: false, isArray: true },
 *   },
 * }
 */
export function extractAllTypesDefinitionsFromSchema(
  schemaString: string
): Record<string, DetailedGaqTypeDefinition> {
  if (!schemaString) {
    return {};
  }
  // Parse the schema string into a DocumentNode
  const document = parse(schemaString);
  const typeDefinitions = getObjectTypesDefinitionsFromDocumentNode(document);
  const typesDefinitionsMap = new Map<string, ObjectTypeDefinitionNode>(
    typeDefinitions.map((def) => [def.name.value, def])
  );

  return typeDefinitions.reduce((acc, def) => {
    acc[def.name.value] = extractDetailedGaqFieldDefinitions(
      def.fields,
      typesDefinitionsMap
    );
    return acc;
  }, {});
}

function extractDetailedGaqFieldDefinitions(
  fields: readonly FieldDefinitionNode[],
  objectTypeDefinitions: Map<string, ObjectTypeDefinitionNode>
): Record<string, DetailedGaqFieldDefinition> {
  return fields.reduce<Record<string, DetailedGaqFieldDefinition>>(
    (acc, field) => {
      acc[field.name.value] = extractFieldDefinition(
        field,
        objectTypeDefinitions
      );
      return acc;
    },
    {}
  );
}

function extractFieldDefinition(
  field: FieldDefinitionNode,
  objectTypeDefinitions: Map<string, ObjectTypeDefinitionNode>
): DetailedGaqFieldDefinition {
  const typeName = extractTypeFromNestedType(field.type);

  return {
    resolveField: objectTypeDefinitions.get(typeName) !== undefined,
    isArray: isArrayType(field.type),
    type: typeName,
  };
}

function isArrayType(type: TypeNode): boolean {
  if (type.kind === Kind.NON_NULL_TYPE) {
    return isArrayType(type.type);
  }
  return type.kind === Kind.LIST_TYPE;
}

function extractTypeFromNestedType(type: TypeNode): string {
  if (type.kind === Kind.NON_NULL_TYPE || type.kind === Kind.LIST_TYPE) {
    return extractTypeFromNestedType(type.type);
  }
  return type.name.value;
}

// Type guard to check if a definition is an ObjectTypeDefinitionNode
function isObjectTypeDefinition(
  def: DefinitionNode
): def is ObjectTypeDefinitionNode {
  return def.kind === Kind.OBJECT_TYPE_DEFINITION;
}

const getObjectTypesDefinitionsFromDocumentNode = (
  document: DocumentNode
): ObjectTypeDefinitionNode[] => {
  return document.definitions
    .filter(isObjectTypeDefinition)
    .filter(
      (def) => def.name.value !== 'Query' && def.name.value !== 'Mutation'
    );
};

export const getAutoResolvers = (
  autoTypes: string
): GaqResolverDescription[] => {
  const typeDefinitions = extractAllTypesDefinitionsFromSchema(autoTypes);
  return Object.entries(typeDefinitions).map(([typeName, typeDefinition]) => {
    return {
      queryName: `${typeName.toLowerCase()}GaqQueryResult`,
      resultType: `${typeName}GaqResult`,
      linkedType: typeName,
    } satisfies GaqResolverDescription;
  });
};

export const getAutoSchemaAndResolvers = (
  options: Pick<GaqServerOptions, 'autoTypes'>
): { gaqSchema: string; gaqResolverDescriptions: GaqResolverDescription[] } => {
  const gaqResolverDescriptions = getAutoResolvers(options.autoTypes);

  if (gaqResolverDescriptions.length === 0) {
    return { gaqSchema: options.autoTypes, gaqResolverDescriptions: [] };
  }

  const gaqSchema =
    options.autoTypes +
    `type Query {
    ${gaqResolverDescriptions
      .map(
        (resolver) =>
          `${resolver.queryName}(filters: GaqRootFiltersInput): [${resolver.resultType}]`
      )
      .join('\n')}
  }`;

  return { gaqSchema, gaqResolverDescriptions };
};

export const getMergedSchemaAndResolvers = <TContext extends GaqContext>(
  options: Pick<
    GaqServerOptions,
    'autoTypes' | 'standardGraphqlTypes' | 'standardApolloResolvers'
  >
): Pick<ApolloServerOptions<TContext>, 'schema'> => {
  const { gaqSchema, gaqResolverDescriptions } =
    getAutoSchemaAndResolvers(options);
  const autoTypesDefs = gql`
    ${gaqSchema}
  `;
  const standardGraphqlTypesDefs = gql`
    ${options.standardGraphqlTypes}
  `;
  const typeDefs = mergeTypeDefs([autoTypesDefs, standardGraphqlTypesDefs]);
  const gaqResolvers = getResolversFromDescriptions(gaqResolverDescriptions);

  const otherResolvers = options.standardApolloResolvers
    ? omit(
        options.standardApolloResolvers as IResolvers<
          { Query?: Record<string, any> },
          TContext
        >,
        'Query'
      )
    : {};

  const schemaInputs = {
    typeDefs,
    resolvers: {
      ...otherResolvers,
      Query: {
        ...(options.standardApolloResolvers?.Query ?? {}),
        ...gaqResolvers.Query,
      },
    },
  } as GraphQLSchemaModule;
  return {
    schema: buildSubgraphSchema([schemaInputs]),
  };
};
