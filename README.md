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
- **Type Name Conventions:** Generate appropriate type names by converting
  collection names to PascalCase and automatically handling pluralization (e.g.,
  `Event` for an `events` collection, while preserving singleton collection
  names like `Settings` or `Globals`)
- **SDK Compatibility:** Generated types work seamlessly with the Directus SDK
- **Customizable Output:** Control type generation behavior with various options
- **Configurable Architecture:** All type detection patterns and mappings use a
  centralized configuration system

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
| `--debug`               |       | Enable debug logging                              | `false`          |
| `--logLevel`            |       | Set log level (error, warn, info, debug, trace)   | `info`           |
| `--logFile`             |       | Path to write debug logs                          |                  |

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

# Enable debug logging to troubleshoot issues
npx directus-typeforge -i schema-snapshot.json --debug --logLevel debug --logFile ./typeforge-debug.log -o ./types/schema.ts
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

## Debugging

If you encounter issues with type generation, TypeForge provides comprehensive
debugging options:

### Enable Debug Logging

Use the `--debug` flag to enable detailed logging:

```bash
npx directus-typeforge -i schema-snapshot.json --debug -o ./types/schema.ts
```

### Set Log Level

Control the verbosity with the `--logLevel` option:

```bash
# Available levels: error, warn, info, debug, trace (from least to most verbose)
npx directus-typeforge -i schema-snapshot.json --debug --logLevel trace -o ./types/schema.ts
```

### Write Logs to File

Save logs to a file for easier troubleshooting:

```bash
npx directus-typeforge -i schema-snapshot.json --debug --logFile ./debug.log -o ./types/schema.ts
```

### Debug Mode for Issue Reporting

When reporting issues, include the debug logs:

```bash
npx directus-typeforge -i schema-snapshot.json --debug --logLevel debug --logFile ./typeforge-debug.log -o ./types/schema.ts
```

The logs contain detailed information about:

- Relationship detection and resolution
- Field type mapping decisions
- Junction table identification
- System field handling
- Overall process flow

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

## License

[MIT](LICENSE.md)
