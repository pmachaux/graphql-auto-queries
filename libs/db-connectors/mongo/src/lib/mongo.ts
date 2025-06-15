import { Db, MongoClient, ObjectId, WithId, Document } from 'mongodb';
import {
  GaqDbAdapter,
  GaqCollectionClient,
  GaqRootQueryFilter,
  GaqDbQueryOptions,
} from '@gaq';
import { getMongoFilters } from './mongo-filters.adapter';

const standardizeMongoResult = <T extends object>(
  result: WithId<Document>[]
): T[] => {
  return result.map((item) => {
    const standardizedItem = Object.entries(item).reduce(
      (acc, [key, value]) => {
        acc[key] = value instanceof ObjectId ? value.toString() : value;
        return acc;
      },
      {} as Record<string, any>
    );
    return standardizedItem as T;
  });
};

const getCollectionAdapter = <T extends object>(
  db: Db,
  collectionName: string
): GaqCollectionClient<T> => {
  const collection = db.collection(collectionName);
  return {
    count: async (filters: GaqRootQueryFilter<T>) => {
      const mongoFilters = getMongoFilters(filters);
      return collection.countDocuments(mongoFilters);
    },
    getFromGaqFilters: async (
      filters: GaqRootQueryFilter<T>,
      selectedFields: string[],
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
      if (selectedFields.length > 0) {
        collectionQuery.project(
          Object.fromEntries(selectedFields.map((field) => [field, 1]))
        );
      }

      opts.logger.debug(
        `[${opts.traceId}] Querying mongo collection ${collectionName}`
      );
      const result = await collectionQuery.toArray();
      opts.logger.debug(
        `[${opts.traceId}] Mongo query succedeed ${result.length} items`
      );
      return standardizeMongoResult<T>(result);
    },
    getValuesInField: async (
      payload,
      selectedFields: string[],
      opts: GaqDbQueryOptions
    ) => {
      const mongoQuery = {
        [payload.field]: {
          $in: payload.values.flatMap((v) => {
            if (ObjectId.isValid(v) && typeof v === 'string') {
              return [v, new ObjectId(v)];
            }
            return v;
          }),
        },
      };
      opts.logger.debug(
        `[${opts.traceId}] Querying mongo collection ${collectionName}`
      );
      const fingQuery = collection.find(mongoQuery);
      if (selectedFields.length > 0) {
        fingQuery.project(
          Object.fromEntries(selectedFields.map((field) => [field, 1]))
        );
      }
      const result = await fingQuery.toArray();
      return standardizeMongoResult(result);
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
