import {
  parse,
  Kind,
  ObjectTypeDefinitionNode,
  DocumentNode,
  DefinitionNode,
  FieldDefinitionNode,
  TypeNode,
  StringValueNode,
} from 'graphql';
import {
  DetailedGaqFieldDefinition,
  DetailedGaqTypeDefinition,
  GaqContext,
  GaqFieldResolverDescription,
  GaqResolverDescription,
  GaqServerOptions,
} from '../interfaces/common.interfaces';
import gql from 'graphql-tag';
import { mergeTypeDefs } from '@graphql-tools/merge';
import { ApolloServerOptions } from '@apollo/server';
import { generateResolvers } from './resolver-builder';

import { makeExecutableSchema } from '@graphql-tools/schema';
import { getLogger } from '../logger';

const gaqDefaultScalarsAndInputs = `
# Gaq custom scalar
scalar GaqNestedFilterQuery

# Gaq custom directive
directive @fieldResolver (
  parentKey: String!
  fieldKey: String!
) on FIELD_DEFINITION

directive @dbCollection(
  collectionName: String!
) on OBJECT

input GaqSortingParams {
  "Must a field or nested field of the object queried. In case of nested field, use dot notation."
  key: String!
  "Must be 1 or -1"
  order: Int!
}

input GaqRootFiltersInput {
  and: [GaqNestedFilterQuery]
  or: [GaqNestedFilterQuery]
  nor: [GaqNestedFilterQuery]
  "Offset to start the query from. If not there, default offset is 0."
  offset: Int
  "Limit the number of results. Is applied after offset"
  limit: Int
  "Order of sorting parameters matters. The first sorting parameter will be the primary sort key."
  sort: [GaqSortingParams]
}
`;

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

  return typeDefinitions.reduce((acc, def) => {
    acc[def.name.value] = extractDetailedGaqFieldDefinitions(def.fields);
    return acc;
  }, {});
}

function extractDetailedGaqFieldDefinitions(
  fields: readonly FieldDefinitionNode[]
): Record<string, DetailedGaqFieldDefinition> {
  return fields.reduce<Record<string, DetailedGaqFieldDefinition>>(
    (acc, field) => {
      acc[field.name.value] = extractFieldDefinition(field);
      return acc;
    },
    {}
  );
}

function extractFieldDefinition(
  field: FieldDefinitionNode
): DetailedGaqFieldDefinition {
  const typeName = extractTypeFromNestedType(field.type);

  let fieldResolver: { parentKey: string; fieldKey: string } | null = null;
  const fieldResolverDirective = field.directives?.find(
    (directive) => directive.name.value === 'fieldResolver'
  );
  if (fieldResolverDirective) {
    const parentKeyArgument = fieldResolverDirective.arguments?.find(
      (arg) => arg.name.value === 'parentKey'
    )?.value;
    if (!parentKeyArgument) {
      throw new Error(
        'parentKey argument is required on directive @fieldResolver'
      );
    }
    const parentKey = (parentKeyArgument as StringValueNode).value;

    const fieldKeyArgument = fieldResolverDirective.arguments?.find(
      (arg) => arg.name.value === 'fieldKey'
    )?.value;
    if (!fieldKeyArgument) {
      throw new Error(
        'fieldKey argument is required on directive @fieldResolver'
      );
    }
    const fieldKey = (fieldKeyArgument as StringValueNode).value;
    fieldResolver = { parentKey, fieldKey };
  }
  return {
    fieldResolver,
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
    const propertiesToResolve = Object.entries(typeDefinition)
      .filter(([_, fieldDefinition]) => fieldDefinition.fieldResolver)
      .map(([fieldName, fieldDefinition]) => ({
        name: fieldName,
        definition: fieldDefinition as DetailedGaqFieldDefinition,
      }));
    const fieldResolvers = propertiesToResolve.map((propertyToResolve) => {
      return {
        parentKey: propertyToResolve.definition.fieldResolver.parentKey,
        fieldKey: propertyToResolve.definition.fieldResolver.fieldKey,
        isArray: propertyToResolve.definition.isArray,
        fieldType: propertyToResolve.definition.type,
        fieldName: propertyToResolve.name,
      } satisfies GaqFieldResolverDescription;
    });
    return {
      queryName: `${typeName.toLowerCase()}GaqQueryResult`,
      resultType: `${typeName}GaqResult`,
      linkedType: typeName,
      fieldResolvers,
    } satisfies GaqResolverDescription;
  });
};

export const getAutoSchemaAndResolvers = (
  options: Pick<GaqServerOptions, 'autoTypes'>
): { gaqSchema: string; gaqResolverDescriptions: GaqResolverDescription[] } => {
  const logger = getLogger();
  logger.debug('Building auto resolvers');
  const gaqResolverDescriptions = getAutoResolvers(options.autoTypes);

  if (gaqResolverDescriptions.length === 0) {
    logger.debug('No auto resolvers to build');
    return { gaqSchema: options.autoTypes, gaqResolverDescriptions: [] };
  }
  logger.debug(
    `Found ${gaqResolverDescriptions.length} auto resolvers to build`
  );

  logger.debug('Building auto schema');
  const gaqSchema =
    gaqDefaultScalarsAndInputs +
    options.autoTypes +
    gaqResolverDescriptions
      .map(
        (resolver) => `type ${resolver.resultType} {
        result: [${resolver.linkedType}]
        count: Int
      }`
      )
      .join('\n') +
    `type Query {
    ${gaqResolverDescriptions
      .map(
        (resolver) =>
          `${resolver.queryName}(filters: GaqRootFiltersInput): ${resolver.resultType}`
      )
      .join('\n')}
  }`;

  logger.debug('Auto schema built');
  return { gaqSchema, gaqResolverDescriptions };
};

export const getMergedSchemaAndResolvers = <TContext extends GaqContext>(
  options: Pick<
    GaqServerOptions,
    'autoTypes' | 'standardGraphqlTypes' | 'standardApolloResolvers'
  >
): Pick<ApolloServerOptions<TContext>, 'schema'> => {
  const logger = getLogger();
  const { gaqSchema, gaqResolverDescriptions } =
    getAutoSchemaAndResolvers(options);
  const autoTypesDefs = gql`
    ${gaqSchema}
  `;
  const standardGraphqlTypesDefs = options.standardGraphqlTypes
    ? gql`
        ${options.standardGraphqlTypes}
      `
    : null;
  const typeDefs = standardGraphqlTypesDefs
    ? mergeTypeDefs([autoTypesDefs, standardGraphqlTypesDefs])
    : autoTypesDefs;

  logger.debug('Merged schema');
  const resolvers = generateResolvers<TContext>({
    gaqResolverDescriptions,
    standardApolloResolvers: options.standardApolloResolvers,
  });
  logger.debug('Auto resolvers built and merged with standard ones');

  return {
    schema: makeExecutableSchema({
      typeDefs,
      resolvers,
    }),
  };
};
