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
  IntValueNode,
} from 'graphql';
import {
  DetailedGaqFieldDefinition,
  DetailedGaqTypeDefinition,
  GaqContext,
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

const gaqDefaultScalarsAndInputs = `
# Gaq custom scalar
scalar GaqNestedFilterQuery

# Gaq custom directives
directive @fieldResolver (
  parentKey: String!
  fieldKey: String!
  limit: Int
) on FIELD_DEFINITION

directive @dbCollection(
  collectionName: String!
) on OBJECT

directive @limit(default: Int, max: Int) on OBJECT

# End of Gaq custom directives

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

function getDefaultAndMaxLimitFromDirective(def: ObjectTypeDefinitionNode): {
  defaultLimit: number | null;
  maxLimit: number | null;
} {
  const limitDirective = def.directives?.find(
    (directive) => directive.name.value === 'limit'
  );
  const defaultLimit = limitDirective?.arguments?.find(
    (arg) => arg.name.value === 'default'
  )?.value as IntValueNode;
  const defaultLimitValue = defaultLimit?.value
    ? parseInt(defaultLimit?.value)
    : null;
  if (
    defaultLimitValue &&
    (isNaN(defaultLimitValue) || defaultLimitValue <= 0)
  ) {
    throw new Error(
      `Default limit argument must be a positive integer on directive @limit on type ${def.name.value}`
    );
  }

  const maxLimit = limitDirective?.arguments?.find(
    (arg) => arg.name.value === 'max'
  )?.value as IntValueNode;
  const maxLimitValue = maxLimit?.value ? parseInt(maxLimit?.value) : null;
  if (maxLimitValue && (isNaN(maxLimitValue) || maxLimitValue <= 0)) {
    throw new Error(
      `Max limit argument must be a positive integer on directive @limit on type ${def.name.value}`
    );
  }

  return {
    defaultLimit: defaultLimitValue,
    maxLimit: maxLimitValue,
  };
}

function getDbCollectionNameFromDirective(def: ObjectTypeDefinitionNode): {
  dbCollectionName: string;
} {
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
    dbCollectionName: dbCollectionName.value,
  };
}

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
    return {
      name: def.name.value,
      properties: extractDetailedGaqFieldDefinitions(def.fields),
      ...getDbCollectionNameFromDirective(def),
      ...getDefaultAndMaxLimitFromDirective(def),
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

function getParentAndFieldKeyFromDirective(
  field: FieldDefinitionNode
): GaqFieldResolverArguments {
  const fieldResolverDirective = field.directives?.find(
    (directive) => directive.name.value === 'fieldResolver'
  );
  field.directives?.find(
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

    const limitArgument = fieldResolverDirective.arguments?.find(
      (arg) => arg.name.value === 'limit'
    )?.value;
    const limit = limitArgument
      ? parseInt((limitArgument as IntValueNode).value)
      : null;
    if (limit && (isNaN(limit) || limit <= 0)) {
      throw new Error(
        `Limit argument must be a positive integer on directive @fieldResolver on field ${field.name.value}`
      );
    }

    return { parentKey, fieldKey, limit };
  }
  return null;
}

function extractFieldDefinition(
  field: FieldDefinitionNode
): DetailedGaqFieldDefinition {
  const typeName = extractTypeFromNestedType(field.type);

  return {
    fieldResolver: getParentAndFieldKeyFromDirective(field),
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
      limit: propertyToResolve.definition.fieldResolver.limit,
    } satisfies GaqFieldResolverDescription;
  });
};

export const getAutoResolversAndDataloaders = (
  autoTypes: string
): {
  gaqResolverDescriptions: GaqResolverDescription[];
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
      defaultLimit: typeDefinition.defaultLimit,
      maxLimit: typeDefinition.maxLimit,
    } satisfies GaqResolverDescription;
  });

  return {
    gaqResolverDescriptions,
  };
};

export const getAutoSchemaAndResolvers = (
  options: Pick<GaqServerOptions, 'autoTypes' | 'dbAdapter'>
): {
  gaqSchema: string;
  gaqResolverDescriptions: GaqResolverDescription[];
} => {
  const logger = getLogger();
  logger.debug('Building auto resolvers');
  const { gaqResolverDescriptions } = getAutoResolversAndDataloaders(
    options.autoTypes
  );

  if (gaqResolverDescriptions.length === 0) {
    logger.debug('No auto resolvers to build');
    return {
      gaqSchema: options.autoTypes,
      gaqResolverDescriptions: [],
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
  return { gaqSchema, gaqResolverDescriptions };
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
    | 'dbAdapter'
  >
): Pick<ApolloServerOptions<TContext>, 'schema'> & {
  gaqResolverDescriptions: GaqResolverDescription[];
  dbCollectionNameMap: Map<string, string>;
} => {
  const logger = getLogger();
  const dbCollectionNameMap = new Map<string, string>();
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
    gaqResolverDescriptions,
    dbCollectionNameMap,
  };
};
