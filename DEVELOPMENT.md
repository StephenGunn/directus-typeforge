# Directus TypeForge

A TypeScript type definition generator for Directus schemas. This tool processes
Directus OpenAPI specifications and generates corresponding TypeScript type
definitions.

## Project Structure

```
src/
├── constants/
│   └── system_fields.ts      # Directus system field definitions
├── services/
│   ├── SchemaProcessor.ts    # Processes OpenAPI schemas into TypeScript types
│   ├── SpecReader.ts         # Handles reading and fetching OpenAPI specs
│   └── TypeTracker.ts        # Manages type definitions during generation
├── types/
│   └── index.ts             # Central type definitions
├── utils/
│   ├── schema.ts            # Schema-related utility functions
│   └── string.ts            # String manipulation utilities
└── index.ts                 # Main entry point
```

## How It Works

### Core Flow

1. **Spec Reading** (`SpecReader.ts`)

   - Reads OpenAPI spec from either:
     - Local file using `specFile` option
     - Directus API using host, email, and password
   - Handles authentication when accessing Directus API

2. **Schema Processing** (`SchemaProcessor.ts`)

   - Takes OpenAPI spec and processes it into TypeScript types
   - Main processing steps:
     - Collects schemas from paths and system collections
     - Generates SDK interfaces for each schema
     - Handles property type conversion and relationships

3. **Type Management** (`TypeTracker.ts`)
   - Tracks and manages type definitions during generation
   - Handles special cases for Directus types
   - Ensures proper type content and validity

### Key Components

#### Type Definitions (`types/index.ts`)

- Contains all shared type definitions
- Includes configuration options types
- Defines schema extension types

#### Utility Functions

- **Schema Utils** (`utils/schema.ts`):
  - Type guards for schema objects
  - Reference extraction utilities
  - System collection detection
- **String Utils** (`utils/string.ts`):
  - Case conversion utilities

## Usage

```typescript
import { readSpecFile, generateTypeScript } from "directus-typeforge";

// Read spec from file
const spec = await readSpecFile({
  specFile: "./directus-spec.json",
});

// Or read from Directus API
const spec = await readSpecFile({
  host: "https://your-directus-instance.com",
  email: "your-email",
  password: "your-password",
});

// Generate TypeScript types
const types = await generateTypeScript(spec, {
  typeName: "DirectusCollections",
});
```

## Type Generation Process

1. **Collection Schema Collection**

   - Processes API paths to find collections
   - Identifies system collections
   - Extracts schema references

2. **Interface Generation**

   - Generates TypeScript interfaces for each schema
   - Handles different property types:
     - Basic types (string, number, etc.)
     - Arrays
     - References to other collections
     - OneOf relationships

3. **Type Refinement**
   - Removes system fields when appropriate
   - Handles special Directus type cases
   - Manages relationship references

## Development Notes

- Uses temporary files for large spec processing
- Handles cleanup automatically
- Some type assertions are used with TODO markers for future improvement
- System fields are defined separately for maintainability
