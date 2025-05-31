import { parse, Kind } from 'graphql';

export function extractQueriesFromSchema(schemaString: string): string[] {
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
  return queryType.fields.map((field) => field.name.value);
}
