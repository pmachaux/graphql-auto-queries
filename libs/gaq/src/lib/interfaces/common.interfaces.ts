export interface GaqResolverDescription {
  queryName: string;
  linkedType: string;
}

export interface DetailedGaqFieldDefinition {
  isReference: boolean;
  isArray: boolean;
  type: string;
}

export interface DetailedGaqTypeDefinition {
  name: string;
  properties: Record<string, DetailedGaqFieldDefinition>;
}

export interface GaqResult<T extends object> {
  data?: T[] | null;
  count?: number;
}

export interface GaqDatasourceResolverFn<T extends object> {
  (parent: any, args: any, contextValue: any, info: any): Promise<
    GaqResult<T[]>
  >;
}

export type GaqDatasourceResolverMap = Record<
  string,
  {
    resolver: GaqDatasourceResolverFn<any>;
  }
>;
