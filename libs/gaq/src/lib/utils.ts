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

export const isNullOrUndefinedOrEmptyObject = (
  obj: object | null | undefined
): boolean => {
  return obj === null || obj === undefined || Object.keys(obj).length === 0;
};
