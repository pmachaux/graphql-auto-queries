/**
 * Makes all properties of a type more readable in IDE tooltips by removing intersections
 * @typeParam T - The type to prettify
 * @example
 * type Example = { a: string } & { b: number };
 * type Prettified = Prettify<Example>; // Shows as { a: string; b: number } in IDE
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Creates a type that allows both strict string literals and arbitrary strings while maintaining autocompletion
 * Useful for properties that need to accept both predefined values and custom strings
 * @example
 * type Status = LooseAutocomplete & ('active' | 'inactive');
 * const status: Status = 'active'; // OK
 * const customStatus: Status = 'custom-status'; // Also OK
 */
export type LooseAutocomplete = string & {};

/**
 * Creates a type where some properties from T are required while others remain optional
 * @typeParam T - The base type
 * @typeParam K - Union of keys from T that should be required
 * @example
 * type User = { name?: string; age?: number; email?: string };
 * type UserWithRequiredName = WithRequired<User, 'name'>; // name is required, age and email remain optional
 */
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Creates a type where all properties from T can be null
 * @typeParam T - The base type
 * @example
 * type User = { name: string; age: number; email: string };
 * type NullableUser = Nullable<User>; // name, age and email can be null
 */
export type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};
