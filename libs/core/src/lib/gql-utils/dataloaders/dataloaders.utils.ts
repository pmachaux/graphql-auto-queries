import {
  DocumentNode,
  Kind,
  SelectionNode,
  visit,
  FragmentDefinitionNode,
  FieldNode,
} from 'graphql';
import {
  GaqFieldResolverDescription,
  GaqQuerySuffix,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';
import { BREAK } from 'graphql/language/visitor';

type FieldResolverInQuery = {
  fieldResolver: GaqFieldResolverDescription;
  selectionFields: string[];
};
type TypeResolverInQuery = {
  typeResolver: GaqResolverDescription;
  selectionFields: string[];
};
type FindAllTypesInQueriesResult = FieldResolverInQuery | TypeResolverInQuery;

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

export const getReferenceEntityNode = (ast: DocumentNode): FieldNode | null => {
  let referenceEntityNode: FieldNode | null = null;
  visit(ast, {
    Field: {
      enter(node) {
        if (node.name.value.endsWith(GaqQuerySuffix)) {
          referenceEntityNode = node;
          return BREAK;
        }
      },
    },
  });
  return referenceEntityNode;
};

const getTypeResolverFromEntityNode = (
  entityNode: FieldNode,
  gaqResolverDescriptions: GaqResolverDescription[]
): FindAllTypesInQueriesResult[] => {
  if (!entityNode.selectionSet) return [];

  const results: FindAllTypesInQueriesResult[] = [];

  for (const selection of entityNode.selectionSet.selections) {
    if (selection.kind === 'InlineFragment' && selection.typeCondition) {
      const typeName = selection.typeCondition.name.value;
      // Collect all field names at this level (ignore nested fields for now)
      const selectionFields: string[] = [];
      for (const fieldSel of selection.selectionSet.selections) {
        if (fieldSel.kind === 'Field') {
          const hasFieldResolver = gaqResolverDescriptions.some((resolver) =>
            resolver.fieldResolvers.some(
              (fieldResolver) =>
                fieldResolver.fieldName === (fieldSel as FieldNode).name.value
            )
          );
          if (!hasFieldResolver) {
            selectionFields.push(fieldSel.name.value);
          }
        }
      }
      // Find the resolver description for this type
      const typeResolver = gaqResolverDescriptions.find(
        (resolver) => resolver.linkedType === typeName
      );
      if (typeResolver) {
        results.push({
          typeResolver,
          selectionFields,
        });
      }
    }
  }

  return results;
};

export const findAllTypesInQueries = (
  ast: DocumentNode,
  gaqResolverDescriptions: GaqResolverDescription[]
): FindAllTypesInQueriesResult[] => {
  let results: FindAllTypesInQueriesResult[] = [];
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
        if (node.name.value === '_entities') {
          results = getTypeResolverFromEntityNode(
            node,
            gaqResolverDescriptions
          );
          return BREAK;
        }
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
            (result) =>
              (result as FieldResolverInQuery).fieldResolver &&
              (result as FieldResolverInQuery).fieldResolver ===
                matchingFieldResolver
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
