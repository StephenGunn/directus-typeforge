/**
 * Field type mapping configuration for Directus TypeForge
 * 
 * This file defines how Directus field types map to TypeScript types.
 */

// Map from Directus field types to TypeScript types
export const TYPE_MAPPING = {
  // String types
  string: 'string',
  text: 'string',
  hash: 'string',
  uuid: 'string',
  char: 'string',
  varchar: 'string',
  character: 'string',
  geometry: 'string',
  'geometry.Point': 'string',

  // Number types
  integer: 'number',
  bigInteger: 'number',
  int: 'number',
  bigint: 'number',
  smallint: 'number',
  tinyint: 'number',
  float: 'number',
  decimal: 'number',
  double: 'number',
  real: 'number',

  // Boolean type
  boolean: 'boolean',
  
  // Special literal types (these will be transformed in output)
  json: '\'json\'',
  csv: '\'csv\'',
  datetime: '\'datetime\'',
  date: '\'datetime\'',
  time: '\'datetime\'',
  timestamp: '\'datetime\'',
  dateTime: '\'datetime\'',
  timestamptz: '\'datetime\'',
};

// Pattern matchers for detecting time-related fields by name
export const DATETIME_FIELD_PATTERNS = [
  /^date_/i,
  /^datetime_/i,
  /^time_/i,
  /^timestamp_/i,
  /_date$/i,
  /_datetime$/i,
  /_time$/i,
  /_at$/i,
  /_timestamp$/i,
];

// Specific field names that should always be treated as datetime
export const DATETIME_FIELD_NAMES = [
  'created_at',
  'updated_at',
  'date_created',
  'date_updated',
  'published_at',
  'modified_at',
  'last_access',
  'last_modified',
  'timestamp',
];

export const fieldTypeMapping = {
  TYPE_MAPPING,
  DATETIME_FIELD_PATTERNS,
  DATETIME_FIELD_NAMES,
};