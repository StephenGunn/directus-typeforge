/**
 * Relationship pattern configuration for Directus TypeForge
 * 
 * This file defines patterns used to detect and process relationships
 * between collections based on naming conventions.
 */

// Patterns for identifying junction tables
export const JUNCTION_TABLE_PATTERNS = {
  // Common junction table indicators in collection names
  NAME_INDICATORS: [
    '_pivot_',
    '_junction_',
    '_join_',
    '_relations',
    '_links',
    '_connections',
  ],
  
  // Regex pattern for detecting common junction table naming formats
  REGEX_PATTERN: /(.*?)_(to|x|and|2)_(.*)/i,
};

// Patterns for identifying M2A relationships
export const M2A_RELATIONSHIP_PATTERNS = {
  // Collection name indicators for M2A relationships
  COLLECTION_INDICATORS: [
    '_related_',
  ],
  
  // Field names typically used in M2A relationships 
  FIELD_NAMES: {
    COLLECTION_FIELD: 'collection',
    ITEM_FIELD: 'item',
  },
};

// Patterns for identifying parent/child relationships
export const PARENT_CHILD_PATTERNS = {
  // Field names suggesting parent relationship
  PARENT_FIELD_NAMES: [
    'parent',
    'parent_id',
    'parent_item',
    'parent_record',
  ],
  
  // Field names suggesting child relationship
  CHILD_FIELD_NAMES: [
    'children',
    'child',
    'replies',
    'responses',
    'subitems',
    'descendants',
  ],
};

// Prefixes and suffixes to clean up when normalizing field names
export const NAME_NORMALIZATION = {
  // Prefixes to remove
  PREFIXES_TO_REMOVE: [
    'directus_',
    'event_',
    'events_',
  ],
  
  // Suffixes to remove
  SUFFIXES_TO_REMOVE: [
    '_item',
    '_items',
    '_id',
  ],
};

export const relationshipPatterns = {
  JUNCTION_TABLE_PATTERNS,
  M2A_RELATIONSHIP_PATTERNS,
  PARENT_CHILD_PATTERNS,
  NAME_NORMALIZATION,
};