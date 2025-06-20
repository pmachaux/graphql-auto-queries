import { Client } from 'pg';
import {
  GaqDbAdapter,
  GaqCollectionClient,
  GaqRootQueryFilter,
  GaqDbQueryOptions,
  GaqLogger,
} from '@gaq';
import { PostgresGaqDbConnectorConfig } from './interface';
import { SqlConverter } from '@gaq/sql-converter';
import { PostgresSqlConverter } from './postgres.sql-converter';

const getCollectionAdapter = <T extends object>({
  client,
  table,
  sqlConverter,
}: {
  client: Client;
  table: string;
  sqlConverter: SqlConverter;
}): GaqCollectionClient<T> => {
  return {
    count: (() => {}) as any,
    getFromGaqFilters: async (
      filters: GaqRootQueryFilter<T>,
      selectedFields: string[],
      opts: GaqDbQueryOptions
    ) => {
      const [sql, params] = sqlConverter.convertToQuery({
        filters,
        table,
        selectedFields,
        opts,
      });
      const result = await client.query(sql, params);
      return result.rows as T[];
    },
    getValuesInField: (() => {}) as any,
  };
};

const getDbAdapter = (client: Client) => {
  const sqlConverter = new PostgresSqlConverter();
  return {
    getCollectionAdapter: <T extends object>(table: string) =>
      getCollectionAdapter<T>({ client, table, sqlConverter }),
  };
};

export async function getPostgresGaqDbConnector({
  config,
  logger,
}: {
  config: PostgresGaqDbConnectorConfig;
  logger: GaqLogger;
}): Promise<{
  dbAdapter: GaqDbAdapter;
  client: Client;
}> {
  const client = new Client(config);
  try {
    await client.connect();
    logger.info(`Connected to Postgres database ${config.database}`);
    return {
      dbAdapter: getDbAdapter(client),
      client,
    };
  } catch (error) {
    logger.error(`Error connecting to Postgres database ${config.database}`);
    logger.error(error);
    throw error;
  }
}
