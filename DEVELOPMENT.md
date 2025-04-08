# Directus TypeForge Development Guide

A TypeScript type definition generator for Directus schemas. This tool processes
Directus schema snapshots and generates corresponding TypeScript type definitions
optimized for use with the Directus SDK.

## Project Structure

```
src/
├── constants/
│   └── system_fields.ts             # Directus system field definitions
├── generators/
│   └── typescript.ts                # TypeScript code generation helpers
├── services/
│   ├── InterfaceGenerator.ts        # Generates interfaces for collections
│   ├── PropertyGenerator.ts         # Generates property types for fields
│   ├── RelationshipTracker.ts       # Tracks relationships between collections
│   ├── SchemaProcessor.ts           # Processes schema data into TypeScript types
│   ├── SchemaReader.ts              # Handles reading schema snapshots
│   ├── SchemaSnapshotProcessor.ts   # Processes Directus schema snapshots
│   ├── SystemCollectionManager.ts   # Manages system collection types
│   ├── TypeNameManager.ts           # Manages type naming and conversions
│   └── TypeTracker.ts               # Tracks type definitions during generation
├── types/
│   └── index.ts                     # Central type definitions
├── utils/
│   ├── schema.ts                    # Schema-related utility functions
│   └── string.ts                    # String manipulation utilities
└── index.ts                         # Main entry point
```

## How It Works

### Core Flow

1. **Schema Reading** (`SchemaReader.ts`)

   - Reads schema snapshot from either:
     - Local file using `snapshotFile` option
     - Directus API using host, email/password, or token
   - Handles authentication when accessing Directus API
   - Fetches the complete schema snapshot from `/schema/snapshot` endpoint

2. **Schema Processing** (`SchemaProcessor.ts` and `SchemaSnapshotProcessor.ts`)

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

### Key Components

#### Relationship Tracking (`RelationshipTracker.ts`)

- Tracks relationships between collections
- Categorizes relationships by type (M2O, O2M, M2M, M2A)
- Helps generate appropriate TypeScript types for relationships

#### Type Name Management (`TypeNameManager.ts`)

- Manages naming conventions for collections and types
- Converts collection names to appropriate TypeScript interface names
- Handles singular/plural conversions (e.g., "events" → "Event")
- Preserves singleton collection names (e.g., "settings" → "Settings")
- Maintains type name consistency throughout the codebase

#### System Collection Management (`SystemCollectionManager.ts`)

- Handles Directus system collections
- Generates interfaces for system collections when referenced
- Maintains system field information for each system collection
- Provides minimal interfaces when `includeSystemFields` is false

#### Interface Generation (`InterfaceGenerator.ts`)

- Generates TypeScript interfaces for collections
- Handles field types and relationships
- Manages special cases like junction tables and many-to-any relationships

#### Type Definitions (`types/index.ts`)

- Contains all shared type definitions
- Includes configuration options types
- Defines schema snapshot types

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

   - Identifies relationships between collections
   - Categorizes as many-to-one, one-to-many, many-to-many, or many-to-any
   - Tracks both sides of each relationship

3. **Interface Generation**

   - Generates TypeScript interfaces/types for each collection
   - Handles different field types
   - Properly types relationship fields
   - Special handling for junction tables and many-to-any relationships

4. **System Collection Handling**

   - Generates appropriate interfaces for referenced system collections
   - Includes full system fields when `includeSystemFields` is true
   - Provides minimal interfaces (ID only) when `includeSystemFields` is false

5. **Root Type Generation**
   - Generates the root `ApiCollections` type that includes all collections
   - Correctly handles singleton vs. regular collections (array vs. single object)
   - Includes system collections when appropriate

## Development Notes

- System field definitions are maintained in `constants/system_fields.ts`
- TypeScript formatting is consistent for clean, readable output
- Junction tables (M2M and M2A) get special handling to include all relevant fields
- Relationship types follow the Directus SDK conventions

### Type Naming Conventions

- Regular collections are converted from plural to singular form and to PascalCase
  - Example: `blog_posts` → `BlogPost`
  - Handles common plural endings (e.g., "ies" → "y", "s" → "")
  - Skips singular-looking words ending with "s" (e.g., "analysis", "status")
- Singleton collections preserve their original form (converted to PascalCase)
  - Example: `settings` → `Settings` (not singularized to `Setting`)
  - Example: `globals` → `Globals` (not singularized to `Global`)
  - This maintains the semantic meaning of singleton collections
- System collections follow a `Directus{EntityName}` naming pattern
  - Example: `directus_users` → `DirectusUser`

## Implementation Details

### System Collections and Fields

System collections are handled in two ways:

1. With `includeSystemFields=false` (default for SDK usage):
   - Only generates minimal interfaces for system collections that are referenced in relationships
   - Each system type contains just an ID field
   - Minimizes potential compatibility issues across Directus versions

2. With `includeSystemFields=true`:
   - Generates complete interfaces for system collections with all fields
   - Includes all system fields for the collection
   - Provides more detailed types for working with system collections

System fields are identified through two mechanisms:

1. Dynamic identification using the Directus API:
   - The `SystemFieldDetector` class processes field data from the `/fields` endpoint
   - Fields are identified as system fields based on their `meta.system` property
   - This provides accurate system field identification for any Directus installation

2. Fallback mechanism using predefined fields:
   - When fields data is not available, the system uses the `SYSTEM_FIELDS` constant
   - This constant can be updated using the `update-system-fields.ts` script
   - The script fetches system fields from a Directus instance and generates an updated constant

### Relationship Handling

The tool handles all Directus relationship types:

- **Many-to-One (M2O)**: `field: string | RelatedType;`
- **One-to-Many (O2M)**: `field: string[] | RelatedType[];`
- **Many-to-Many (M2M)**: Properly handles junction collections with both foreign keys
- **Many-to-Any (M2A)**: Handles special junction tables with `item` and `collection` fields
