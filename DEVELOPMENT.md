# Directus TypeForge Development Guide

A TypeScript type definition generator for Directus schemas. This tool processes
Directus schema snapshots and generates corresponding TypeScript type definitions
optimized for use with the Directus SDK.

## How It Works

TypeForge analyzes your Directus schema through the schema snapshot, extracting
collection information, field definitions, and relationship mappings:

1. **Schema Reading:** Fetches the schema from a file or live Directus instance
   using `/schema/snapshot` endpoint
2. **Collection Registration:** Identifies collections and determines their ID
   types
3. **Relationship Analysis:** Detects relationships between collections (M2O,
   O2M, M2M, M2A)
4. **Type Generation:** Creates TypeScript interfaces for each collection
5. **Field Type Mapping:** Maps Directus field types to appropriate TypeScript
   types
6. **System Collection Handling:** Properly processes Directus system
   collections
7. **Root Type Creation:** Generates a root interface that includes all
   collections with appropriate types

## Implementation Notes

Directus TypeForge works directly with Directus schema snapshots instead of
relying on OpenAPI. This approach:

- Works with any Directus instance
- Provides accurate type information through direct schema access
- Simplifies relationship detection
- Removes unnecessary dependencies
- Sets defaults optimized for the Directus SDK

The tool processes the schema snapshot to extract collections, fields, and
relationships, then generates TypeScript interfaces that reflect your Directus
data model.

## Project Structure

```
src/
├── config/
│   ├── index.ts                    # Main configuration entry point
│   ├── field-types.ts              # Field type mapping configuration
│   ├── relationship-patterns.ts    # Pattern matching for relationships
│   ├── system-collections.ts       # System collection definitions
│   └── system-fields.ts            # Directus system field definitions
├── generators/
│   └── typescript.ts               # TypeScript code generation helpers
├── services/
│   ├── CoreSchemaProcessor.ts      # Core schema processing implementation
│   ├── InterfaceGenerator.ts       # Generates interfaces for collections
│   ├── PropertyGenerator.ts        # Generates property types for fields 
│   ├── RelationshipProcessor.ts    # Identifies and processes relationships
│   ├── RelationshipResolver.ts     # Resolves relationship connections
│   ├── RelationshipTracker.ts      # Tracks relationships between collections
│   ├── SchemaProcessor.ts          # Processes schema data into TypeScript types
│   ├── SchemaReader.ts             # Handles reading schema snapshots
│   ├── SchemaSnapshotProcessor.ts  # Processes Directus schema snapshots
│   ├── SystemCollectionManager.ts  # Manages system collection types
│   ├── SystemFieldDetector.ts      # Detects custom fields in system collections
│   ├── SystemFieldManager.ts       # Manages system field operations
│   ├── TypeDefinitionGenerator.ts  # Generates final TypeScript output
│   ├── TypeNameManager.ts          # Manages type naming and conversions
│   └── TypeTracker.ts              # Tracks type definitions during generation
├── types/
│   └── index.ts                    # Central type definitions
├── utils/
│   ├── schema.ts                   # Schema-related utility functions
│   └── string.ts                   # String manipulation utilities
└── index.ts                        # Main entry point
```

## How It Works

### Core Flow

1. **Schema Reading** (`SchemaReader.ts`)

   - Reads schema snapshot from either:
     - Local file using `snapshotFile` option
     - Directus API using host, email/password, or token
   - Handles authentication when accessing Directus API
   - Fetches the complete schema snapshot from `/schema/snapshot` endpoint

2. **Schema Processing** (`SchemaProcessor.ts` and derivatives)

   - Takes schema snapshot data and processes it into TypeScript types
   - Main processing steps:
     - Registers collections and determines their ID types
     - Analyzes relationships between collections (M2O, O2M, M2M, M2A)
     - Generates interfaces for each collection
     - Handles property type conversion and special field types
     - Handles system collections and includes them when needed

3. **Type Management** (`TypeTracker.ts` and `TypeNameManager.ts`)
   - Tracks and manages type definitions during generation
   - Handles naming conventions for types
   - Ensures proper type content and relationships

### Configuration System

The application uses a centralized configuration system in the `src/config` directory:

- **Field Type Mapping** (`field-types.ts`)
  - Maps Directus field types to TypeScript types
  - Defines patterns for detecting datetime fields
  - Centralizes all type conversion logic

- **System Collections** (`system-collections.ts`)
  - Defines system collection names and properties
  - Maps collection names to their type names
  - Specifies ID types for system collections (string vs. number)

- **System Fields** (`system-fields.ts`)
  - Lists all system fields for each Directus system collection
  - Provides fallback when dynamic detection is unavailable

- **Relationship Patterns** (`relationship-patterns.ts`)
  - Defines patterns for identifying different relationship types
  - Contains name patterns for junction tables
  - Specifies patterns for parent/child relationships
  - Contains rules for normalizing field and collection names

### Key Components

#### Relationship Processing (`RelationshipProcessor.ts` and `RelationshipResolver.ts`)

- Identifies and categorizes relationships between collections
- Uses configurable patterns to detect relationship types
- Resolves ambiguous relationships using various strategies
- Handles junction tables and many-to-any relationships

#### Type Name Management (`TypeNameManager.ts`)

- Manages naming conventions for collections and types
- Converts collection names to appropriate TypeScript interface names
- Handles singular/plural conversions (e.g., "events" → "Event")
- Preserves singleton collection names (e.g., "settings" → "Settings")
- Uses configuration-driven detection of system collections

#### System Collection Management (`SystemCollectionManager.ts`)

- Handles Directus system collections
- Generates interfaces for system collections when referenced
- Maintains system field information for each system collection
- Provides minimal interfaces when `includeSystemFields` is false
- Uses configurable system collection definitions

#### System Field Handling (`SystemFieldManager.ts` and `SystemFieldDetector.ts`)

- Manages system field operations and type mappings
- Dynamically detects custom fields in system collections
- Provides fallback to configured system fields when necessary
- Creates synthetic system fields when needed

## Usage

```typescript
import { readSchema, generateTypeScript } from "directus-typeforge";

// Read schema from snapshot file
const schema = await readSchema({
  snapshotFile: "./schema-snapshot.json",
});

// Or read from Directus API
const schema = await readSchema({
  host: "https://your-directus-instance.com",
  email: "your-email",
  password: "your-password",
});

// Or using a static token
const schema = await readSchema({
  host: "https://your-directus-instance.com",
  token: "your-static-token",
});

// Generate TypeScript types
const types = generateTypeScript(schema, {
  typeName: "ApiCollections",
  useTypeReferences: true,
  makeRequired: true,
  includeSystemFields: true,
  addTypedocNotes: true,
});
```

## Type Generation Process

1. **Collection Registration**

   - Processes schema snapshot to identify collections
   - Determines ID types for each collection (string or number)
   - Maps collection names to type names
   - Identifies singleton collections (those with `meta.singleton: true`)
   - Applies different naming conventions for singletons vs. regular collections

2. **Relationship Analysis**

   - Identifies relationships between collections using configurable patterns
   - Categorizes as many-to-one, one-to-many, many-to-many, or many-to-any
   - Tracks both sides of each relationship
   - Uses multiple strategies to resolve ambiguous relationships

3. **Interface Generation**

   - Generates TypeScript interfaces/types for each collection
   - Maps field types using configuration-driven type mapping
   - Properly types relationship fields
   - Special handling for junction tables and many-to-any relationships

4. **System Collection Handling**

   - Generates appropriate interfaces for referenced system collections
   - Includes full system fields when `includeSystemFields` is true
   - Provides minimal interfaces (ID only) when `includeSystemFields` is false
   - Detects custom fields added to system collections

5. **Root Type Generation**
   - Generates the root type that includes all collections
   - Correctly handles singleton vs. regular collections (array vs. single object)
   - Includes system collections when appropriate

## Extending the Configuration

The configuration system makes it easy to extend or modify the type generation behavior:

### Adding New Field Types

1. Add the new field type mapping in `src/config/field-types.ts`:

```typescript
export const TYPE_MAPPING = {
  // Existing mappings...
  new_field_type: 'string', // or appropriate TypeScript type
};
```

### Supporting New System Collections

1. Add the system collection to `src/config/system-collections.ts`:

```typescript
export const SYSTEM_COLLECTION_NAMES = [
  // Existing collections...
  'directus_new_collection',
];

// Update ID type lists as appropriate
export const STRING_ID_COLLECTIONS = [
  // Existing collections...
  'directus_new_collection', // if it uses string IDs
];

export const SYSTEM_COLLECTION_TYPE_NAMES = {
  // Existing mappings...
  'directus_new_collection': 'DirectusNewCollection',
};
```

2. Add the system fields to `src/config/system-fields.ts`:

```typescript
export const systemFields = {
  // Existing collections...
  directus_new_collection: [
    "id",
    "field1",
    "field2",
    // Other fields...
  ],
};
```

### Adding New Relationship Patterns

To improve relationship detection for specific patterns, update `src/config/relationship-patterns.ts`:

```typescript
export const JUNCTION_TABLE_PATTERNS = {
  NAME_INDICATORS: [
    // Existing patterns...
    '_new_junction_pattern_',
  ],
  // Other patterns...
};
```

## Development Notes

- The configuration system eliminates hardcoded values throughout the codebase
- Relationship detection uses multiple strategies with configurable patterns
- System collections and fields are fully configurable for different Directus versions
- Type mapping is centralized for consistency

### Type Naming Conventions

- Regular collections are converted from plural to singular form and to PascalCase
  - Example: `blog_posts` → `BlogPost`
  - Handles common plural endings (e.g., "ies" → "y", "s" → "")
  - Skips singular-looking words ending with "s" (e.g., "analysis", "status")
- Singleton collections preserve their original form (converted to PascalCase)
  - Example: `settings` → `Settings` (not singularized to `Setting`)
  - Example: `globals` → `Globals` (not singularized to `Global`)
- System collections follow a `Directus{EntityName}` naming pattern
  - Example: `directus_users` → `DirectusUser`

## Implementation Details

### System Collections and Fields

System collections are handled in two ways:

1. With `includeSystemFields=false`:
   - Only generates minimal interfaces for system collections that are referenced in relationships
   - Each system type contains just an ID field
   - Minimizes potential compatibility issues across Directus versions

2. With `includeSystemFields=true` (default):
   - Generates complete interfaces for system collections with all fields
   - Includes all system fields for the collection
   - Provides more detailed types for working with system collections

System fields are identified through two mechanisms:

1. Dynamic identification using the Directus API:
   - The `SystemFieldDetector` class processes field data from the `/fields` endpoint
   - Fields are identified as system fields based on their `meta.system` property
   - Detects custom fields added to system collections

2. Fallback mechanism using configured system fields:
   - When fields data is not available, the system uses the `systemFields` configuration
   - Provides reliable field detection across Directus versions

### Relationship Handling

The tool handles all Directus relationship types using configurable detection patterns:

- **Many-to-One (M2O)**: `field: string | RelatedType;`
- **One-to-Many (O2M)**: `field: string[] | RelatedType[];`
- **Many-to-Many (M2M)**: Properly handles junction collections with both foreign keys
- **Many-to-Any (M2A)**: Handles special junction tables with `item` and `collection` fields

Relationship detection uses several strategies:
- Schema metadata analysis
- Name pattern matching
- Junction table detection
- Existing relationship analysis
- Name similarity scoring

### Extensibility

The modular, configuration-driven architecture makes the codebase more maintainable and extensible:

1. **Adding Support for New Directus Versions**:
   - Update system field definitions in configuration
   - Adjust relationship detection patterns if needed
   - No code changes required for most updates

2. **Customizing Type Generation**:
   - All type generation rules are configurable
   - Field type mapping can be extended for special cases
   - Relationship detection patterns can be enhanced

3. **Supporting Custom Naming Conventions**:
   - Type name generation logic is centralized and configurable
   - PascalCase conversion and singularization rules can be adjusted