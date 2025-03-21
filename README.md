# Directus TypeForge

**Directus TypeForge** generates TypeScript definitions for Directus collections
from an OpenAPI schema or a live Directus server. It supports both custom and
system collections, providing accurate types for use with the Directus
TypeScript SDK.

This tool is a fork and rewrite of
[elierotenberg/directus-typescript-gen](https://github.com/elierotenberg/directus-typescript-gen).

[View project on NPM](https://www.npmjs.com/package/directus-typeforge) |
[View project on GitHub](https://github.com/StephenGunn/directus-typeforge)

## Features

- **Dynamic Generation:** Get types from a static schema file or an active
  Directus instance
- **System Collections:** Automatically handle Directus system collections with
  proper type definitions
- **Authentication Options:** Support for email/password or bearer token
  authentication
- **Relationships:** Represent collection relationships with proper TypeScript
  interfaces
- **Type Consistency:** Generate singular type names (e.g., `Event` for `events`
  collection)
- **Special Field Types:** Support for Directus-specific field types like
  datetime, JSON, and CSV
- **Customizable Output:** Control the type name generation and references
- **SDK Compatibility:** Options to generate types that work seamlessly with the
  Directus SDK

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
| `--specFile`            | `-i`  | Path to OpenAPI spec file                         | -                |
| `--host`                | `-h`  | Directus host URL                                 | -                |
| `--email`               | `-e`  | Email for authentication                          | -                |
| `--password`            | `-p`  | Password for authentication                       | -                |
| `--token`               | `-t`  | Admin bearer token for authentication             | -                |
| `--outFile`             | `-o`  | Output file for TypeScript types                  | -                |
| `--typeName`            | `-n`  | Root type name                                    | `ApiCollections` |
| `--useTypeReferences`   | `-r`  | Use interface references for relation types       | `true`           |
| `--useTypes`            | `-u`  | Use 'type' instead of 'interface'                 | `false`          |
| `--makeRequired`        | `-m`  | Make all fields required (no optional '?' syntax) | `false`          |
| `--includeSystemFields` | `-s`  | Include all system fields in system collections   | `false`          |

**only disable `--useTypeReferences` for very specific debugging, it will make
all of your relational types break.**

## SDK Compatibility Options

For best compatibility with the Directus SDK:

- Use `--makeRequired` (`-m`) to generate required fields without the optional
  `?` modifier. The SDK handles nullability internally.
- Use `--includeSystemFields` (`-s`) to include all system fields in system
  collections, which improves type checking with SDK operations.

## Usage Examples

```bash
# From a Spec File
npx directus-typeforge -i directus.oas.json > schema.ts

# From a Live Server with Email/Password
npx directus-typeforge --host https://example.com --email user@example.com --password pass123 --outFile schema.ts

# From a Live Server with Admin Token
npx directus-typeforge --host https://example.com --token your-static-token --outFile schema.ts

# Custom Root Type Name
npx directus-typeforge -i directus.oas.json --typeName MySchema > schema.ts

# Generate using 'type' instead of 'interface'
npx directus-typeforge -i ./directus.oas.json -u -o ./types/schema.ts

# Generate SDK-optimized types with required fields and full system collection fields
npx directus-typeforge -i ./directus.oas.json -m -s -o ./types/schema.ts
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

export interface ApiCollections {
  events: Event[];
  tickets: Ticket[];
  directus_users: DirectusUser[];
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

TypeForge analyzes your Directus schema through the OpenAPI specification,
extracting collection information, field definitions, and relationship mappings:

1. **Schema Reading:** Fetches the schema from a file or live Directus instance
2. **Type Name Generation:** Creates appropriate interface names for collections
3. **Relationship Analysis:** Identifies and properly types all relations
4. **Property Generation:** Maps API fields to TypeScript types with proper
   nullability
5. **System Collection Handling:** Identifies and processes Directus system
   collections
6. **Root Type Creation:** Generates a root type that includes all collections

## Caveats

- **JSON Repeaters:** JSON repeaters are typed as `unknown` since there's no
  standardized structure information in the OpenAPI schema.
- **Complex Field Types:** Some specialized Directus field types are typed with
  string literals (e.g., `'datetime'`, `'json'`, `'csv'`) to match the Directus
  SDK's expected types.
- **Special Types:** Certain system types like permissions and settings use
  `unknown` for complex nested objects where the structure is variable.

## License

[MIT](LICENSE.md)
