import "openapi-types";

declare module "openapi-types" {
  namespace OpenAPIV3 {
    interface LicenseObject {
      identifier?: string; // Added as optional
      [key: `x-${string}`]: any; // Allows custom extensions
    }

    interface ContactObject {
      [key: `x-${string}`]: any; // Allows custom extensions
    }

    interface SchemaObject {
      [key: `x-${string}`]: any; // Allows custom extensions
    }
  }
}
