/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import {
  GaqDbAdapter,
  GaqFilterQuery,
  GaqRootQueryFilter,
} from '../interfaces/common.interfaces';

const books = [
  { id: '1', title: 'The Great Gatsby', authorId: '1' },
  { id: '2', title: 'To Kill a Mockingbird', authorId: '2' },
  { id: '3', title: '1984', authorId: '3' },
];

const authors = [
  { id: '1', name: 'F. Scott Fitzgerald' },
  { id: '2', name: 'Harper Lee' },
  { id: '3', name: 'George Orwell' },
];

const reviews = [
  { id: '1', bookId: '1', content: 'Great book' },
  { id: '2', bookId: '1', content: 'I loved it' },
  { id: '3', bookId: '2', content: 'Not my cup of tea' },
];

export const getMockedDatasource = (spies?: {
  bookSpy?: Function;
  authorSpy?: Function;
  reviewSpy?: Function;
}): GaqDbAdapter => {
  return {
    getCollectionAdapter: (collectionName: string) => {
      if (collectionName === 'books') {
        return {
          getValuesInField: async () => [],
          getFromGaqFilters: async (
            filters: GaqRootQueryFilter<{ title: string; authorId: string }>
          ) => {
            spies?.bookSpy?.(filters);
            if (filters.and.length === 0) {
              return books;
            }
            return books.filter((book) => {
              return (
                book.title ===
                (
                  filters.and[0] as GaqFilterQuery<
                    { title: string; authorId: string },
                    'title'
                  >
                ).value
              );
            });
          },
        };
      }
      if (collectionName === 'authors') {
        return {
          getValuesInField: async ({
            field,
            values,
          }: {
            field: string;
            values: string[];
          }) => {
            spies?.authorSpy?.({ field, values });
            return authors.filter((a) => values.includes(a[field]));
          },
        };
      }
      if (collectionName === 'reviews') {
        return {
          getValuesInField: async ({
            field,
            values,
          }: {
            field: string;
            values: string[];
          }) => {
            spies?.reviewSpy?.({ field, values });
            return reviews.filter((a) => values.includes(a[field]));
          },
        };
      }
    },
  } as GaqDbAdapter;
};
