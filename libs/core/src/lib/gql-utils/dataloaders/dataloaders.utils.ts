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
import {
  FieldResolverInQuery,
  FindAllTypesInQueriesResult,
  TypeResolverInQuery,
} from './dataloaders.interface';
import { isFieldResolverInQuery } from '../../utils';

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

function getRemainingFieldsInSelection(
  alreadyCollectedFields: string[],
  selections: readonly SelectionNode[]
): readonly SelectionNode[] {
  return selections.filter((selection) => {
    return !alreadyCollectedFields.some(
      (f) => f === (selection as FieldNode).name?.value
    );
  });
}

// Helper to recursively collect nested field resolvers
function collectNestedFieldResolvers(
  selections: readonly any[],
  currentResolver: GaqResolverDescription | null,
  gaqResolverDescriptions: GaqResolverDescription[],
  fragmentMap: Record<string, FragmentDefinitionNode>,
  results: FindAllTypesInQueriesResult[],
  skipTypeResolver: boolean
) {
  const collectedFields = collectSelectionFields(
    selections,
    currentResolver,
    fragmentMap
  );
  if (currentResolver && !skipTypeResolver) {
    addTypeResolverToResultSet(results, currentResolver, collectedFields);
  }
  const remainingSelections = getRemainingFieldsInSelection(
    collectedFields,
    selections
  );
  for (const sel of remainingSelections) {
    if (sel.kind === 'Field' && currentResolver) {
      const matchingFieldResolver = currentResolver.fieldResolvers.find(
        (fieldResolver) => fieldResolver.fieldName === sel.name.value
      );
      const nextResolver = gaqResolverDescriptions.find(
        (resolver) => resolver.linkedType === matchingFieldResolver.fieldType
      );
      if (matchingFieldResolver && nextResolver) {
        const fieldResolverCollectedFields = collectSelectionFields(
          sel.selectionSet.selections,
          nextResolver,
          fragmentMap
        );
        addFieldResolverToResultSet(
          results,
          matchingFieldResolver,
          currentResolver,
          fieldResolverCollectedFields
        );
        const remainingFieldResolversSelections = getRemainingFieldsInSelection(
          fieldResolverCollectedFields,
          sel.selectionSet.selections
        );
        // Collect direct fields for this field resolver
        if (remainingFieldResolversSelections.length > 0) {
          collectNestedFieldResolvers(
            remainingFieldResolversSelections,
            nextResolver,
            gaqResolverDescriptions,
            fragmentMap,
            results,
            true
          );
        }
      }
    } else if (sel.kind === 'FragmentSpread' && sel.name.value) {
      const fragment = fragmentMap[sel.name.value];
      if (fragment) {
        collectNestedFieldResolvers(
          fragment.selectionSet.selections,
          currentResolver,
          gaqResolverDescriptions,
          fragmentMap,
          results,
          true
        );
      }
    }
  }
}

const getTypeResolverFromEntityNode = (
  entityNode: FieldNode,
  gaqResolverDescriptions: GaqResolverDescription[],
  fragmentMap: Record<string, FragmentDefinitionNode>
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
        addTypeResolverToResultSet(results, typeResolver, selectionFields);
        // Now handle nested fields with field resolvers
        collectNestedFieldResolvers(
          selection.selectionSet.selections,
          typeResolver,
          gaqResolverDescriptions,
          fragmentMap,
          results,
          false
        );
      }
    }
  }

  return results;
};

function addTypeResolverToResultSet(
  results: FindAllTypesInQueriesResult[],
  typeResolver: GaqResolverDescription,
  selectionFields: string[]
) {
  const typeResolverAlreadyInResults = results.find((result) => {
    return (result as TypeResolverInQuery).typeResolver === typeResolver;
  }) as TypeResolverInQuery | undefined;
  if (typeResolverAlreadyInResults) {
    const newSelectionFields = Array.from(
      new Set([
        ...typeResolverAlreadyInResults.selectionFields,
        ...selectionFields,
      ])
    );
    typeResolverAlreadyInResults.selectionFields = newSelectionFields;
    return results;
  }
  results.push({
    typeResolver,
    selectionFields: Array.from(new Set(selectionFields)),
  });
  return results;
}

function addFieldResolverToResultSet(
  results: FindAllTypesInQueriesResult[],
  fieldResolver: GaqFieldResolverDescription,
  parentResolver: GaqResolverDescription,
  selectionFields: string[]
) {
  const fieldResolverAlreadyInResults = results.find((result) => {
    return (
      isFieldResolverInQuery(result) && result.fieldResolver === fieldResolver
    );
  });
  if (fieldResolverAlreadyInResults) {
    const newSelectionFields = Array.from(
      new Set([
        ...fieldResolverAlreadyInResults.selectionFields,
        ...selectionFields,
      ])
    );
    fieldResolverAlreadyInResults.selectionFields = newSelectionFields;
    return results;
  }
  results.push({
    fieldResolver,
    selectionFields: Array.from(new Set(selectionFields)),
    parentResolver,
  });
  return results;
}

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
            gaqResolverDescriptions,
            fragmentMap
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
          const nextResolver = gaqResolverDescriptions.find(
            (resolver) =>
              resolver.linkedType === matchingFieldResolver.fieldType
          );
          const collectedFields = collectSelectionFields(
            node.selectionSet.selections,
            nextResolver,
            fragmentMap
          );
          addFieldResolverToResultSet(
            results,
            matchingFieldResolver,
            currentResolver,
            collectedFields
          );
          currentResolver = nextResolver;
        }
      },
    },
  });

  return results;
};
