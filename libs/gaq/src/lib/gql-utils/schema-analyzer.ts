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
  GaqResolverDescription,
} from '../interfaces/common.interfaces';

/**
 * Extracts all query names from a GraphQL schema.
 *
 * @param {string} schemaString - The GraphQL schema as a string
 * @returns {string[]} An array of query names
 * @example
 **/
export function extractQueriesFromSchema(
  schemaString: string
): GaqResolverDescription[] {
  if (!schemaString) {
    return [];
  }
  // Parse the schema string into a DocumentNode
  const document = parse(schemaString);

  // Find all type definitions
  const queryType = document.definitions.find(
    (def) =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION && def.name.value === 'Query'
  );

  if (!queryType || queryType.kind !== Kind.OBJECT_TYPE_DEFINITION) {
    return [];
  }

  // Extract all field names from the Query type
  return queryType.fields.map((field) => ({
    queryName: field.name.value,
  }));
}

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
 *     title: { isReference: false, isArray: false },
 *     author: { isReference: true, isArray: false },
 *   },
 *   Author: {
 *     name: { isReference: false, isArray: false },
 *     books: { isReference: false, isArray: true },
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
    isReference: objectTypeDefinitions.get(typeName) !== undefined,
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
