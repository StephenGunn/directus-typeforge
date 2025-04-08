import type { DirectusCollection, DirectusField, DirectusRelation } from "../types";

/**
 * Finds all system collections in the schema
 */
export const findSystemCollections = (collections: DirectusCollection[]): string[] => {
  return collections
    .filter(collection => collection.collection.startsWith('directus_'))
    .map(collection => collection.collection);
};

/**
 * Determines if a collection is a singleton
 */
export const isSingleton = (collection: DirectusCollection): boolean => {
  return collection.meta.singleton === true;
};

/**
 * Finds all fields for a collection
 */
export const getFieldsForCollection = (
  fields: DirectusField[],
  collectionName: string
): DirectusField[] => {
  return fields.filter(field => field.collection === collectionName);
};

/**
 * Finds all relations for a collection
 */
export const getRelationsForCollection = (
  relations: DirectusRelation[],
  collectionName: string
): DirectusRelation[] => {
  return relations.filter(relation => relation.collection === collectionName);
};

/**
 * Checks if a field is a relationship field
 */
export const isRelationshipField = (
  field: DirectusField,
  relations: DirectusRelation[]
): boolean => {
  // Check if there's a relation with this field
  return relations.some(
    relation => relation.collection === field.collection && relation.field === field.field
  );
};

/**
 * Gets the primary key field for a collection (usually "id")
 */
export const getPrimaryKeyField = (
  fields: DirectusField[],
  collectionName: string
): DirectusField | undefined => {
  return fields.find(
    field => field.collection === collectionName && field.schema.is_primary_key
  );
};
