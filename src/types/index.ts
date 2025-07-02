/**
 * Options for reading schema data from a file or Directus server
 */
export type SchemaReadOptions = {
  readonly snapshotFile?: string;  // Path to schema snapshot file
  readonly fieldsFile?: string;    // Path to fields data file (from /fields endpoint)
  readonly host?: string;          // Directus host URL
  readonly email?: string;         // Email for authentication
  readonly password?: string;      // Password for authentication
  readonly token?: string;         // Admin bearer token for authentication
};

/**
 * Options for generating TypeScript types
 */
export type GenerateTypeScriptOptions = {
  readonly typeName: string;       // Root interface name (e.g. ApiCollections)
  useTypeReferences?: boolean;     // Use type references for relations
  useTypes?: boolean;              // Use 'type' instead of 'interface'
  makeRequired?: boolean;          // Make all fields required (no optional '?' syntax)
  includeSystemFields?: boolean;   // Include all system fields in system collections
  addTypedocNotes?: boolean;       // Add JSDoc comments from field notes
};

/**
 * Definition of a TypeScript type/interface that will be generated
 */
export type TypeDefinition = {
  content: string;       // The TypeScript code for this type
  properties: string[];  // List of property names in this type
};

/**
 * Schema snapshot as returned by the /schema/snapshot endpoint
 * or from the CLI command: npx directus schema snapshot
 * 
 * The API endpoint returns the snapshot wrapped in a 'data' field,
 * while the CLI generates it without the wrapper.
 */
export type DirectusSchemaSnapshot = {
  data: {
    version: number;
    directus: string;
    vendor: string;
    collections: DirectusCollection[];
    fields: DirectusField[];
    relations: DirectusRelation[];
  };
};

/**
 * A collection definition in the schema snapshot
 */
export type DirectusCollection = {
  collection: string;  // Collection name
  meta: null | {
    accountability: string;
    collection: string;
    singleton: boolean;  // Whether this collection is a singleton
    note?: string;       // Collection description
    _type_name?: string; // For caching type name during processing
    [key: string]: unknown;  // Other metadata
  };
  schema: {
    name: string;      // DB table name
    [key: string]: unknown;  // Other schema properties
  };
};

/**
 * A field definition in the schema snapshot
 */
export type DirectusField = {
  collection: string;  // Collection this field belongs to
  field: string;       // Field name
  type: string;        // Field type
  meta: null | {
    collection: string;
    field: string;
    special?: string[];  // Special handling flags
    interface?: string;  // Interface used in the admin app
    readonly?: boolean;  // Whether field is read-only
    hidden?: boolean;    // Whether field is hidden
    note?: string;       // Field description for JSDoc
    width?: string;      // Display width in admin app
    system?: boolean;    // Whether field is a system field
    junction_collection?: string;  // For M2M relations, the junction collection
    junction_field?: string | null;  // For M2M relations, the junction field
    [key: string]: unknown;  // Other metadata
  };
  schema: {
    name: string;               // DB column name
    table: string;              // DB table name
    data_type: string;          // DB data type
    default_value: unknown;     // Default value
    max_length: number | null;  // Max length for strings
    is_nullable: boolean;       // Whether field can be null
    is_primary_key: boolean;    // Whether field is primary key
    foreign_key_table: string | null;  // Related table for foreign keys
    foreign_key_column: string | null; // Related column for foreign keys
    [key: string]: unknown;     // Other schema properties
  };
};

/**
 * A relation definition in the schema snapshot
 */
export type DirectusRelation = {
  collection: string;              // Collection this relation belongs to
  field: string;                   // Field that holds the relation
  related_collection: string | null;  // Related collection
  meta: {
    junction_field: string | null;   // For M2M, the field in the junction table
    many_collection: string;         // Collection on the "many" side
    many_field: string;              // Field on the "many" side
    one_collection: string | null;   // Collection on the "one" side
    one_field: string | null;        // Field on the "one" side
    one_collection_field?: string;   // For M2A, the field storing the collection name
    one_allowed_collections?: string[]; // For M2A, the allowed collections
    [key: string]: unknown;          // Other metadata
  };
  schema?: {
    table: string;                // DB table name
    column: string;               // DB column name
    foreign_key_table: string;    // Related table
    foreign_key_column: string;   // Related column
    [key: string]: unknown;       // Other schema properties
  };
};

/**
 * Type of relationship between collections
 */
export enum RelationshipType {
  OneToOne = "o2o",
  OneToMany = "o2m",
  ManyToOne = "m2o",
  ManyToMany = "m2m",
  ManyToAny = "m2a"
}

/**
 * Relationship information structure
 */
export interface RelationshipInfo {
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  relationshipType: RelationshipType;
  junctionCollection?: string;
  junctionField?: string;
}

/**
 * Field metadata from the Directus /fields endpoint
 */
export interface DirectusFieldMetadata {
  collection: string;
  field: string;
  type: string;
  schema: {
    name: string;
    table: string;
    data_type: string;
    default_value: unknown;
    max_length: number | null;
    numeric_precision: number | null;
    numeric_scale: number | null;
    is_generated: boolean;
    generation_expression: string | null;
    is_nullable: boolean;
    is_unique: boolean;
    is_indexed: boolean;
    is_primary_key: boolean;
    has_auto_increment: boolean;
    foreign_key_column: string | null;
    foreign_key_table: string | null;
  };
  meta: {
    system: boolean;
    collection: string;
    field: string;
    special?: string[];
    interface?: string;
    options?: unknown;
    display?: string | null;
    display_options?: unknown;
    readonly: boolean;
    hidden: boolean;
    sort: number;
    width: string;
    group: string | null;
    translations: unknown | null;
    note: string | null;
    conditions: unknown | null;
    required: boolean;
  };
}

/**
 * Response from the Directus /fields endpoint
 */
export interface DirectusFieldsResponse {
  data: DirectusFieldMetadata[];
}
