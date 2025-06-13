import { Db, MongoClient } from 'mongodb';
import {
  GaqDbAdapter,
  GaqCollectionClient,
  GaqRootQueryFilter,
  GaqDbQueryOptions,
} from '@gaq';
import { getMongoFilters } from './mongo-filters.adapter';

const getCollectionAdapter = <T extends object>(
  db: Db,
  collectionName: string
): GaqCollectionClient<T> => {
  const collection = db.collection(collectionName);
  return {
    getFromGaqFilters: async (
      filters: GaqRootQueryFilter<T>,
      opts: GaqDbQueryOptions
    ) => {
      const mongoFilters = getMongoFilters(filters);
      const collectionQuery = collection.find(mongoFilters);
      if (opts.limit) {
        collectionQuery.limit(opts.limit);
      }
      if (opts.offset) {
        collectionQuery.skip(opts.offset);
      }
      if (opts.sort) {
        const sortObj = Object.fromEntries(
          opts.sort.map((sort) => [sort.key, sort.order])
        );
        collectionQuery.sort(sortObj);
      }
      opts.logger.debug(
        `[${opts.traceId}] Querying mongo collection ${collectionName}`
      );
      const result = await collectionQuery.toArray();
      opts.logger.debug(
        `[${opts.traceId}] Mongo query succedeed ${result.length} items`
      );
      return result.map((item) => {
        const { _id, ...rest } = item;
        return { _id: _id.toString(), ...rest } as T;
      });
    },
    getValuesInField: async (payload, opts: GaqDbQueryOptions) => {
      const mongoQuery = { [payload.field]: { $in: payload.values } };
      opts.logger.debug(
        `[${opts.traceId}] Querying mongo collection ${collectionName}`
      );
      opts.logger.debug(
        `[${opts.traceId}] Mongo query: ${JSON.stringify(mongoQuery)}`
      );
      const result = await collection.find(mongoQuery).toArray();
      opts.logger.debug(
        `[${opts.traceId}] Mongo query succedeed ${result.length} items`
      );
      return result.map((item) => {
        const { _id, ...rest } = item;
        return { _id: _id.toString(), ...rest } as T;
      });
    },
  };
};

const getDbAdapter = (db: Db) => {
  return {
    getCollectionAdapter: <T extends object>(collectionName: string) =>
      getCollectionAdapter<T>(db, collectionName),
  };
};

export async function getMongoGaqDbConnector({
  uri,
  dbName,
}: {
  uri: string;
  dbName: string;
}): Promise<{
  dbAdapter: GaqDbAdapter;
  client: MongoClient;
}> {
  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);
  return {
    dbAdapter: getDbAdapter(db),
    client,
  };
}
