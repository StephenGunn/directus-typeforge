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

export const fieldTypeMapping = {
  TYPE_MAPPING,
};