import { DocumentNode, FieldNode, Kind, SelectionNode, visit } from 'graphql';
import {
  GaqFieldResolverDescription,
  GaqQuerySuffix,
  GaqResolverDescription,
  SchemaIndex,
} from '../../interfaces/common.interfaces';

interface FindAllTypesInQueriesResult {
  fieldResolver: GaqFieldResolverDescription;
  selectionFields: string[];
}

const resolveSelectionFieldForFieldResolver = (
  selections: readonly SelectionNode[],
  currentResolver: GaqResolverDescription | null
): string[] => {
  return selections
    .filter((s) => {
      if (s.kind !== Kind.FIELD) {
        return false;
      }
      const hasFieldResolver = currentResolver?.fieldResolvers.some(
        (fieldResolver) => fieldResolver.fieldName === s.name.value
      );
      return !hasFieldResolver;
    })
    .map((selection) => {
      return (selection as FieldNode).name.value;
    });
};

export const findAllTypesInQueries = (
  ast: DocumentNode,
  gaqResolverDescriptions: GaqResolverDescription[]
): FindAllTypesInQueriesResult[] => {
  const results: FindAllTypesInQueriesResult[] = [];

  let currentResolver: GaqResolverDescription | null = null;

  visit(ast, {
    Field: {
      enter(node) {
        const isGaqQueryField = node.name.value.endsWith(GaqQuerySuffix);
        if (isGaqQueryField) {
          const gaqQueryFieldResolver = gaqResolverDescriptions.find(
            (resolver) => resolver.queryName === node.name.value
          );
          if (gaqQueryFieldResolver) {
            currentResolver = gaqQueryFieldResolver;
          }
          return;
        }
        const hasSelectionFields = node.selectionSet?.selections.length > 0;
        const matchingFieldResolver = currentResolver?.fieldResolvers.find(
          (fieldResolver) => fieldResolver.fieldName === node.name.value
        );
        if (hasSelectionFields && matchingFieldResolver) {
          currentResolver = gaqResolverDescriptions.find(
            (resolver) =>
              resolver.linkedType === matchingFieldResolver.fieldType
          );
          const fieldResolverAlreadyInResults = results.find(
            (result) => result.fieldResolver === matchingFieldResolver
          );
          if (fieldResolverAlreadyInResults) {
            const newSelectionFields = Array.from(
              new Set([
                ...fieldResolverAlreadyInResults.selectionFields,
                ...resolveSelectionFieldForFieldResolver(
                  node.selectionSet.selections,
                  currentResolver
                ),
              ])
            );
            fieldResolverAlreadyInResults.selectionFields = newSelectionFields;
          } else {
            results.push({
              fieldResolver: matchingFieldResolver,
              selectionFields: resolveSelectionFieldForFieldResolver(
                node.selectionSet.selections,
                currentResolver
              ),
            });
          }
        }
      },
    },
  });

  return results;
};
