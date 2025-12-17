/**
 * System collection relationship mappings
 * 
 * Directus doesn't include relations for internal system collection fields in the schema snapshot.
 * This configuration defines the standard relationships within Directus system collections.
 */

export type SystemRelation = {
  collection: string;
  field: string;
  relatedCollection: string;
  type: 'm2o'; // Only many-to-one for system fields
};

export const systemRelations: SystemRelation[] = [
  // directus_files
  { collection: 'directus_files', field: 'folder', relatedCollection: 'directus_folders', type: 'm2o' },
  { collection: 'directus_files', field: 'uploaded_by', relatedCollection: 'directus_users', type: 'm2o' },
  { collection: 'directus_files', field: 'modified_by', relatedCollection: 'directus_users', type: 'm2o' },
  
  // directus_folders
  { collection: 'directus_folders', field: 'parent', relatedCollection: 'directus_folders', type: 'm2o' },
  
  // directus_roles
  { collection: 'directus_roles', field: 'parent', relatedCollection: 'directus_roles', type: 'm2o' },
  
  // directus_activity
  { collection: 'directus_activity', field: 'user', relatedCollection: 'directus_users', type: 'm2o' },
  
  // directus_revisions
  { collection: 'directus_revisions', field: 'activity', relatedCollection: 'directus_activity', type: 'm2o' },
  { collection: 'directus_revisions', field: 'parent', relatedCollection: 'directus_revisions', type: 'm2o' },
  { collection: 'directus_revisions', field: 'version', relatedCollection: 'directus_versions', type: 'm2o' },
  
  // directus_versions
  { collection: 'directus_versions', field: 'user_created', relatedCollection: 'directus_users', type: 'm2o' },
  { collection: 'directus_versions', field: 'user_updated', relatedCollection: 'directus_users', type: 'm2o' },
  
  // directus_permissions
  { collection: 'directus_permissions', field: 'role', relatedCollection: 'directus_roles', type: 'm2o' },
  { collection: 'directus_permissions', field: 'policy', relatedCollection: 'directus_policies', type: 'm2o' },
  
  // directus_presets
  { collection: 'directus_presets', field: 'user', relatedCollection: 'directus_users', type: 'm2o' },
  { collection: 'directus_presets', field: 'role', relatedCollection: 'directus_roles', type: 'm2o' },
  
  // directus_webhooks
  { collection: 'directus_webhooks', field: 'migrated_flow', relatedCollection: 'directus_flows', type: 'm2o' },
  
  // directus_flows
  { collection: 'directus_flows', field: 'user_created', relatedCollection: 'directus_users', type: 'm2o' },
  
  // directus_operations
  { collection: 'directus_operations', field: 'flow', relatedCollection: 'directus_flows', type: 'm2o' },
  { collection: 'directus_operations', field: 'resolve', relatedCollection: 'directus_operations', type: 'm2o' },
  { collection: 'directus_operations', field: 'reject', relatedCollection: 'directus_operations', type: 'm2o' },
  { collection: 'directus_operations', field: 'user_created', relatedCollection: 'directus_users', type: 'm2o' },
];
