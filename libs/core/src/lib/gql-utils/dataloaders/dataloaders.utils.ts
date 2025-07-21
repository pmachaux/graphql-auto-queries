import {
  DocumentNode,
  Kind,
  SelectionNode,
  visit,
  FragmentDefinitionNode,
} from 'graphql';
import {
  GaqFieldResolverDescription,
  GaqQuerySuffix,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';

interface FindAllTypesInQueriesResult {
  fieldResolver: GaqFieldResolverDescription;
  selectionFields: string[];
}

// Helper to recursively collect selection fields, including fragments
function collectSelectionFields(
  selections: readonly SelectionNode[],
  resolver: GaqResolverDescription | null,
  fragmentMap: Record<string, FragmentDefinitionNode>
): string[] {
  let fields: string[] = [];
  for (const selection of selections) {
    if (selection.kind === Kind.FIELD) {
      const hasFieldResolver = resolver?.fieldResolvers.some(
        (fieldResolver) => fieldResolver.fieldName === selection.name.value
      );
      if (!hasFieldResolver) {
        fields.push(selection.name.value);
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      // Inline fragment: recurse into its selection set
      fields = fields.concat(
        collectSelectionFields(
          selection.selectionSet.selections,
          resolver,
          fragmentMap
        )
      );
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      // Fragment spread: look up the fragment and recurse
      const fragment = fragmentMap[selection.name.value];
      if (fragment) {
        fields = fields.concat(
          collectSelectionFields(
            fragment.selectionSet.selections,
            resolver,
            fragmentMap
          )
        );
      }
    }
  }
  return fields;
}

export const findAllTypesInQueries = (
  ast: DocumentNode,
  gaqResolverDescriptions: GaqResolverDescription[]
): FindAllTypesInQueriesResult[] => {
  const results: FindAllTypesInQueriesResult[] = [];
  let currentResolver: GaqResolverDescription | null = null;

  // Build a fragment map for quick lookup
  const fragmentMap: Record<string, FragmentDefinitionNode> = {};
  ast.definitions.forEach((def) => {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragmentMap[def.name.value] = def;
    }
  });

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
          const collectedFields = collectSelectionFields(
            node.selectionSet.selections,
            currentResolver,
            fragmentMap
          );
          if (fieldResolverAlreadyInResults) {
            const newSelectionFields = Array.from(
              new Set([
                ...fieldResolverAlreadyInResults.selectionFields,
                ...collectedFields,
              ])
            );
            fieldResolverAlreadyInResults.selectionFields = newSelectionFields;
          } else {
            results.push({
              fieldResolver: matchingFieldResolver,
              selectionFields: collectedFields,
            });
          }
        }
      },
    },
  });

  return results;
};
