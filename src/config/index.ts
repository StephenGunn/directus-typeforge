/**
 * Configuration System for Directus TypeForge
 * 
 * This module centralizes all configurable aspects of the application.
 */

import { systemFields } from './system-fields';
import { systemCollections } from './system-collections';
import { relationshipPatterns } from './relationship-patterns';
import { fieldTypeMapping } from './field-types';
import { systemRelations } from './system-relations';

// Default values for CLI options
export const DEFAULT_OPTIONS = {
  TYPENAME: 'ApiCollections',
  USE_TYPE_REFERENCES: false,
  USE_TYPES: false,
  MAKE_REQUIRED: false,
  INCLUDE_SYSTEM_FIELDS: true,
  EXPORT_SYSTEM_COLLECTIONS: true,
  RESOLVE_SYSTEM_RELATIONS: true,
  ADD_TYPEDOC_NOTES: false,
};

// Output configuration
export const OUTPUT_CONFIG = {
  ENCODING: 'utf8',
  INCLUDE_TIMESTAMP: true,
  HEADER_TEMPLATE: '/**\n * Generated TypeScript types for Directus\n * Generated at: {timestamp}\n */\n\n',
};

// Schema Processing Configuration
export const SCHEMA_CONFIG = {
  // Special field types that need custom handling
  DATETIME_FIELD_LITERAL: 'datetime',
  JSON_FIELD_LITERAL: 'json',
  CSV_FIELD_LITERAL: 'csv',
  
  // Common prefix/suffix patterns
  DIRECTUS_PREFIX: 'directus_',
  
  // Standard metadata fields
  METADATA_FIELDS: [
    'date_created',
    'date_updated',
    'user_created',
    'user_updated',
  ]
};

// Logging Configuration
export const LOGGING_CONFIG = {
  // Set to true to enable debug logging
  DEBUG_ENABLED: false,
  
  // Log level thresholds
  LOG_LEVELS: {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
  },
  
  // Current log level - controls which messages are shown
  CURRENT_LOG_LEVEL: 2, // INFO by default
  
  // Log to file options
  LOG_TO_FILE: false,
  LOG_FILE_PATH: './debug.log',
};

export {
  systemFields,
  systemCollections,
  relationshipPatterns,
  fieldTypeMapping,
  systemRelations,
};