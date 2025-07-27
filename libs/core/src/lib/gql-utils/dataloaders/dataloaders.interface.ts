import {
  GaqFieldResolverDescription,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';

export type FieldResolverInQuery = {
  fieldResolver: GaqFieldResolverDescription;
  parentResolver: GaqResolverDescription;
  selectionFields: string[];
};
export type TypeResolverInQuery = {
  typeResolver: GaqResolverDescription;
  selectionFields: string[];
};
export type FindAllTypesInQueriesResult =
  | FieldResolverInQuery
  | TypeResolverInQuery;
