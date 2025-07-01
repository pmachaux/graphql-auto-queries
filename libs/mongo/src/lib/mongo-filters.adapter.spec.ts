import {
  GaqFilterComparators,
  GaqRootQueryFilter,
} from '@graphql-auto-queries/core';
import { getMongoFilters } from './mongo-filters.adapter';
import { ObjectId } from 'mongodb';

describe('mongo filters adapter', () => {
  describe('getMongoFilters', () => {
    it('should return an empty object if no filter is provided', () => {
      expect(Object.keys(getMongoFilters({})).length).toBe(0);
      expect(Object.keys(getMongoFilters(undefined as any)).length).toBe(0);
    });
    it('should return if all provided operators are an empty array', () => {
      expect(
        Object.keys(getMongoFilters({ and: [], or: [], nor: [] })).length
      ).toBe(0);
      expect(Object.keys(getMongoFilters(undefined as any)).length).toBe(0);
    });
    it('should throw an error when the comparator is not supported', () => {
      try {
        getMongoFilters({
          and: [
            { key: 'name', value: 'meow', comparator: 'fakeComparator' as any },
          ],
        });
        throw new Error(
          'It should have failed because the comparator is not supported'
        );
      } catch (e: any) {
        expect(e.message).toBe('Comparator fakeComparator is not valid');
      }
    });
    it('should return the query for an equal filter', () => {
      const result = getMongoFilters({
        and: [
          {
            key: 'name',
            value: 'meow',
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      });
      expect((result['$and'] as any)[0].name['$eq']).toBe('meow');
    });
    it('should return the query for a not equal filter', () => {
      const result = getMongoFilters({
        and: [
          {
            value: 'meow',
            comparator: GaqFilterComparators.NOT_EQUAL,
            key: 'name',
          },
        ],
      });
      expect((result['$and'] as any)[0].name['$ne']).toBe('meow');
    });
    it('should return the query for an greater filter', () => {
      const result = getMongoFilters({
        and: [
          {
            key: 'moneyOnMyAccount',
            value: 12,
            comparator: GaqFilterComparators.GREATER,
          },
        ],
      });
      expect((result['$and'] as any)[0].moneyOnMyAccount['$gte']).toBe(12);
    });
    it('should return the query for a strictly greater filter', () => {
      const result = getMongoFilters({
        and: [
          {
            key: 'moneyOnMyAccount',
            value: 12,
            comparator: GaqFilterComparators.STRICTLY_GREATER,
          },
        ],
      });
      expect((result['$and'] as any)[0].moneyOnMyAccount['$gt']).toBe(12);
    });
    it('should return the query for an lower filter', () => {
      const result = getMongoFilters({
        and: [
          {
            key: 'moneyOnMyAccount',
            value: 12,
            comparator: GaqFilterComparators.LOWER,
          },
        ],
      });
      expect((result['$and'] as any)[0].moneyOnMyAccount['$lte']).toBe(12);
    });
    it('should return the query for a strictly lower filter', () => {
      const result = getMongoFilters({
        and: [
          {
            key: 'moneyOnMyAccount',
            value: 12,
            comparator: GaqFilterComparators.STRICTLY_LOWER,
          },
        ],
      });
      expect((result['$and'] as any)[0].moneyOnMyAccount['$lt']).toBe(12);
    });
    it('should return the query for a IN filter', () => {
      const value = ['meow', 'ouaf'];
      const result = getMongoFilters({
        and: [{ value, comparator: GaqFilterComparators.IN, key: 'name' }],
      });
      expect((result['$and'] as any)[0].name['$in']).toEqual(value);
    });
    it('should throw an error when the value for the comparator IN is not an array', () => {
      try {
        getMongoFilters({
          and: [
            {
              value: 'something',
              comparator: GaqFilterComparators.IN,
              key: 'name',
            },
          ],
        });
        throw new Error(
          'It should have failed because the comparator IN requires an array'
        );
      } catch (e: any) {
        expect(e.message).toBe(
          'Invalid filters: Comparator IN requires an array of values for field name'
        );
      }
    });
    it('should return the query for a NOT_IN filter', () => {
      const value = ['meow', 'ouaf'];
      const result = getMongoFilters({
        and: [{ value, comparator: GaqFilterComparators.NOT_IN, key: 'name' }],
      });
      expect((result['$and'] as any)[0].name['$nin']).toEqual(value);
    });
    it('should throw an error when the value for the comparator NOT_IN is not an array', () => {
      try {
        getMongoFilters({
          and: [
            {
              value: 'something',
              comparator: GaqFilterComparators.NOT_IN,
              key: 'name',
            },
          ],
        });
        throw new Error(
          'It should have failed because the comparator NOT_IN requires an array'
        );
      } catch (e: any) {
        expect(e.message).toBe(
          'Invalid filters: Comparator NOT_IN requires an array of values for field name'
        );
      }
    });
    it('should return the query for a ARRAY_CONTAINS filter', () => {
      const value = ['meow', 'ouaf'];
      const result = getMongoFilters({
        and: [
          {
            value,
            comparator: GaqFilterComparators.ARRAY_CONTAINS,
            key: 'name',
          },
        ],
      });
      expect((result['$and'] as any)[0].name['$all']).toBe(value);
    });
    it('should throw an error when the value for the comparator ARRAY_CONTAINS is not an array', () => {
      try {
        getMongoFilters({
          and: [
            {
              value: 'something',
              comparator: GaqFilterComparators.ARRAY_CONTAINS,
              key: 'name',
            },
          ],
        });
        throw new Error(
          'It should have failed because the comparator ARRAY_CONTAINS requires an array'
        );
      } catch (e: any) {
        expect(e.message).toBe(
          'Invalid filters: Comparator ARRAY_CONTAINS requires an array of values for field name'
        );
      }
    });
    it('should return the query for a ARRAY_CONTAINS_ANY filter', () => {
      const value = ['meow', 'ouaf'];
      const result = getMongoFilters({
        and: [
          {
            value,
            comparator: GaqFilterComparators.ARRAY_CONTAINS_ANY,
            key: 'name',
          },
        ],
      });
      expect((result['$and'] as any)[0].name['$in']).toEqual(value);
    });
    it('should throw an error when the value for the comparator ARRAY_CONTAINS_ANY is not an array', () => {
      try {
        getMongoFilters({
          and: [
            {
              value: 'something',
              comparator: GaqFilterComparators.ARRAY_CONTAINS_ANY,
              key: 'name',
            },
          ],
        });
        throw new Error(
          'It should have failed because the comparator ARRAY_CONTAINS_ANY requires an array'
        );
      } catch (e: any) {
        expect(e.message).toBe(
          'Invalid filters: Comparator ARRAY_CONTAINS_ANY requires an array of values for field name'
        );
      }
    });
    it('should be able to create filter query for nested objects', () => {
      const queryFilter: GaqRootQueryFilter<{
        plain: string;
        test: {
          ppt1: string;
          ppt2: string;
        };
      }> = {
        and: [
          {
            value: 'meow',
            comparator: GaqFilterComparators.EQUAL,
            key: 'plain',
          },
          {
            value: 'nest1',
            comparator: GaqFilterComparators.EQUAL,
            key: 'test.ppt1',
          },
          {
            value: 'nest2',
            comparator: GaqFilterComparators.NOT_EQUAL,
            key: 'test.ppt2',
          },
        ],
      };

      const result = getMongoFilters(queryFilter);
      expect((result['$and'] as any)[0].plain['$eq']).toBe('meow');
      expect((result['$and'] as any)[1]['test.ppt1']['$eq']).toBe('nest1');
      expect((result['$and'] as any)[2]['test.ppt2']['$ne']).toBe('nest2');
    });
    it('should create a filter query with AND condition for the same field', () => {
      const queryFilter: GaqRootQueryFilter<{
        plain: {
          name: string;
          exist: boolean;
        };
      }> = {
        and: [
          {
            key: 'plain.name',
            value: 'bob',
            comparator: GaqFilterComparators.EQUAL,
          },
          {
            key: 'plain.exist',
            value: true,
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      };

      const result = getMongoFilters(queryFilter);
      expect((result['$and'] as any)[0]['plain.name']['$eq']).toBe('bob');
      expect((result['$and'] as any)[1]['plain.exist']['$eq']).toBe(true);
    });
    it('should create a filter query with OR condition for the same field', () => {
      const queryFilter: GaqRootQueryFilter<{
        plain: {
          name: string;
          exist: boolean;
        };
      }> = {
        or: [
          {
            key: 'plain.name',
            value: 'bob',
            comparator: GaqFilterComparators.EQUAL,
          },
          {
            key: 'plain.exist',
            value: true,
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      };

      const result = getMongoFilters(queryFilter);
      expect((result['$or'] as any)[0]['plain.name']['$eq']).toBe('bob');
      expect((result['$or'] as any)[1]['plain.exist']['$eq']).toBe(true);
    });
    it('should transform the comparator ARRAY_ELEMENT_MATCH into an $elemMatch', () => {
      const queryFilter: GaqRootQueryFilter<{
        plain: {
          name: string;
          exist: boolean;
        };
      }> = {
        and: [
          {
            key: 'answers',
            comparator: GaqFilterComparators.ARRAY_ELEMENT_MATCH,
            arrayElementCondition: {
              and: [
                {
                  key: 'questionId',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'xcv',
                },
                {
                  key: 'value',
                  comparator: GaqFilterComparators.EQUAL,
                  value: 'Yes',
                },
              ],
            },
          },
        ],
      };

      const result = getMongoFilters(queryFilter) as any;
      expect(result['$and'][0].answers.$elemMatch.$and[0].questionId.$eq).toBe(
        'xcv'
      );
      expect(result['$and'][0].answers.$elemMatch.$and[1].value.$eq).toBe(
        'Yes'
      );
    });
    it('should create a filter query with NOR condition for the same field', () => {
      const queryFilter: GaqRootQueryFilter<{
        plain: {
          name: string;
          exist: boolean;
        };
      }> = {
        nor: [
          {
            key: 'plain.name',
            value: 'bob',
            comparator: GaqFilterComparators.EQUAL,
          },
          {
            key: 'plain.exist',
            value: true,
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      };

      const result = getMongoFilters(queryFilter);
      expect((result['$nor'] as any)[0]['plain.name']['$eq']).toBe('bob');
      expect((result['$nor'] as any)[1]['plain.exist']['$eq']).toBe(true);
    });
    it('should handle nested AND conditions into a root OR conditions', () => {
      const queryFilter: GaqRootQueryFilter<{
        answers: {
          questionId: string;
          value: boolean;
        }[];
      }> = {
        or: [
          {
            and: [
              {
                key: 'answers.questionId',
                value: '3a0f22d2-d360-4e05-a93f-f0253fe8768c',
                comparator: GaqFilterComparators.EQUAL,
              },
              {
                key: 'answers.value',
                value: 'N_A',
                comparator: GaqFilterComparators.EQUAL,
              },
            ],
          },
          {
            and: [
              {
                key: 'answers.questionId',
                value: '74e013f6-8053-4fe7-9d66-991a12f8440a',
                comparator: GaqFilterComparators.EQUAL,
              },
              {
                key: 'answers.value',
                value: 'Yes',
                comparator: GaqFilterComparators.EQUAL,
              },
            ],
          },
        ],
      };
      /* Here for readability
      const expectedResult = {
        $or: [
          {
            $and: [
              { 'answers.questionId': { $eq: '3a0f22d2-d360-4e05-a93f-f0253fe8768c' } },
              { 'answers.value': { $eq: 'N_A' } },
            ],
          },
          {
            $and: [
              { 'answers.questionId': { $eq: '74e013f6-8053-4fe7-9d66-991a12f8440a' } },
              { 'answers.value': { $eq: 'Yes' } },
            ],
          },
        ],
      };
      */

      const result = getMongoFilters(queryFilter) as any;

      expect(result['$or']).toBeDefined();
      expect(result['$or']?.length).toBe(2);

      expect(
        result['$or']?.[0]?.['$and']?.[0]?.['answers.questionId']?.['$eq']
      ).toBe('3a0f22d2-d360-4e05-a93f-f0253fe8768c');
      expect(
        result['$or']?.[0]?.['$and']?.[1]?.['answers.value']?.['$eq']
      ).toBe('N_A');

      expect(
        result['$or']?.[1]?.['$and']?.[0]?.['answers.questionId']?.['$eq']
      ).toBe('74e013f6-8053-4fe7-9d66-991a12f8440a');
      expect(
        result['$or']?.[1]?.['$and']?.[1]?.['answers.value']?.['$eq']
      ).toBe('Yes');
    });
    it('should handle nested OR conditions into a root AND conditions', () => {
      const queryFilter: GaqRootQueryFilter<{
        answers: {
          questionId: string;
          value: boolean;
        }[];
      }> = {
        and: [
          {
            or: [
              {
                key: 'answers.questionId',
                value: '3a0f22d2-d360-4e05-a93f-f0253fe8768c',
                comparator: GaqFilterComparators.EQUAL,
              },
              {
                key: 'answers.value',
                value: 'N_A',
                comparator: GaqFilterComparators.EQUAL,
              },
            ],
          },
          {
            or: [
              {
                key: 'answers.questionId',
                value: '74e013f6-8053-4fe7-9d66-991a12f8440a',
                comparator: GaqFilterComparators.EQUAL,
              },
              {
                key: 'answers.value',
                value: 'Yes',
                comparator: GaqFilterComparators.EQUAL,
              },
            ],
          },
        ],
      };
      /* Here for readability
      const expectedResult = {
        $and: [
          {
            $or: [
              { 'answers.questionId': { $eq: '3a0f22d2-d360-4e05-a93f-f0253fe8768c' } },
              { 'answers.value': { $eq: 'N_A' } },
            ],
          },
          {
            $or: [
              { 'answers.questionId': { $eq: '74e013f6-8053-4fe7-9d66-991a12f8440a' } },
              { 'answers.value': { $eq: 'Yes' } },
            ],
          },
        ],
      };
      */

      const result = getMongoFilters(queryFilter) as any;

      expect(result['$and']).toBeDefined();
      expect(result['$and']?.length).toBe(2);

      expect(
        result['$and']?.[0]?.['$or']?.[0]?.['answers.questionId']?.['$eq']
      ).toBe('3a0f22d2-d360-4e05-a93f-f0253fe8768c');
      expect(
        result['$and']?.[0]?.['$or']?.[1]?.['answers.value']?.['$eq']
      ).toBe('N_A');

      expect(
        result['$and']?.[1]?.['$or']?.[0]?.['answers.questionId']?.['$eq']
      ).toBe('74e013f6-8053-4fe7-9d66-991a12f8440a');
      expect(
        result['$and']?.[1]?.['$or']?.[1]?.['answers.value']?.['$eq']
      ).toBe('Yes');
    });
    it('should handle _id filter with equal comparator', () => {
      const queryFilterSimpleString: GaqRootQueryFilter<{
        _id: string;
      }> = {
        and: [
          {
            key: '_id',
            value: '123',
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      };
      const resultSimpleString = getMongoFilters(queryFilterSimpleString);

      expect(resultSimpleString['$and'][0]['_id']).toEqual({ $eq: '123' });

      const queryFilterObjectId: GaqRootQueryFilter<{
        _id: string;
      }> = {
        and: [
          {
            key: '_id',
            value: '5a9427648b0beebeb6957ac8',
            comparator: GaqFilterComparators.EQUAL,
          },
        ],
      };
      const resultObjectId = getMongoFilters(queryFilterObjectId);
      expect(resultObjectId['$and'][0]['$or'][0]['_id']).toBe(
        '5a9427648b0beebeb6957ac8'
      );
      expect(
        resultObjectId['$and'][0]['$or'][1]['_id'] instanceof ObjectId
      ).toBe(true);
      expect(resultObjectId['$and'][0]['$or'].length).toBe(2);
    });
  });
  it('should handle _id filter with NOT_EQUAL comparator', () => {
    const queryFilterSimpleString: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '123',
          comparator: GaqFilterComparators.NOT_EQUAL,
        },
      ],
    };
    const resultSimpleString = getMongoFilters(queryFilterSimpleString);
    expect(resultSimpleString['$and'][0]['_id']['$ne']).toBe('123');

    const queryFilterObjectId: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.NOT_EQUAL,
        },
      ],
    };
    const resultObjectId = getMongoFilters(queryFilterObjectId);
    expect(resultObjectId['$and'][0]['$and'][0]['_id']['$ne']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(
      resultObjectId['$and'][0]['$and'][1]['_id']['$ne'] instanceof ObjectId
    ).toBe(true);
    expect(resultObjectId['$and'][0]['$and'].length).toBe(2);
  });
  it('should handle _id filter with GREATER comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.GREATER,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['$or'][0]['_id']['$gte']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['$or'][1]['_id']['$gte'] instanceof ObjectId).toBe(
      true
    );
    expect(result['$and'][0]['$or'].length).toBe(2);
  });
  it('should handle _id filter with STRICTLY_GREATER comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.STRICTLY_GREATER,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['$or'][0]['_id']['$gt']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['$or'][1]['_id']['$gt'] instanceof ObjectId).toBe(
      true
    );
    expect(result['$and'][0]['$or'].length).toBe(2);
  });
  it('should handle _id filter with LOWER comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.LOWER,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['$or'][0]['_id']['$lte']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['$or'][1]['_id']['$lte'] instanceof ObjectId).toBe(
      true
    );
    expect(result['$and'][0]['$or'].length).toBe(2);
  });
  it('should handle _id filter with STRICTLY_LOWER comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.STRICTLY_LOWER,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['$or'][0]['_id']['$lt']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['$or'][1]['_id']['$lt'] instanceof ObjectId).toBe(
      true
    );
    expect(result['$and'][0]['$or'].length).toBe(2);
  });
  it('should handle _id filter with IN comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: ['123', '5a9427648b0beebeb6957ac8'],
          comparator: GaqFilterComparators.IN,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['_id']['$in'][0]).toBe('123');
    expect(result['$and'][0]['_id']['$in'][1]).toBe('5a9427648b0beebeb6957ac8');
    expect(result['$and'][0]['_id']['$in'][2] instanceof ObjectId).toBe(true);
  });
  it('should handle _id filter with NOT_IN comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: ['123', '5a9427648b0beebeb6957ac8'],
          comparator: GaqFilterComparators.NOT_IN,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['_id']['$nin'][0]).toBe('123');
    expect(result['$and'][0]['_id']['$nin'][1]).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['_id']['$nin'][2] instanceof ObjectId).toBe(true);
  });
  it('should handle _id filter with ARRAY_CONTAINS comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: ['5a9427648b0beebeb6957ac8'],
          comparator: GaqFilterComparators.ARRAY_CONTAINS,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['_id']['$all'][0].toString()).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['_id']['$all'][0] instanceof ObjectId).toBe(true);
  });
  it('should not transform the value for ARRAY_CONTAINS if it is not an array of ObjectId', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: ['5a9427648b0beebeb6957ac8', '123'],
          comparator: GaqFilterComparators.ARRAY_CONTAINS,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['_id']['$all'][0]).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['_id']['$all'][1] instanceof ObjectId).toBe(false);
    expect(result['$and'][0]['_id']['$all'][1]).toBe('123');
  });
  it('should handle _id filter with ARRAY_CONTAINS_ANY comparator', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: '_id',
          value: ['5a9427648b0beebeb6957ac8', '123'],
          comparator: GaqFilterComparators.ARRAY_CONTAINS_ANY,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['_id']['$in'][0]).toBe('5a9427648b0beebeb6957ac8');
    expect(result['$and'][0]['_id']['$in'][1].toString()).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['_id']['$in'][1] instanceof ObjectId).toBe(true);
    expect(result['$and'][0]['_id']['$in'][2]).toBe('123');
    expect(result['$and'][0]['_id']['$in'][3] instanceof ObjectId).toBe(false);
  });
  it('should handle every value that can be an ObjectId even on non _id fields', () => {
    const queryFilter: GaqRootQueryFilter<{
      _id: string;
    }> = {
      and: [
        {
          key: 'movie_id',
          value: '5a9427648b0beebeb6957ac8',
          comparator: GaqFilterComparators.EQUAL,
        },
      ],
    };
    const result = getMongoFilters(queryFilter);
    expect(result['$and'][0]['$or'][0]['movie_id']).toBe(
      '5a9427648b0beebeb6957ac8'
    );
    expect(result['$and'][0]['$or'][1]['movie_id'] instanceof ObjectId).toBe(
      true
    );
    expect(result['$and'][0]['$or'].length).toBe(2);
  });
});
