import {
  GAQ_ROOT_QUERY_FILTER_CONDITION,
  GaqFilterComparators,
  GaqFilterQuery,
  GaqFilterQueryOnArrayElementMatch,
  GaqRootQueryFilter,
} from '@gaq';
import { Condition, ObjectId } from 'mongodb';

type MongoFilterQuery<T extends object> = {
  [key in keyof T | (string & {})]?: Condition<T>;
};

type ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
) => Condition<T>;
type ArrayElementMatchConditionAdapterFn = <T extends object>(
  filter: GaqFilterQueryOnArrayElementMatch<T>
) => Condition<T>;

const pickNonNullable = <T extends object, K extends keyof T>(
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

const omit = <T extends object, K extends keyof T>(
  source: T,
  ...keys: K[]
): Omit<T, K> => {
  const obj = { ...source };
  keys.forEach((k) => {
    delete obj[k];
  });
  return obj;
};

const handleIdFilter = <T extends object>(
  filter: GaqFilterQuery<T>
): MongoFilterQuery<T> => {
  if (filter.comparator === GaqFilterComparators.EQUAL) {
    const orConditions: Condition<T>[] = [{ _id: filter.value }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      orConditions.push({ _id: new ObjectId(filter.value) } as Condition<T>);
    }
    return { $or: orConditions };
  }
  if (filter.comparator === GaqFilterComparators.NOT_EQUAL) {
    const andConditions: Condition<T>[] = [{ _id: { $ne: filter.value } }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      andConditions.push({
        _id: { $ne: new ObjectId(filter.value) },
      } as Condition<T>);
    }
    return { $and: andConditions };
  }
  if (filter.comparator === GaqFilterComparators.GREATER) {
    const orConditions: Condition<T>[] = [{ _id: { $gte: filter.value } }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      orConditions.push({
        _id: { $gte: new ObjectId(filter.value) },
      } as Condition<T>);
    }
    return { $or: orConditions };
  }
  if (filter.comparator === GaqFilterComparators.STRICTLY_GREATER) {
    const orConditions: Condition<T>[] = [{ _id: { $gt: filter.value } }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      orConditions.push({
        _id: { $gt: new ObjectId(filter.value) },
      } as Condition<T>);
    }
    return { $or: orConditions };
  }
  if (filter.comparator === GaqFilterComparators.LOWER) {
    const orConditions: Condition<T>[] = [{ _id: { $lte: filter.value } }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      orConditions.push({
        _id: { $lte: new ObjectId(filter.value) },
      } as Condition<T>);
    }
    return { $or: orConditions };
  }
  if (filter.comparator === GaqFilterComparators.STRICTLY_LOWER) {
    const orConditions: Condition<T>[] = [{ _id: { $lt: filter.value } }];
    // Check if value is a valid ObjectId string
    if (ObjectId.isValid(filter.value)) {
      orConditions.push({
        _id: { $lt: new ObjectId(filter.value) },
      } as Condition<T>);
    }
    return { $or: orConditions };
  }
  if (
    filter.comparator === GaqFilterComparators.IN ||
    filter.comparator === GaqFilterComparators.ARRAY_CONTAINS_ANY
  ) {
    const valuesIn = filter.value.flatMap((value) => {
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        return [value, new ObjectId(value)];
      }
      return value;
    });
    return { _id: { $in: valuesIn } };
  }
  if (filter.comparator === GaqFilterComparators.NOT_IN) {
    const valuesNin = filter.value.flatMap((value) => {
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        return [value, new ObjectId(value)];
      }
      return value;
    });
    return { _id: { $nin: valuesNin } };
  }
  throw new Error(
    `Invalid filters: Comparator ${filter.comparator} is not applicable to field _id`
  );
};

const equalQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $eq: filter.value };
};
const notEqualQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $ne: filter.value };
};
const greaterQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $gte: filter.value };
};
const strictyGreaterQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $gt: filter.value };
};
const lowerQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $lte: filter.value };
};
const strictlyLowerQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  return { $lt: filter.value } as Condition<T>;
};
const inQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  if (!Array.isArray(filter.value)) {
    throw new Error(
      `Invalid filters: Comparator IN requires an array of values for field ${filter.key}`
    );
  }
  return { $in: filter.value };
};
const ninQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  if (!Array.isArray(filter.value)) {
    throw new Error(
      `Invalid filters: Comparator NOT_IN requires an array of values for field ${filter.key}`
    );
  }
  return { $nin: filter.value };
};
const arrayContainsQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  if (!Array.isArray(filter.value)) {
    throw new Error(
      `Invalid filters: Comparator ARRAY_CONTAINS requires an array of values for field ${filter.key}`
    );
  }
  return { $all: filter.value };
};
const arrayContainsAnyQueryFn: ConditionAdapterFn = <T extends object>(
  filter: GaqFilterQuery<T>
): Condition<T> => {
  if (!Array.isArray(filter.value)) {
    throw new Error(
      `Invalid filters: Comparator ARRAY_CONTAINS_ANY requires an array of values for field ${filter.key}`
    );
  }
  if (filter.key === '_id') {
    const valuesIn = filter.value.flatMap((value) => {
      if (typeof value === 'string' && ObjectId.isValid(value)) {
        return [value, new ObjectId(value)];
      }
      return value;
    });
    return { $in: valuesIn };
  }
  return { $in: filter.value };
};
const arrayElementMatchQueryFn: ArrayElementMatchConditionAdapterFn = <
  T extends object
>(
  filter: GaqFilterQueryOnArrayElementMatch<T>
): Condition<T> => {
  if (!filter.arrayElementCondition) {
    throw new Error(
      `Array element match must have an arrayElementCondition provided`
    );
  }
  return {
    $elemMatch: transformGaqRootQueryFilters(filter.arrayElementCondition),
  };
};

const queryFnMap: {
  [key: string]: ConditionAdapterFn | ArrayElementMatchConditionAdapterFn;
} = {
  [GaqFilterComparators.EQUAL]: equalQueryFn,
  [GaqFilterComparators.NOT_EQUAL]: notEqualQueryFn,
  [GaqFilterComparators.GREATER]: greaterQueryFn,
  [GaqFilterComparators.STRICTLY_GREATER]: strictyGreaterQueryFn,
  [GaqFilterComparators.LOWER]: lowerQueryFn,
  [GaqFilterComparators.STRICTLY_LOWER]: strictlyLowerQueryFn,
  [GaqFilterComparators.IN]: inQueryFn,
  [GaqFilterComparators.NOT_IN]: ninQueryFn,
  [GaqFilterComparators.ARRAY_CONTAINS]: arrayContainsQueryFn,
  [GaqFilterComparators.ARRAY_CONTAINS_ANY]: arrayContainsAnyQueryFn,
  [GaqFilterComparators.ARRAY_ELEMENT_MATCH]: arrayElementMatchQueryFn,
};

const getComparatorAdapterFn = <R extends GaqFilterComparators>(
  comparator: R
): R extends GaqFilterComparators.ARRAY_ELEMENT_MATCH
  ? ArrayElementMatchConditionAdapterFn
  : ConditionAdapterFn => {
  return queryFnMap[comparator] as any;
};

const transformFilterQuery = <T extends object>(
  filter: GaqFilterQuery<T>
): MongoFilterQuery<T> => {
  const adapterFn = getComparatorAdapterFn(filter.comparator);
  if (!adapterFn) {
    throw new Error(`Comparator ${filter.comparator} is not valid`);
  }

  if (filter.key === '_id') {
    return handleIdFilter(filter);
  }
  const mongoQuery = adapterFn(filter);

  return {
    [filter.key]: mongoQuery,
  } as MongoFilterQuery<T>;
};

const transformGaqRootQueryFilters = <T extends object>(
  filters: GaqRootQueryFilter<T>
) => {
  const conditionOperatorKeys = Object.keys(
    pickNonNullable(
      filters,
      GAQ_ROOT_QUERY_FILTER_CONDITION.OR,
      GAQ_ROOT_QUERY_FILTER_CONDITION.AND,
      GAQ_ROOT_QUERY_FILTER_CONDITION.NOR
    )
  ) as Array<GAQ_ROOT_QUERY_FILTER_CONDITION>;
  return conditionOperatorKeys.reduce((acc, conditionOperator) => {
    return {
      ...acc,
      [`$${conditionOperator}`]: filters[conditionOperator]?.map((filter) => {
        if ((filter as GaqFilterQuery<object>).key) {
          return transformFilterQuery(filter as GaqFilterQuery<object>);
        }
        return transformGaqRootQueryFilters(
          filter as GaqRootQueryFilter<object>
        );
      }),
    };
  }, {} as GaqFilterQuery<T>);
};

const trimBaseEmptyBaseOperator = <T extends object>(
  key: keyof GaqRootQueryFilter<T>,
  filters: GaqRootQueryFilter<T>
) => {
  if (
    !filters[key] ||
    (Array.isArray(filters[key]) && filters[key]?.length === 0)
  ) {
    return omit(filters, key);
  }
  return filters;
};

const trimAllEmtyBaseOperators = <T extends object>(
  filters: GaqRootQueryFilter<T>
): GaqRootQueryFilter<T> => {
  return Object.values(GAQ_ROOT_QUERY_FILTER_CONDITION).reduce((acc, key) => {
    return trimBaseEmptyBaseOperator(key, acc);
  }, filters);
};

export const getMongoFilters = <T extends object>(
  filters: GaqRootQueryFilter<T>
): MongoFilterQuery<T> => {
  if (!filters || Object.keys(filters).length === 0) {
    return {};
  }

  const trimmedFilter = trimAllEmtyBaseOperators(filters);

  if (Object.keys(trimmedFilter).length === 0) {
    return {};
  }

  return transformGaqRootQueryFilters(trimmedFilter);
};
