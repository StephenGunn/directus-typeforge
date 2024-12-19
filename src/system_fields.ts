export const SYSTEM_FIELDS = {
  directus_users: [
    "id",
    "first_name",
    "last_name",
    "email",
    "password",
    "location",
    "title",
    "description",
    "tags",
    "avatar",
    "language",
    "tfa_secret",
    "status",
    "role",
    "token",
    "last_access",
    "last_page",
    "provider",
    "external_identifier",
    "auth_data",
    "email_notifications",
    "appearance",
    "theme_dark",
    "theme_light",
    "theme_light_overrides",
    "theme_dark_overrides",
  ],
  directus_files: [
    "id",
    "storage",
    "filename_disk",
    "filename_download",
    "title",
    "type",
    "folder",
    "uploaded_by",
    "uploaded_on",
    "modified_by",
    "modified_on",
    "charset",
    "filesize",
    "width",
    "height",
    "duration",
    "embed",
    "description",
    "location",
    "tags",
    "metadata",
    "created_on",
    "focal_point_x",
    "focal_point_y",
    "tus_id",
  ],
  directus_folders: ["id", "name", "parent"],
  directus_roles: [
    "id",
    "name",
    "icon",
    "description",
    "admin_access",
    "app_access",
    "children",
    "users",
  ],
  directus_activity: [
    "id",
    "action",
    "user",
    "timestamp",
    "ip",
    "user_agent",
    "collection",
    "item",
    "comment",
    "origin",
    "revisions",
  ],
  directus_permissions: [
    "id",
    "role",
    "collection",
    "action",
    "permissions",
    "validation",
    "presets",
    "fields",
    "limit",
  ],
  directus_fields: [
    "id",
    "collection",
    "field",
    "special",
    "interface",
    "display",
    "readonly",
    "hidden",
    "sort",
    "width",
    "note",
    "required",
    "validation_message",
  ],
  directus_collections: [
    "collection",
    "icon",
    "note",
    "display_template",
    "hidden",
    "singleton",
    "archive_field",
    "archive_app_filter",
    "archive_value",
    "unarchive_value",
    "sort_field",
    "accountability",
    "color",
    "sort",
    "collapse",
    "preview_url",
    "versioning",
  ],
  directus_presets: [
    "id",
    "bookmark",
    "user",
    "role",
    "collection",
    "search",
    "layout",
    "layout_query",
    "layout_options",
    "refresh_interval",
    "icon",
    "color",
  ],
  directus_relations: [
    "id",
    "many_collection",
    "many_field",
    "one_collection",
    "one_field",
    "junction_field",
    "one_collection_field",
    "one_allowed_collections",
    "sort_field",
    "one_deselect_action",
  ],
  directus_revisions: [
    "id",
    "activity",
    "collection",
    "item",
    "data",
    "delta",
    "parent",
  ],
  directus_webhooks: [
    "id",
    "name",
    "method",
    "url",
    "status",
    "data",
    "actions",
    "collections",
    "was_active_before_deprecation",
  ],
  directus_flows: [
    "id",
    "name",
    "icon",
    "color",
    "description",
    "status",
    "trigger",
    "accountability",
    "options",
    "date_created",
    "operations",
  ],
  directus_operations: [
    "id",
    "name",
    "key",
    "type",
    "position_x",
    "position_y",
    "options",
    "resolve",
    "reject",
    "flow",
    "date_created",
  ],
  directus_versions: [
    "id",
    "key",
    "name",
    "item",
    "hash",
    "date_created",
    "date_updated",
    "delta",
  ],
  directus_extensions: ["id", "enabled", "folder", "source", "bundle"],
  directus_comments: ["id", "item", "comment", "date_created", "date_updated"],
  directus_settings: [
    "id",
    "project_name",
    "project_url",
    "project_color",
    "project_logo",
    "public_foreground",
    "public_background",
    "public_note",
    "auth_login_attempts",
    "auth_password_policy",
    "storage_asset_transform",
    "storage_asset_presets",
    "custom_css",
    "storage_default_folder",
    "mapbox_key",
    "project_descriptor",
    "default_language",
    "default_appearance",
    "default_theme_light",
    "default_theme_dark",
    "report_error_url",
    "report_bug_url",
    "report_feature_url",
    "public_registration",
    "public_registration_verify_email",
  ],
} as const;
