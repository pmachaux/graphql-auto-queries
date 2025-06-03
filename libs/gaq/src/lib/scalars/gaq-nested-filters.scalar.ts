import { createGraphQLError } from '@graphql-tools/utils';
import { ArgumentNode, ASTNode, GraphQLScalarType, Kind } from 'graphql';
import {
  AVAILABLE_FILTER_COMPARATORS,
  GAQ_ROOT_QUERY_FILTER_CONDITION,
  GaqAndOrNorFilter,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqFilterQueryOnArrayElementMatch,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';
import { parseAstBaseValues } from './scalar.utils';

const validateLimit = (limit: any, ast?: ASTNode) => {
  if (limit > 0 && Number.isInteger(limit)) {
    return;
  }
  throw createGraphQLError(
    `Limit must be an integer higher than 0, received ${limit}`,
    {
      nodes: ast,
    }
  );
};

const validateOffset = (offset: any, ast?: ASTNode) => {
  if (offset > 0 && Number.isInteger(offset)) {
    return;
  }
  throw createGraphQLError(
    `Offset must be an integer higher than 0, received ${offset}`,
    {
      nodes: ast,
    }
  );
};

const validateSorting = (sort: any, ast?: ASTNode) => {
  if (!Array.isArray(sort)) {
    throw createGraphQLError(`Expecting an array for sorting`, {
      nodes: ast,
    });
  }
  sort.forEach((f) => {
    if (!f.key) {
      throw createGraphQLError(`Expecting key sorting`, {
        nodes: ast,
      });
    }
    if (f.order !== 1 && f.order !== -1) {
      throw createGraphQLError(
        `Expected order to be 1 or -1 for sorting received ${f.order}`,
        {
          nodes: ast,
        }
      );
    }
  });
};

const validateGaqFilterQuery = (o8Query: any, ast?: ASTNode) => {
  if (o8Query.and || o8Query.nor || o8Query.or) {
    throw createGraphQLError(
      `If your GaqFilterQueryInput has either the property key/comparator/value, you cannot also have the properties and/or/nor. Those are mutually exclusive`,
      { nodes: ast }
    );
  }
  if (!o8Query.key) {
    throw createGraphQLError(
      `If your GaqFilterQueryInput has either the property comparator, the key field must be provided`,
      { nodes: ast }
    );
  }
  if (!AVAILABLE_FILTER_COMPARATORS.some((c) => c === o8Query.comparator)) {
    throw createGraphQLError(
      `Unsupported comparator value ${o8Query.comparator}`,
      {
        nodes: ast,
      }
    );
  }
  if (o8Query.comparator === GaqFilterComparators.ARRAY_ELEMENT_MATCH) {
    if (Object.prototype.hasOwnProperty.call(o8Query, 'value')) {
      throw createGraphQLError(
        `Cannot have the value property when using ${o8Query.comparator}. Use arrayElementCondition property`,
        {
          nodes: ast,
        }
      );
    }
    validate(o8Query.arrayElementCondition);
  }
};

export const validate = (
  filterValue:
    | GaqFilterQuery<object>
    | GaqAndOrNorFilter<object>
    | GaqRootQueryFilter<object>
    | GaqFilterQueryOnArrayElementMatch<object>,
  ast?: ASTNode
):
  | GaqFilterQuery<object>
  | GaqRootQueryFilter<object>
  | GaqFilterQueryOnArrayElementMatch<object>
  | never => {
  const o8FilterQuery = filterValue as GaqFilterQuery<object>;
  const o8RootQueryFilter = filterValue as GaqRootQueryFilter<object>;

  const supportedKeys: Array<
    | keyof GaqRootQueryFilter<object>
    | keyof GaqFilterQuery<object>
    | keyof GaqFilterQueryOnArrayElementMatch<object>
  > = [
    'comparator',
    'key',
    'value',
    GAQ_ROOT_QUERY_FILTER_CONDITION.AND,
    GAQ_ROOT_QUERY_FILTER_CONDITION.OR,
    GAQ_ROOT_QUERY_FILTER_CONDITION.NOR,
    'limit',
    'offset',
    'sort',
    'arrayElementCondition',
  ];

  const unsupportedFilterValueKeys = Object.keys(filterValue).filter(
    (k) => !supportedKeys.some((sk) => sk === k)
  );
  if (unsupportedFilterValueKeys.length > 0) {
    throw createGraphQLError(
      `Some of the properties provided are not supported ${JSON.stringify(
        unsupportedFilterValueKeys
      )}`,
      {
        nodes: ast,
      }
    );
  }

  /* Validate when input o8FilterQuery */
  const isGaqFilterQuery =
    o8FilterQuery.key || o8FilterQuery.comparator || o8FilterQuery.value;
  if (isGaqFilterQuery) {
    validateGaqFilterQuery(o8FilterQuery);
  } else {
    /* When input is of type GaqRootQueryFilter or GaqAndOrNorFilter*/
    for (const [key, filterValues] of Object.entries(o8RootQueryFilter)) {
      if (key === 'limit') {
        validateLimit(filterValues, ast);
        continue;
      }
      if (key === 'offset') {
        validateOffset(filterValues, ast);
        continue;
      }
      if (key === 'sort') {
        validateSorting(filterValues, ast);
        continue;
      }

      if (!Array.isArray(filterValues)) {
        throw createGraphQLError(`Expecting an array for key ${key}`, {
          nodes: ast,
        });
      }
      filterValues.forEach((f) => {
        validate(f as GaqAndOrNorFilter<object>);
      });
    }
  }

  return filterValue;
};

export const gaqNestedFilterQueryScalar = new GraphQLScalarType({
  name: 'GaqNestedFilterQuery',
  description: 'GaqNestedFilterQuery custom scalar type',
  serialize: (value: any, ast?: ASTNode) => validate(value, ast),
  parseValue: (value: any, ast?: ASTNode) => validate(value, ast),
  parseLiteral: (ast: any) => {
    if (ast.kind === 'ObjectValue') {
      const value = Object.create(null);
      ast.fields.forEach((field: ArgumentNode) => {
        value[field.name.value] = parseAstBaseValues(field.value);
      });
      return validate(value, ast);
    }
    throw createGraphQLError(
      `Unsupported AST kind ${ast.kind} for O8NestedFilterQuery. Expecting an ObjectValue AST kind`,
      {
        nodes: ast,
      }
    );
  },
});
