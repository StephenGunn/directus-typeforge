# Directus TypeForge

**Directus TypeForge** generates TypeScript definitions for Directus collections
from a schema snapshot file or directly from a live Directus server. It supports
both custom and system collections, providing accurate types for use with the
Directus TypeScript SDK.

This tool works directly with Directus schema snapshots for improved accuracy
and compatibility.

[View project on NPM](https://www.npmjs.com/package/directus-typeforge) |
[View project on GitHub](https://github.com/StephenGunn/directus-typeforge)

## Features

- **Schema Snapshot Support:** Generate types from a schema snapshot file or
  directly from a Directus server
- **Singleton Collection Detection:** Automatically identify and properly type
  singleton collections
- **TypeDoc Support:** Add JSDoc comments from field notes to your generated
  types
- **System Collections Support:** Properly handle Directus system collections
  with configurable detail levels
- **Authentication Options:** Support for email/password or bearer token
  authentication
- **Relationship Handling:** Generate proper TypeScript types for all
  relationship types (M2O, O2M, M2M, and M2A)
- **Type Name Conventions:** Generate appropriate type names by converting collection names
  to PascalCase and automatically handling pluralization (e.g., `Event` for an `events` 
  collection, while preserving singleton collection names like `Settings` or `Globals`)
- **SDK Compatibility:** Generated types work seamlessly with the Directus SDK
- **Customizable Output:** Control type generation behavior with various options

## Installation

### Using `npx`

```bash
npx directus-typeforge [options]
```

### Local Install

```bash
pnpm add -D directus-typeforge
npx directus-typeforge [options]
```

### Global Install

```bash
pnpm add -g directus-typeforge
directus-typeforge [options]
```

## Available Options

| Option                  | Alias | Description                                       | Default          |
| ----------------------- | ----- | ------------------------------------------------- | ---------------- |
| `--snapshotFile`        | `-i`  | Path to schema snapshot file                      | -                |
| `--fieldsFile`          | `-f`  | Path to fields data file (from /fields endpoint)  | -                |
| `--host`                | `-h`  | Directus host URL                                 | -                |
| `--email`               | `-e`  | Email for authentication                          | -                |
| `--password`            | `-p`  | Password for authentication                       | -                |
| `--token`               | `-t`  | Admin bearer token for authentication             | -                |
| `--outFile`             | `-o`  | Output file for TypeScript types                  | -                |
| `--typeName`            | `-n`  | Root type name                                    | `ApiCollections` |
| `--useTypeReferences`   | `-r`  | Use interface references for relation types       | `true`           |
| `--useTypes`            | `-u`  | Use 'type' instead of 'interface'                 | `false`          |
| `--makeRequired`        | `-m`  | Make all fields required (no optional '?' syntax) | `true`           |
| `--includeSystemFields` | `-s`  | Include all system fields in system collections   | `true`           |
| `--addTypedocNotes`     | `-d`  | Add JSDoc comments from field notes               | `true`           |

**only disable `--useTypeReferences` for very specific debugging, it will make
all of your relational types break.**

## SDK Compatibility Options

TypeForge is optimized for compatibility with the Directus SDK by default:

- Fields are required by default (no optional `?` modifier) since the SDK
  handles nullability internally
- System fields are included by default to improve type checking with SDK
  operations
- TypeDoc comments are added from field notes
- Type references for relations are enabled

## Usage Examples

```bash
# From a Schema Snapshot File
npx directus-typeforge -i schema-snapshot.json > schema.ts

# From a Live Server with email/password
npx directus-typeforge --host https://example.com --email user@example.com --password pass123 -o schema.ts

# From a Live Server with token
npx directus-typeforge --host https://example.com --token your-static-token -o schema.ts

# With dynamic system field detection
npx directus-typeforge -i schema-snapshot.json -f all-fields.json -o ./types/schema.ts

# Custom Root Type Name
npx directus-typeforge -i schema-snapshot.json --typeName MySchema > schema.ts

# Make fields optional (add ? syntax)
npx directus-typeforge -i schema-snapshot.json --makeRequired=false -o ./types/schema.ts

# Exclude system fields from system collections
npx directus-typeforge -i schema-snapshot.json --includeSystemFields=false -o ./types/schema.ts

# Disable JSDoc comments from field notes
npx directus-typeforge -i schema-snapshot.json --addTypedocNotes=false -o ./types/schema.ts

# Generate using 'type' instead of 'interface'
npx directus-typeforge -i schema-snapshot.json -u -o ./types/schema.ts
```

## Expected Output

```typescript
export interface Event {
  id: string;
  title: string; // No optional ? with --makeRequired
  start_date: string;
  event_registrations: string[] | EventRegistration[];
}

export interface EventRegistration {
  id: string;
  event: string | Event;
  user: string | DirectusUser;
}

export interface Ticket {
  id: string;
  date_created: string;
  date_updated: string;
  title: string;
  event: string | Event;
}

// Junction table for many-to-many relationship
export interface ArticlesCategory {
  id: number;
  articles_id: number[] | Article[];
  categories_id: string[] | Category[];
}

// Junction table for many-to-any relationship
export interface ProductsRelatedItem {
  id: number;
  products_id: number[] | Product[];
  item: string; // ID of the related item
  collection: string; // Collection of the related item
}

// Full system collection with --includeSystemFields
export interface DirectusUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  location: string;
  title: string;
  description: string;
  avatar: string;
  language: string;
  // ...all system fields included
  // Custom fields
  stripe_customer_id: string;
  verification_token: string;
  verification_url: string;
}

// Minimal system collection with --includeSystemFields=false
export interface DirectusUser {
  id: string;
}

export interface ApiCollections {
  events: Event[];
  tickets: Ticket[];
  settings: Setting; // Singleton collection (not an array)

  // System collections included with --includeSystemFields
  directus_users: DirectusUser[];
  directus_files: DirectusFile[];
}
```

## Integration with Directus SDK

Use the generated types directly with the Directus SDK for stronger
type-checking and autocompletion:

```typescript
import type { ApiCollections } from "$lib/types/directus/api-collection";
import { DIRECTUS_URL } from "$env/static/private";
import { createDirectus, rest } from "@directus/sdk";

export const initDirectus = () => {
  return createDirectus<ApiCollections>(DIRECTUS_URL).with(rest());
};
```

### Type Compatibility with Directus SDK

The types generated by TypeForge follow the patterns outlined in the
[Advanced Types with the Directus SDK](https://directus.io/docs/tutorials/tips-and-tricks/advanced-types-with-the-directus-sdk)
documentation.

### Recommended Pattern

We recommend using the following pattern to create type-safe functions when
working with the SDK:

```typescript
async function getArticles() {
  return await client.request(
    readItems("articles", {
      fields: ["id", "title", "content"],
      filter: { status: { _eq: "published" } },
    }),
  );
}

// This type will automatically be inferred as:
// { id: string; title: string; content: string; }
export type Article = Awaited<ReturnType<typeof getArticles>>;
```

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

## Singleton Collections

In Directus, singleton collections represent a single object rather than a
collection of items. TypeForge handles singleton collections in two important ways:

1. **Type Name Generation:** For regular collections, TypeForge converts plural collection names to singular form (e.g., `events` becomes `Event` type). However, for singleton collections like `settings` or `globals`, TypeForge preserves the original name in PascalCase (e.g., `Settings` or `Globals`), maintaining their semantic meaning.

2. **Root Interface Representation:** Singleton collections are represented as single objects (not arrays) in the generated root interface.

TypeForge identifies singleton collections directly from the `singleton: true` flag in the collection metadata:

```json
// Schema snapshot
{
  "data": {
    "collections": [
      {
        "collection": "settings",
        "meta": {
          "singleton": true, // <-- This flag identifies singleton collections
          "accountability": "all"
          // ... other metadata
        },
        "schema": {
          "name": "settings"
        }
      }
    ]
  }
}
```

This results in the following type generation behavior:

```typescript
// Type definition for a singleton collection - name is preserved in PascalCase
export interface Settings {
  id: string;
  site_name: string;
  logo: string | DirectusFile;
  primary_color: string;
  // ...other fields
}

// Type definition for a regular collection - pluralized name converted to singular
export interface Article {
  id: string;
  title: string;
  content: string;
  // ...other fields
}

// Root interface representation
export interface ApiCollections {
  settings: Settings; // <-- Singleton (not an array)
  articles: Article[]; // <-- Regular collections are arrays
  globals: Globals; // <-- Another singleton example
}
```

This approach ensures accurate type representation for both regular collections and singletons, while preserving the semantic meaning of the collection names.

## Junction Tables and Relationships

TypeForge automatically handles all Directus relationship types, including
proper typing for junction tables:

### Many-to-Many (M2M) Relationships

For many-to-many relationships, TypeForge creates proper junction table
interfaces with all necessary fields:

```typescript
// Main collection referencing a many-to-many relationship
export interface Article {
  id: number;
  categories: string[]; // Generated by Directus for the M2M relationship
}

// Junction table interface with both sides of the relationship
export interface ArticlesCategory {
  id: number;
  articles_id: number[] | Article[];
  categories_id: string[] | Category[];
}
```

### Many-to-Any (M2A) Relationships

For many-to-any relationships, where items from multiple collections can be
related to a single item:

```typescript
// Main collection with a many-to-any relationship
export interface Product {
  id: number;
  related_items: string; // Generated by Directus for the M2A relationship
}

// Junction table for the many-to-any relationship
export interface ProductsRelatedItem {
  id: number;
  products_id: number[] | Product[]; // Reference to the parent product
  item: string; // ID of the related item
  collection: string; // Collection name of the related item
}
```

## System Collections

TypeForge handles system collections in two different ways, controlled by the
`--includeSystemFields` option:

### Minimal System Collections (--includeSystemFields=false)

When `includeSystemFields` is false, system collections that are referenced in
relationships are generated with minimal interfaces (just the ID field):

```typescript
export interface DirectusUser {
  id: string;
}
```

This approach:

- Minimizes potential compatibility issues across Directus versions
- Reduces the size of generated type files
- Works well when you don't need detailed system collection types

### Full System Collections (--includeSystemFields=true)

When `includeSystemFields` is true (the default), system collections are
generated with all standard fields:

```typescript
export interface DirectusUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  // ... all other standard fields
  // Plus any custom fields you've added
}
```

This approach:

- Provides detailed type information for system collections
- Includes all standard fields for the collection
- Allows for better type checking when working deeply with system collections

### System Field Identification

TypeForge identifies system fields using two approaches:

1. When using the `--fieldsFile` parameter, fields are identified by the `meta.system` property in the fields data from the Directus API. This data can be obtained from the `/fields` endpoint:

```bash
# Obtain fields data from your Directus instance
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-directus.com/fields > all-fields.json

# Use this data when generating types
npx directus-typeforge -i schema-snapshot.json -f all-fields.json -o ./types/schema.ts
```

2. When no fields data is provided, TypeForge uses a predefined set of known system fields as a fallback.

This implementation allows TypeForge to:

- Use the actual metadata from your specific Directus instance when available
- Handle different versions of Directus with varying system field configurations
- Process system fields according to their official designation in the API

For contributors maintaining this package, a utility script is available to update the fallback system field definitions:

```bash
npm run update-system-fields -- --host https://your-directus.com --token YOUR_TOKEN
```

## Caveats

- **JSON Repeaters:** JSON fields with complex structures are typed as
  `Record<string, unknown>` for better type safety, but you may need to define
  more specific types for your application.
- **Complex Field Types:** Specialized Directus field types are mapped to
  appropriate TypeScript types (string, number, boolean, etc.) rather than using
  string literals.
- **Special Types:** Certain system types like permissions and settings use
  standard TypeScript types for better type checking.
- **Type Safety:** For more specific typing of JSON fields, you might need to
  manually extend the generated types with your application-specific interfaces.

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

## License

[MIT](LICENSE.md)
