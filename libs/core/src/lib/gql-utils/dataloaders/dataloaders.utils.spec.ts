import { parse } from 'graphql';
import { findAllTypesInQueries } from './dataloaders.utils';
import {
  GaqFieldResolverDescription,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';

describe('dataloaders utils', () => {
  let userFieldResolver: GaqFieldResolverDescription;
  let postFieldResolver: GaqFieldResolverDescription;
  let profileFieldResolver: GaqFieldResolverDescription;
  let gaqResolverDescriptions: GaqResolverDescription[];

  beforeEach(() => {
    userFieldResolver = {
      parentKey: 'id',
      fieldKey: 'id',
      isArray: false,
      fieldType: 'User',
      fieldName: 'author',
      dataloaderName: 'User_user_dataloader',
      limit: null,
      mtmCollectionName: null,
      mtmFieldKeyAlias: null,
      mtmParentKeyAlias: null,
      mtmDataloaderName: null,
    };

    postFieldResolver = {
      parentKey: 'id',
      fieldKey: 'posts',
      isArray: true,
      fieldType: 'Post',
      fieldName: 'posts',
      dataloaderName: 'User_posts_dataloader',
      limit: null,
      mtmCollectionName: null,
      mtmFieldKeyAlias: null,
      mtmParentKeyAlias: null,
      mtmDataloaderName: null,
    };
    profileFieldResolver = {
      parentKey: 'id',
      fieldKey: 'profile',
      isArray: false,
      fieldType: 'Profile',
      fieldName: 'profile',
      dataloaderName: 'User_profile_dataloader',
      limit: null,
      mtmCollectionName: null,
      mtmFieldKeyAlias: null,
      mtmParentKeyAlias: null,
      mtmDataloaderName: null,
    };
    gaqResolverDescriptions = [
      {
        queryName: 'userGaqQueryResult',
        resultType: 'UserGaqResult',
        linkedType: 'User',
        fieldResolvers: [postFieldResolver, profileFieldResolver],
        dbCollectionName: 'User',
        defaultLimit: null,
        maxLimit: null,
        federationReferenceResolver: null,
      },
      {
        queryName: 'postGaqQueryResult',
        resultType: 'Post',
        linkedType: 'Post',
        fieldResolvers: [userFieldResolver],
        dbCollectionName: 'Post',
        defaultLimit: null,
        maxLimit: null,
        federationReferenceResolver: null,
      },
      {
        queryName: 'profileGaqQueryResult',
        resultType: 'Profile',
        linkedType: 'Profile',
        fieldResolvers: [],
        dbCollectionName: 'Profile',
        defaultLimit: null,
        maxLimit: null,
        federationReferenceResolver: null,
      },
    ];
  });

  describe('findAllTypesInQueries', () => {
    it('should find all top-level and nested GaqFieldResolverDescriptions up to depth 3, and collect correct selection fields', () => {
      const query = `
        query GaqUserQuery($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
          userGaqQueryResult(filters: $filters, options: $options) {
            result {
              id
               posts {
                id
                title
                author {
                  id
                  name
                  profile {
                    id
                    bio
                  }
                }
              }
              name
            }
          }
        }
      `;
      const ast = parse(query);
      const results = findAllTypesInQueries(ast, gaqResolverDescriptions);
      expect(results).toEqual([
        {
          fieldResolver: postFieldResolver,
          selectionFields: ['id', 'title'],
        },
        {
          fieldResolver: userFieldResolver,
          selectionFields: ['id', 'name'],
        },
        {
          fieldResolver: profileFieldResolver,
          selectionFields: ['id', 'bio'],
        },
      ]);
    });

    it('should handle repeated use of the same GaqFieldResolverDescription and merge requested fields', () => {
      const query = `
      query GaqUserQuery($filters: GaqRootFiltersInput!, $options: GaqQueryOptions) {
        userGaqQueryResult(filters: $filters, options: $options) {
          result {
            id
             posts {
              id
              title
              author {
                name
                profile {
                  bio
                }
              }
            }
            name
          }
        }
        userGaqQueryResult(filters: $filters2) {
          result {
            id
             posts {
              id
              title
              author {
                id
              }
            }
            name
          }
        }
      }
    `;
      const ast = parse(query);
      const results = findAllTypesInQueries(ast, gaqResolverDescriptions);
      expect(results).toEqual([
        {
          fieldResolver: postFieldResolver,
          selectionFields: ['id', 'title'],
        },
        {
          fieldResolver: userFieldResolver,
          selectionFields: ['name', 'id'],
        },
        {
          fieldResolver: profileFieldResolver,
          selectionFields: ['bio'],
        },
      ]);
    });

    it('should support inline fragments in the query', () => {
      const query = `
        query {
          userGaqQueryResult(filters: $filters) {
            result {
              id
              name
              ... on User {
                posts {
                  id
                  title
                  author {
                    ... on Author {
                      name
                      profile {
                        ... on Profile {
                          id
                          bio
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;
      const ast = parse(query);
      const results = findAllTypesInQueries(ast, gaqResolverDescriptions);
      expect(results).toEqual([
        {
          fieldResolver: postFieldResolver,
          selectionFields: ['id', 'title'],
        },
        {
          fieldResolver: userFieldResolver,
          selectionFields: ['name'],
        },
        {
          fieldResolver: profileFieldResolver,
          selectionFields: ['id', 'bio'],
        },
      ]);
    });
    it('should support spread fragments in the query', () => {
      const query = `
      query UserQuery($filters: UserFilters) {
        userGaqQueryResult(filters: $filters) {
          result {
            id
            name
            ...UserFields
          }
        }
      }

      fragment UserFields on User {
        posts {
          id
          title
          author {
            ...AuthorFields
          }
        }
      }

      fragment AuthorFields on Author {
        name
        profile {
          ...ProfileFields
        }
      }

      fragment ProfileFields on Profile {
        id
        bio
      }
    `;
      const ast = parse(query);
      const results = findAllTypesInQueries(ast, gaqResolverDescriptions);
      expect(results).toEqual([
        {
          fieldResolver: postFieldResolver,
          selectionFields: ['id', 'title'],
        },
        {
          fieldResolver: userFieldResolver,
          selectionFields: ['name'],
        },
        {
          fieldResolver: profileFieldResolver,
          selectionFields: ['id', 'bio'],
        },
      ]);
    });
    it('should handle reference resolvers in the query', () => {
      const query = `
      query GetUserByReference {
        _entities(representations: [{ __typename: "User", id: "123" }]) {
          ... on User {
            id
            name
            posts {
              id
              title
            }
          }
        }
      }
    `;
      const ast = parse(query);
      const results = findAllTypesInQueries(ast, gaqResolverDescriptions);

      expect(results).toEqual([
        {
          selectionFields: ['id', 'name'],
          typeResolver: gaqResolverDescriptions[0],
        },
        {
          fieldResolver: postFieldResolver,
          selectionFields: ['id', 'title'],
        },
      ]);
    });
  });
});
