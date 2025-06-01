export interface GaqFilters {
  queryName: string;
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
