import { parse } from 'graphql';
import { findAllTypesInQueries } from './dataloaders.utils';
import {
  GaqFieldResolverDescription,
  GaqResolverDescription,
} from '../../interfaces/common.interfaces';

describe('dataloaders utils', () => {
  describe('findAllTypesInQueries', () => {
    it('should find all top-level and nested GaqFieldResolverDescriptions up to depth 3, and collect correct selection fields', () => {
      // Example schemaIndex and gaqResolverDescriptions
      const schemaIndex = {
        User: {
          id: { type: 'ID', isNonNull: true, isList: false },
          name: { type: 'String', isNonNull: false, isList: false },
          posts: { type: 'Post', isNonNull: false, isList: true },
          profile: { type: 'Profile', isNonNull: false, isList: false },
        },
        Post: {
          id: { type: 'ID', isNonNull: true, isList: false },
          title: { type: 'String', isNonNull: false, isList: false },
          content: { type: 'String', isNonNull: false, isList: false },
          author: { type: 'User', isNonNull: false, isList: false },
        },
        Profile: {
          id: { type: 'ID', isNonNull: true, isList: false },
          bio: { type: 'String', isNonNull: false, isList: false },
          avatar: { type: 'String', isNonNull: false, isList: false },
        },
      };

      // Create GaqFieldResolverDescriptions for User, Post, and Profile
      const userFieldResolver: GaqFieldResolverDescription = {
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

      const postFieldResolver: GaqFieldResolverDescription = {
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

      const profileFieldResolver: GaqFieldResolverDescription = {
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

      // GaqResolverDescription for User
      const gaqResolverDescriptions: GaqResolverDescription[] = [
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

      const results = findAllTypesInQueries(
        ast,
        schemaIndex,
        gaqResolverDescriptions
      );

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

    // it('should handle repeated use of the same GaqFieldResolverDescription and merge requested fields', () => {

    // });

    // it('should not include fields in selectionFields that are themselves resolved by another GaqFieldResolverDescription', () => {

    // });
  });
});
