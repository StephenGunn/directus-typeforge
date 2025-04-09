/**
 * System collections configuration for Directus TypeForge
 * 
 * This configuration defines characteristics of Directus system collections
 * including their type names, primary key types, and other metadata.
 */

// List of all standard Directus system collections
export const SYSTEM_COLLECTION_NAMES = [
  'directus_users',
  'directus_files',
  'directus_folders',
  'directus_roles',
  'directus_activity',
  'directus_permissions',
  'directus_fields',
  'directus_collections',
  'directus_presets',
  'directus_relations',
  'directus_revisions',
  'directus_webhooks',
  'directus_flows',
  'directus_operations',
  'directus_versions',
  'directus_extensions',
  'directus_comments',
  'directus_settings',
];

// System collections that use string IDs instead of number IDs
export const STRING_ID_COLLECTIONS = [
  'directus_fields',
  'directus_collections',
  'directus_relations',
];

// System collections that use number IDs
export const NUMBER_ID_COLLECTIONS = [
  'directus_users',
  'directus_files',
  'directus_folders',
  'directus_roles',
  'directus_activity',
  'directus_permissions',
  'directus_presets',
  'directus_revisions',
  'directus_webhooks',
  'directus_flows',
  'directus_operations',
  'directus_versions',
  'directus_extensions',
  'directus_comments',
  'directus_settings',
];

// Map of system collection names to their type names (PascalCase)
export const SYSTEM_COLLECTION_TYPE_NAMES = {
  'directus_users': 'DirectusUser',
  'directus_files': 'DirectusFile',
  'directus_folders': 'DirectusFolder',
  'directus_roles': 'DirectusRole',
  'directus_activity': 'DirectusActivity',
  'directus_permissions': 'DirectusPermission',
  'directus_fields': 'DirectusField',
  'directus_collections': 'DirectusCollection',
  'directus_presets': 'DirectusPreset',
  'directus_relations': 'DirectusRelation',
  'directus_revisions': 'DirectusRevision',
  'directus_webhooks': 'DirectusWebhook',
  'directus_flows': 'DirectusFlow',
  'directus_operations': 'DirectusOperation',
  'directus_versions': 'DirectusVersion',
  'directus_extensions': 'DirectusExtension',
  'directus_comments': 'DirectusComment',
  'directus_settings': 'DirectusSetting',
};

export const systemCollections = {
  SYSTEM_COLLECTION_NAMES,
  STRING_ID_COLLECTIONS,
  NUMBER_ID_COLLECTIONS,
  SYSTEM_COLLECTION_TYPE_NAMES,
};