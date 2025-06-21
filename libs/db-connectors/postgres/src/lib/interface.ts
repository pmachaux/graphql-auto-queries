export interface PostgresGaqDbConnectorConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: {
    rejectUnauthorized?: boolean;
    ca?: string;
  };
}
