import {
  GaqDbClient,
  GaqDbConnector,
  GaqFilterQuery,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';

const books = [
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee' },
  { title: '1984', author: 'George Orwell' },
];

export const getMockedDatasource = (): GaqDbConnector => {
  return {
    connect: async () => {
      return {
        collection: (collectionName: string) => {
          return {
            get: async (
              filters: GaqRootQueryFilter<{ title: string; author: string }>
            ) => {
              return books.filter((book) => {
                return (
                  book.title ===
                  (
                    filters.and[0] as GaqFilterQuery<
                      { title: string; author: string },
                      'title'
                    >
                  ).value
                );
              });
            },
          };
        },
      };
    },
  };
};
