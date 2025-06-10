import {
  parse,
  Kind,
  ObjectTypeDefinitionNode,
  DocumentNode,
  DefinitionNode,
  FieldDefinitionNode,
  TypeNode,
  StringValueNode,
  visit,
} from 'graphql';
import {
  DetailedGaqFieldDefinition,
  DetailedGaqTypeDefinition,
  GaqContext,
  GaqDbClient,
  GaqFieldResolverArguments,
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
import { mapSchema } from '@graphql-tools/utils';
import * as DataLoader from 'dataloader';
import { getNewDataLoaderFromFieldResolver } from './dataloader';

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
 * Extracts all type definitions from a GraphQL schema string and converts them into a detailed type definition format.
 *
 * This function parses a GraphQL schema string and extracts all object type definitions, excluding Query and Mutation types.
 * For each type, it processes its fields and their directives to create a detailed type definition that includes:
 * - Field types
 * - Array information
 * - Field resolver information (if @fieldResolver directive is present)
 *
 * @param schemaString - The GraphQL schema string to parse and analyze
 * @returns A record mapping type names to their detailed definitions, where each definition contains:
 *          - name: The type name
 *          - properties: A record of field definitions, each containing:
 *            - fieldResolver: Information about field resolution (if applicable)
 *            - isArray: Whether the field is an array type
 *            - type: The base type of the field
 *          - dbCollectionName: The database collection name (from @dbCollection directive)
 *
 * @example
 * ```typescript
 * const schema = `
 *   type Book @dbCollection(collectionName: "books") {
 *     title: String
 *     author: Author @fieldResolver(parentKey: "authorId", fieldKey: "id")
 *   }
 * `;
 * const types = extractAllTypesDefinitionsFromSchema(schema);
 * // Returns:
 * // {
 * //   Book: {
 * //     title: { fieldResolver: null, isArray: false, type: "String" },
 * //     author: {
 * //       fieldResolver: { parentKey: "authorId", fieldKey: "id" },
 * //       isArray: false,
 * //       type: "Author"
 * //     }
 * //   }
 * // }
 * ```
 */

function extractAllTypesDefinitionsFromSchema(
  schemaString: string
): DetailedGaqTypeDefinition[] {
  if (!schemaString) {
    return [];
  }
  // Parse the schema string into a DocumentNode
  const document = parse(schemaString);
  const typeDefinitions = getObjectTypesDefinitionsFromDocumentNode(document);

  return typeDefinitions.map((def) => {
    const dbCollectionDirective = def.directives?.find(
      (directive) => directive.name.value === 'dbCollection'
    );
    if (!dbCollectionDirective) {
      throw new Error(
        `@dbCollection directive is required on type ${def.name.value}`
      );
    }
    const dbCollectionName = dbCollectionDirective?.arguments?.find(
      (arg) => arg.name.value === 'collectionName'
    )?.value as StringValueNode;
    if (!dbCollectionName) {
      throw new Error(
        `collectionName argument is required on directive @dbCollection on type ${def.name.value}`
      );
    }

    return {
      name: def.name.value,
      properties: extractDetailedGaqFieldDefinitions(def.fields),
      dbCollectionName: dbCollectionName.value,
    };
  });
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

  let fieldResolver: GaqFieldResolverArguments | null = null;
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

const getFieldResolversFromProperties = (
  propertiesToResolve: {
    name: string;
    definition: DetailedGaqFieldDefinition;
  }[],
  typeDefinition: DetailedGaqTypeDefinition
) => {
  return propertiesToResolve.map((propertyToResolve) => {
    return {
      parentKey: propertyToResolve.definition.fieldResolver.parentKey,
      fieldKey: propertyToResolve.definition.fieldResolver.fieldKey,
      isArray: propertyToResolve.definition.isArray,
      fieldType: propertyToResolve.definition.type,
      fieldName: propertyToResolve.name,
      dataloaderName: `${typeDefinition.name}${propertyToResolve.name}Dataloader`,
    } satisfies GaqFieldResolverDescription;
  });
};

export const getAutoResolversAndDataloaders = (
  autoTypes: string,
  gaqDbClient: GaqDbClient,
  dbCollectionNameMap: Map<string, string>
): {
  gaqResolverDescriptions: GaqResolverDescription[];
  gaqDataloaders: Map<string, DataLoader<any, any, any>>;
} => {
  const typeDefinitions = extractAllTypesDefinitionsFromSchema(autoTypes);

  const gaqResolverDescriptions = typeDefinitions.map((typeDefinition) => {
    const propertiesToResolve = Object.entries(typeDefinition.properties)
      .filter(([_, fieldDefinition]) => fieldDefinition.fieldResolver)
      .map(([fieldName, fieldDefinition]) => ({
        name: fieldName,
        definition: fieldDefinition as DetailedGaqFieldDefinition,
      }));
    const fieldResolvers = getFieldResolversFromProperties(
      propertiesToResolve,
      typeDefinition
    );
    return {
      queryName: `${typeDefinition.name.toLowerCase()}GaqQueryResult`,
      resultType: `${typeDefinition.name}GaqResult`,
      linkedType: typeDefinition.name,
      fieldResolvers,
      dbCollectionName: typeDefinition.dbCollectionName,
    } satisfies GaqResolverDescription;
  });

  const gaqDataloaders = new Map<string, DataLoader<any, any, any>>();
  gaqResolverDescriptions.forEach((resolverDescription) => {
    resolverDescription.fieldResolvers.forEach((fieldResolver) => {
      const dataloader = getNewDataLoaderFromFieldResolver(
        fieldResolver,
        dbCollectionNameMap,
        gaqDbClient
      );
      const dataloaderName = `${resolverDescription.linkedType}${fieldResolver.fieldName}Dataloader`;
      gaqDataloaders.set(dataloaderName, dataloader);
    });
  });

  return {
    gaqResolverDescriptions,
    gaqDataloaders,
  };
};

export const getAutoSchemaAndResolvers = (
  options: Pick<GaqServerOptions, 'autoTypes' | 'dbClient'>,
  dbCollectionNameMap: Map<string, string>
): {
  gaqSchema: string;
  gaqResolverDescriptions: GaqResolverDescription[];
  gaqDataloaders: Map<string, DataLoader<any, any, any>>;
} => {
  const logger = getLogger();
  logger.debug('Building auto resolvers');
  const { gaqResolverDescriptions, gaqDataloaders } =
    getAutoResolversAndDataloaders(
      options.autoTypes,
      options.dbClient,
      dbCollectionNameMap
    );

  if (gaqResolverDescriptions.length === 0) {
    logger.debug('No auto resolvers to build');
    return {
      gaqSchema: options.autoTypes,
      gaqResolverDescriptions: [],
      gaqDataloaders: new Map(),
    };
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
  return { gaqSchema, gaqResolverDescriptions, gaqDataloaders };
};

export const setDbCollectionNameMap = (
  typeDefs: DocumentNode,
  dbCollectionNameMap: Map<string, string>
): void => {
  visit(typeDefs, {
    ObjectTypeDefinition(node) {
      if (node.name.value === 'Query' || node.name.value === 'Mutation') {
        return;
      }
      const dbCollectionDirective = node.directives?.find(
        (directive) => directive.name.value === 'dbCollection'
      );
      if (dbCollectionDirective) {
        const collectionNameArg = dbCollectionDirective.arguments?.find(
          (arg) => arg.name.value === 'collectionName'
        );
        if (collectionNameArg?.value.kind === Kind.STRING) {
          dbCollectionNameMap.set(
            node.name.value,
            collectionNameArg.value.value
          );
        }
      }
    },
  });
  return;
};

export const getMergedSchemaAndResolvers = <TContext extends GaqContext>(
  options: Pick<
    GaqServerOptions,
    | 'autoTypes'
    | 'standardGraphqlTypes'
    | 'standardApolloResolvers'
    | 'schemaMapper'
    | 'dbClient'
  >
): Pick<ApolloServerOptions<TContext>, 'schema'> & {
  gaqDataloaders: Map<string, DataLoader<any, any, any>>;
} => {
  const logger = getLogger();
  const dbCollectionNameMap = new Map<string, string>();
  const { gaqSchema, gaqResolverDescriptions, gaqDataloaders } =
    getAutoSchemaAndResolvers(options, dbCollectionNameMap);
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

  setDbCollectionNameMap(typeDefs, dbCollectionNameMap);

  logger.debug('Merged schema');
  const resolvers = generateResolvers<TContext>({
    dbCollectionNameMap,
    gaqResolverDescriptions,
    standardApolloResolvers: options.standardApolloResolvers,
  });
  logger.debug('Auto resolvers built and merged with standard ones');

  const executableSchema = makeExecutableSchema({
    typeDefs,
    resolvers,
  });
  const schema = options.schemaMapper
    ? mapSchema(executableSchema, options.schemaMapper(executableSchema))
    : executableSchema;

  return {
    schema,
    gaqDataloaders,
  };
};
