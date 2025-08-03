import {
  FindAllTypesInQueriesResult,
  TypeResolverInQuery,
  FieldResolverInQuery,
} from './gql-utils/dataloaders/dataloaders.interface';
import {
  GaqDataLoaderFederationSuffix,
  GaqFieldResolverDescription,
  GaqResolverDescription,
} from './interfaces/common.interfaces';

export const omit = <T extends object, K extends keyof T>(
  source: T,
  ...keys: K[]
): Omit<T, K> => {
  const obj = { ...source };
  keys.forEach((k) => {
    delete obj[k];
  });
  return obj;
};

export const pick = <T extends object, K extends keyof T>(
  source: T,
  ...keys: K[]
): Pick<T, K> => {
  return keys.reduce((acc, key) => {
    return { ...acc, [key]: source[key] };
  }, {} as Pick<T, K>);
};

export const pickNonNullable = <T extends object, K extends keyof T>(
  source: T,
  ...keys: K[]
): Pick<T, K> => {
  return keys.reduce((acc, key) => {
    if (source[key] !== null && source[key] !== undefined) {
      return { ...acc, [key]: source[key] };
    }
    return acc;
  }, {} as Pick<T, K>);
};

export const isNullOrUndefinedOrEmptyObject = (
  obj: object | null | undefined
): boolean => {
  return obj === null || obj === undefined || Object.keys(obj).length === 0;
};

export const getFieldDataloaderName = ({
  typeName,
  fieldName,
}: {
  typeName: string;
  fieldName: string;
}): string => {
  return `${typeName}${fieldName}Dataloader`;
};

export const getManyToManyFieldDataloaderName = ({
  typeName,
  fieldName,
}: {
  typeName: string;
  fieldName: string;
}): string => {
  return `${typeName}${fieldName}ManyToManyDataloader`;
};

export const getTypeDataLoaderName = (
  gaqResolverDescription: GaqResolverDescription
) => {
  return `${gaqResolverDescription.linkedType}${GaqDataLoaderFederationSuffix}`;
};

/*
 * Type guard to check if a FindAllTypesInQueriesResult is a TypeResolverInQuery
 */
export function isTypeResolverInQuery(
  result: FindAllTypesInQueriesResult
): result is TypeResolverInQuery {
  return (result as TypeResolverInQuery).typeResolver !== undefined;
}

/**
 * Type guard to check if a FindAllTypesInQueriesResult is a FieldResolverInQuery
 */
export function isFieldResolverInQuery(
  result: FindAllTypesInQueriesResult
): result is FieldResolverInQuery {
  return (result as FieldResolverInQuery).fieldResolver !== undefined;
}
