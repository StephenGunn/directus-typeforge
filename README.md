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
- **System Collections:** Automatically handle Directus system collections
- **Authentication Options:** Support for email/password or bearer token
  authentication
- **Relationships:** Represent collection relationships with proper TypeScript
  interfaces
- **Singular Type Names:** Generate singular type names (e.g., `Event` for
  `events` collection)

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

## Usage

### From a Spec File

```bash
npx directus-typeforge -i directus.oas.json > schema.d.ts
```

### From a Live Server with Email/Password

```bash
npx directus-typeforge --host https://example.com --email user@example.com --password pass123 --outFile schema.d.ts
```

### From a Live Server with Admin Token

```bash
npx directus-typeforge --host https://example.com --token your-static-token --outFile schema.d.ts
```

### Custom Root Type Name

```bash
npx directus-typeforge -i directus.oas.json --typeName MySchema > schema.d.ts
```

## Available Options

| Option                | Alias | Description                                 | Default          |
| --------------------- | ----- | ------------------------------------------- | ---------------- |
| `--specFile`          | `-i`  | Path to OpenAPI spec file                   | -                |
| `--host`              | `-h`  | Directus host URL                           | -                |
| `--email`             | `-e`  | Email for authentication                    | -                |
| `--password`          | `-p`  | Password for authentication                 | -                |
| `--token`             | `-k`  | Admin bearer token for authentication       | -                |
| `--outFile`           | `-o`  | Output file for TypeScript types            | -                |
| `--typeName`          | `-t`  | Root type name                              | `ApiCollections` |
| `--useTypeReferences` | `-r`  | Use interface references for relation types | `true`           |

## Expected Output

```typescript
export interface Event {
  id: string;
  title?: string;
  start_date?: string;
  event_registrations?: string[] | EventRegistration[];
}

export interface EventRegistration {
  id: string;
  event?: string | Event;
  user?: string | CustomDirectusUser;
}

export interface Ticket {
  id: string;
  date_created?: string;
  date_updated?: string;
  title?: string;
  event?: string | Event;
}

// custom fields on system collections
export interface CustomDirectusUser {
  customer_id?: string;
  verification_token?: string;
}

export interface ApiCollections {
  events: Event[];
  tickets: Ticket[];
  directus_users: CustomDirectusUser[];
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

## Caveats

- **System Collections:** System collections include ID fields and custom,
  user-created fields only. The Directus SDK should override the system fields
  with the correct types.
- **JSON Repeaters:** JSON repeaters are not yet supported and are typed as
  `unknown`. There is no data describing the structure of repeaters in the
  OpenAPI schema.

## Beta Disclaimer

This is still a work in progress. It works on the projects it has been tested
with, but use it at your own risk.

## License

[MIT](LICENSE.md)
