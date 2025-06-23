import { Client } from 'pg';
import {
  GaqDbAdapter,
  GaqCollectionClient,
  GaqRootQueryFilter,
  GaqDbQueryOptions,
  GaqLogger,
  GaqManyToManyCollectionConfig,
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
    count: (async (
      filters: GaqRootQueryFilter<T>,
      opts: Pick<GaqDbQueryOptions, 'traceId' | 'logger'>
    ) => {
      try {
        opts.logger.debug(
          `[${opts.traceId}] Executing count query on ${table}`
        );
        const [sql, params] = sqlConverter.getCountQuery({
          filters,
          table,
        });

        const result = await client.query(sql, params);
        return parseInt(result.rows[0].count, 10);
      } catch (error) {
        opts.logger.error(
          `[${opts.traceId}] Error executing count query on ${table}`
        );
        opts.logger.error(error);
        throw error;
      }
    }) as any,
    getFromGaqFilters: async (
      filters: GaqRootQueryFilter<T>,
      selectedFields: string[],
      opts: GaqDbQueryOptions
    ) => {
      try {
        opts.logger.debug(
          `[${opts.traceId}] Executing getFromGaqFilters query on ${table}`
        );
        const [sql, params] = sqlConverter.convertToQuery({
          filters,
          table,
          selectedFields,
          opts,
        });
        const result = await client.query(sql, params);
        return result.rows as T[];
      } catch (error) {
        opts.logger.error(
          `[${opts.traceId}] Error executing getFromGaqFilters query on ${table}`
        );
        opts.logger.error(error);
        throw error;
      }
    },
    getValuesInField: async (
      payload: { field: string; values: any[] },
      selectedFields: string[],
      opts: GaqDbQueryOptions
    ): Promise<T[]> => {
      try {
        opts.logger.debug(
          `[${opts.traceId}] Executing getValuesInField query on ${table}`
        );
        const [sql, params] = sqlConverter.getValuesInFieldQuery({
          table,
          payload,
          selectedFields,
          opts,
        });
        const result = await client.query(sql, params);
        return result.rows as T[];
      } catch (error) {
        opts.logger.error(
          `[${opts.traceId}] Error executing getValuesInField query on ${table}`
        );
        opts.logger.error(error);
        throw error;
      }
    },
    resolveManyToMany: async (
      parentIds: (string | number)[],
      config: GaqManyToManyCollectionConfig,
      opts: Pick<GaqDbQueryOptions, 'traceId' | 'logger'>
    ) => {
      return [];
    },
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
