# Directus TypeForge

**Directus TypeForge** generates TypeScript definitions for Directus collections
from an OpenAPI schema or a live Directus server. It supports both custom and
system collections, providing accurate types for use with the Directus
TypeScript SDK.

This tool is a fork and rewrite of
[elierotenberg/directus-typescript-gen](https://github.com/elierotenberg/directus-typescript-gen).

[View project on NPM](https://www.npmjs.com/package/directus-typeforge) |
[View project on GitHub](https://github.com/StephenGunn/directus-typeforge)

## Beta Disclaimer

This is still a work in progress. It works on the projects that I am testing it
with but use it at your own risk. I plan on rewriting a lot of this but wanted
to post the first real working version.

## Demo

https://github.com/user-attachments/assets/5c1c0292-18d8-41c6-a621-ea1b45fd4099

I am using a custom shell script to execute the `pnpm types` command. I will be
writing about this soon on my blog at
[https://jovianmoon.io](https://jovianmoon.io).

## Features

- **Dynamic Generation:** Get types from a static schema file or an active
  Directus instance.
- **System Collections:** Optionally include Directus system collections.
- **Relationships:** Seamlessly represent collection relationships.
- **Configurable Output:** Set custom root type names and output file paths.

## Todo

- [ ] Rewrite the code to be more modular and easier to read.
- [ ] Add more options for generating types like prefixing, suffixing, etc.
- [ ] Add support for static admin token authentication.
- [x] Prevent empty system collection types from being generated.
- [ ] Derive system fields from the Directus API.

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

### From a Live Server

```bash
npx directus-typeforge --host https://example.com --email user@example.com --password pass123 --outFile schema.d.ts
```

### Custom Root Type Name

```bash
npx directus-typeforge -i directus.oas.json --typeName MySchema > schema.d.ts
```

## Expected Output

```typescript
export type ApiCollections = {
  events: ItemsEvents[];
  tickets: ItemsTickets[];
  directus_users: DirectusUsers[];
};

export type ItemsEvents = {
  id: string;
  title?: string;
  start_date?: string;
  event_registrations?: string[] | ItemsEventRegistrations[];
};

export type ItemsEventRegistrations = {
  id: string;
  event?: string | ItemsEvents;
  user?: string | DirectusUsers;
};

export type ItemsTickets = {
  id: string;
  date_created?: string;
  date_updated?: string;
  title?: string;
  event?: string | ItemsEvents;
};

// custom fields on system collections
export type DirectusUsers = {
  customer_id?: string;
  verification_token?: string;
};
```

## Integration

Use the generated types directly with the Directus SDK for stronger
type-checking and autocompletion. Pass the main collection type to the SDK's
`createDirectus` function.

```typescript
import type { ApiCollections } from "$lib/types/directus/api-collection";
import { DIRECTUS_URL } from "$env/static/private";
import { createDirectus, rest } from "@directus/sdk";

export const initDirectus = () => {
  return createDirectus<ApiCollections>(DIRECTUS_URL).with(rest());
};
```

## License

[MIT](LICENSE.md)
