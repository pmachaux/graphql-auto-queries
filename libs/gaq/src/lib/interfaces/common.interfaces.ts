import { ApolloServer, ApolloServerOptions, BaseContext } from '@apollo/server';
import { LooseAutocomplete, Prettify } from './ts-wizard.interface';
import {
  IResolvers,
  ISchemaLevelResolver,
  SchemaMapper,
} from '@graphql-tools/utils';
import { StartStandaloneServerOptions } from '@apollo/server/dist/esm/standalone';
import { ListenOptions } from 'net';
import { GraphQLSchema } from 'graphql';
import type DataLoader = require('dataloader');

export interface GaqLogger {
  info: (message: any) => void;
  warn: (message: any) => void;
  error: (message: any) => void;
  debug: (message: any) => void;
}

export interface GaqContext extends BaseContext {
  gaqDbClient: GaqDbAdapter;
  gaqDataloaders: Map<string, DataLoader<any, any, any>>;
  traceId: string;
}

/**
 * Configuration options specific to GraphQL Auto Queries server
 * @property {string} autoTypes - Provide types you want the associated queries to be auto-generated and auto-resolved
 * @property {GaqDbConnector} dbConnector - Database connector instance for handling database operations
 * @property {ApolloServerOptions<GaqContext>['typeDefs']} [standardGraphqlTypes] - (Optional) other schema definitions that won't be auto-generated and will be merged with auto-generated types. It replaces the typeDefs property of the ApolloServerOptions.
 * @property {IResolvers<{ Query?: Record<string, any> } & Record<string, any>, GaqContext>} [standardApolloResolvers] - (Optional) non auto-generated resolvers that will be merged with auto-generated resolvers. It replaces the resolvers property of the ApolloServerOptions.
 * @property {GaqLogger} [logger] - (Optional) logger instance for server logging. If not provided, a default logger will be used.
 * @property {SchemaMapper} [schemaMapper] - (Optional) schema mapper used for transformations with graphql-tools library. See https://the-guild.dev/graphql/tools/docs/schema-directives#enforcing-access-permissions
 */

export type GaqOnlyServerOptions = {
  autoTypes: string;
  dbAdapter: GaqDbAdapter;
  standardGraphqlTypes?: ApolloServerOptions<GaqContext>['typeDefs'];
  standardApolloResolvers?: IResolvers<
    { Query?: Record<string, any> } & Record<string, any>,
    GaqContext
  >;
  logger?: GaqLogger;
  schemaMapper?: (schema: GraphQLSchema) => SchemaMapper;
};

export type GaqServerOptions = Prettify<
  Omit<ApolloServerOptions<GaqContext>, 'typeDefs' | 'resolvers' | 'schema'> &
    GaqOnlyServerOptions
>;
export type GaqServer<TContext extends GaqContext = GaqContext> =
  ApolloServer<TContext> & {
    startGraphQLAutoQueriesServer: (
      options?: StartStandaloneServerOptions<TContext> & {
        listen?: ListenOptions;
      }
    ) => Promise<{ url: string }>;
  };

export type GaqFieldResolverArguments = {
  parentKey: string;
  fieldKey: string;
  limit: number | null;
};
export type GaqFieldResolverDescription = Prettify<
  GaqFieldResolverArguments & {
    isArray: boolean;
    fieldType: string;
    fieldName: string;
    dataloaderName: string;
  }
>;

export interface GaqResolverDescription {
  queryName: string;
  resultType: string;
  linkedType: string;
  fieldResolvers: GaqFieldResolverDescription[];
  dbCollectionName: string;
  defaultLimit: number | null;
  maxLimit: number | null;
}

export interface DetailedGaqFieldDefinition {
  fieldResolver: GaqFieldResolverArguments | null;
  isArray: boolean;
  type: string;
}

export interface DetailedGaqTypeDefinition {
  name: string;
  properties: Record<string, DetailedGaqFieldDefinition>;
  dbCollectionName: string;
  defaultLimit: number | null;
  maxLimit: number | null;
}

export interface GaqResult<T extends object> {
  results?: T[] | null;
  count?: number;
}

export interface GaqResolverFn<T extends object> {
  (parent: any, args: any, contextValue: any, info: any): Promise<
    GaqResult<T[]>
  >;
}

export type GaqSchemaLevelResolver<TParent extends object = object> =
  ISchemaLevelResolver<
    TParent,
    GaqContext,
    { filters: GaqRootQueryFilter<TParent> },
    any
  >;

/**************************************************
 **********  Database adapter interfaces  **********
 **************************************************/

export type GaqDbQueryOptions = {
  sort?: GaqSortingParam[] /* Sorting order is important, first element in array is sorted first */;
  limit?: number;
  offset?: number;
  logger: GaqLogger;
  traceId: string;
};

export interface GaqCollectionClient<T extends object> {
  count(filters: GaqRootQueryFilter<T>): Promise<number>;
  getFromGaqFilters(
    filters: GaqRootQueryFilter<T>,
    selectedFields: string[],
    opts: GaqDbQueryOptions
  ): Promise<T[]>;
  getValuesInField(
    payload: { field: string; values: any[] },
    selectedFields: string[],
    opts: GaqDbQueryOptions
  ): Promise<T[]>;
}

export interface GaqDbAdapter {
  getCollectionAdapter: (
    collectionName: string
  ) => GaqCollectionClient<any> | null;
}

/**************************************************
 **********  END OF DATABASE ADAPTER INTERFACES  **********
 **************************************************/

/**************************************************
 **********  Query filters interfaces  **********
 **************************************************/

export enum GaqFilterComparators {
  EQUAL = '==',
  NOT_EQUAL = '!=',
  GREATER = '>=',
  STRICTLY_GREATER = '>',
  LOWER = '<=',
  STRICTLY_LOWER = '<',
  IN = 'in',
  NOT_IN = 'not-in',
  ARRAY_CONTAINS = 'array-contains',
  ARRAY_CONTAINS_ANY = 'array-contains-any',
  ARRAY_ELEMENT_MATCH = 'array-element-match',
  EXISTS = 'exists',
  NOT_EXISTS = 'not-exists',
}

/*
  ----  FilterComparators.IN  ----
    It applies on primitive fields. Value provided in the query filter must be an array.
    If the field value matches any of the values provided in the filter. Then it returns a match.
    Example 1:
      Data
        {name: 'bob'};
      GaqFilterQuery
         {key: 'name', comparator: FilterComparators.IN, value: ['bob', 'martin']}
    This returns a match
    Example 2:
      Data
        {name: 'bob'};
      GaqFilterQuery
        {key: 'name', comparator: FilterComparators.IN, value: ['george', 'martin']}
    This does NOT return a match
  ----

  ----  FilterComparators.NOT_IN  ----
    It applies on primitive fields. Value provided in the query filter must be an array.
    If the field value matches any of the values provided in the filter. Then it does NOT returns a match.
    This operation is the negative of FilterComparators.IN
    Example 1:
      Data
        {name: 'bob'};
      GaqFilterQuery
      {key: 'name', comparator: FilterComparators.NOT_IN, value: ['bob', 'martin']}
    This does NOT returns match
    Example 2:
      Data
        {name: 'bob'};
      GaqFilterQuery
        {key: 'name', comparator: FilterComparators.NOT_IN, value: ['george', 'martin']}
    This returns a match
  ----


  ----  FilterComparators.ARRAY_CONTAINS  ----
    It applies on a field where the type is an array of primitives. Value provided in the query filter must be an array.
    If the field value matches all the values provided in the filter. Then it returns a match.
    Example 1:
      Data
        {country: ['France, 'Canada']};
      GaqFilterQuery
        {key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France']}
    This returns a match
    Example 2:
      Data
        {country: ['France, 'Canada']};
      GaqFilterQuery
         {key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France', 'US']}
    This does NOT return a match
  ----

  ----  FilterComparators.ARRAY_ELEMENT_MATCH  ----
    It applies on a field that is an array of nested documents. You need it, if you want to perform a query where at least one document must fulfill multiples conditions
    When using this comparator, we do not provide the `value` property. This is replaced by the property `arrayElementCondition` being GaqRootQueryFilter<object>
    Example 1:
      Data
        {answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};
      GaqFilterQuery
        {
          and: [
                {
                  key: 'answers',
                  comparator: FilterComparators.ARRAY_ELEMENT_MATCH,
                  arrayElementCondition: {
                    and: [
                      {
                        key: 'questionId',
                        comparator: FilterComparators.EQUAL,
                        value: 'xycv'
                      },
                      {
                        key: 'value',
                        comparator: FilterComparators.EQUAL,
                        value: 'Yes'
                      }
                    ]
                  }
                }
              ]
        }
    This returns a match because one document fullfills both the condition
    Example 2:
      Data
      {answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};
      GaqFilterQuery
        {
          and: [
                {
                  key: 'answers',
                  comparator: FilterComparators.ARRAY_ELEMENT_MATCH,
                  arrayElementCondition: {
                    and: [
                      {
                        key: 'questionId',
                        comparator: FilterComparators.EQUAL,
                        value: 'xycv'
                      },
                      {
                        key: 'value',
                        comparator: FilterComparators.EQUAL,
                        value: 'Half'
                      }
                    ]
                  }
                }
              ]
        }

      This does NOT return a match because not document fullfills both conditions

    **** Why not using simply a regular AND condition on nested fields? like below
    Data
      {answers: [{questionId: 'xycv', value: 'Yes'}, {questionId: 'xycv2', value: 'Half'}]};
    GaqFilterQuery
        {
          and: [
                      {
                        key: 'answers.questionId',
                        comparator: FilterComparators.EQUAL,
                        value: 'xycv'
                      },
                      {
                        key: 'answers.value',
                        comparator: FilterComparators.EQUAL,
                        value: 'Half'
                      }
                    ]
        }
  In this use case, we would have a match, because the entity indeed has `answers` with some subdocuments that have `questionId` to `xycv` and some subdocuments that have `value` to `Half`.
  This is different from having one subdocument that matches all conditions at the same time.
  Depending on what you want to query, you need to be abl to provide the nuance in the query: Does one subdocument must match all conditions ? Or do you want that all subdocument in the array to partially meet all conditions?
  ----

    ----  FilterComparators.ARRAY_CONTAINS_ANY  ----
    It applies on a field where the type is an array of primitives. Value provided in the query filter must be an array.
    If the field value matches any of the values provided in the filter. Then it returns a match.
    Example 1:
      Data
        {country: ['France, 'Canada']};
      GaqFilterQuery
        {key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['France', 'US']}
    This returns a match
    Example 2:
      Data
        {country: ['France, 'Canada']};
      GaqFilterQuery
        {key: 'country', comparator: FilterComparators.ARRAY_CONTAINS, value: ['US']}
    This does NOT return a match
  ----
*/

export const AVAILABLE_FILTER_COMPARATORS = Object.values(GaqFilterComparators);

export type GaqFilterQuery<T extends object, K = keyof T & string> = {
  key: K | LooseAutocomplete /* The string is for nested object selection */;
  comparator: Exclude<
    GaqFilterComparators,
    GaqFilterComparators.ARRAY_ELEMENT_MATCH
  >;
  value: T | T[] | (T extends (infer U)[] ? U : any) | any;
};

export type GaqFilterQueryOnArrayElementMatch<
  T extends object,
  K = keyof T & string
> = {
  key: K | LooseAutocomplete /* The string is for nested object selection */;
  comparator: GaqFilterComparators;
  arrayElementCondition: GaqRootQueryFilter<object>;
};

export enum GAQ_ROOT_QUERY_FILTER_CONDITION {
  AND = 'and',
  OR = 'or',
  NOR = 'nor',
}

export type GaqSortingParam = {
  key: string;
  order: 1 | -1;
};

export type GaqAndOrNorFilter<T extends object> = Prettify<{
  [key in GAQ_ROOT_QUERY_FILTER_CONDITION]?: Array<
    | GaqFilterQuery<T>
    | GaqAndOrNorFilter<T>
    | GaqFilterQueryOnArrayElementMatch<T>
  >;
}>;

export type GaqRootQueryFilter<T extends object> = Prettify<
  GaqAndOrNorFilter<T> & {
    limit?: number;
    sort?: GaqSortingParam[];
    offset?: number;
  }
>;

/* Examples for query filters

Example 1:
We want a user by it's email
{
  and: [
    {
      key: 'email',
      comparator: FilterComparators.EQUAL,
      value: 'pierre@gmail.com'
    }
  ]
}

Example 2
We want to find all user that has the skill with name 'Wizard'
{
  and: [
    {
      key: 'skills.skillName',
      comparator: FilterComparators.EQUAL,
      value: 'Wizard'
    }
  ]
}

Example 3
Or / and condition
{
  or: [
    {
      key: 'skills.skillName',
      comparator: FilterComparators.EQUAL,
      value: 'Wizard'
    },
    {
      key: 'skills.skillLevel',
      comparator: FilterComparators.EQUAL,
      value: '5'
    }
  ],
  and: [
    {
      key: 'country',
      comparator: FilterComparators.EQUAL,
      value: 'Narnia'
    },
  ]
}
*/
/*** END OF QUERY FILTERS INTERFACES ************/
