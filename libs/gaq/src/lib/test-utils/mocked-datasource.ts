import {
  GaqDbConnector,
  GaqFilterQuery,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';

const books = [
  { title: 'The Great Gatsby', authorId: '1' },
  { title: 'To Kill a Mockingbird', authorId: '2' },
  { title: '1984', authorId: '3' },
];

const authors = [
  { id: '1', name: 'F. Scott Fitzgerald' },
  { id: '2', name: 'Harper Lee' },
  { id: '3', name: 'George Orwell' },
];

export const getMockedDatasource = (): GaqDbConnector => {
  return {
    connect: async () => {
      return {
        collection: (collectionName: string) => {
          if (collectionName === 'Book') {
            return {
              getFromGaqFilters: async (
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
          }
          if (collectionName === 'Author') {
            return {
              getFromGaqFilters: async (
                filters: GaqRootQueryFilter<{ id: string; name: string }>
              ) => {
                return authors.filter(
                  (a) =>
                    a.id ===
                    (
                      filters.and[0] as GaqFilterQuery<
                        { id: string; name: string },
                        'id'
                      >
                    ).value
                );
              },
            };
          }
        },
      };
    },
  };
};
