import { SchemaReader } from "./services/SchemaReader";
import { SchemaProcessor } from "./services/SchemaProcessor";
import type { 
  SchemaReadOptions, 
  GenerateTypeScriptOptions, 
  DirectusSchemaSnapshot
} from "./types";

/**
 * Read schema snapshot from a file or Directus server
 * 
 * @param options Options for reading the schema
 * @returns The schema snapshot
 */
export async function readSchema(options: SchemaReadOptions): Promise<DirectusSchemaSnapshot> {
  return SchemaReader.readSchema(options);
}


/**
 * Generate TypeScript types from a schema snapshot
 * 
 * @param schema The schema snapshot
 * @param options Options for generating TypeScript
 * @param fieldsData Optional fields data for system field detection
 * @returns TypeScript code as a string
 */
export async function generateTypeScript(
  schema: DirectusSchemaSnapshot,
  options: GenerateTypeScriptOptions,
  schemaOptions?: SchemaReadOptions
): Promise<string> {
  // Create the schema processor with the provided schema and options
  const processor = new SchemaProcessor(schema, options);
  
  // Process the schema and generate TypeScript code
  return processor.process();
}

// Export types for consumers of the package
export type {
  SchemaReadOptions,
  GenerateTypeScriptOptions,
  TypeDefinition,
  DirectusSchemaSnapshot,
  DirectusCollection,
  DirectusField,
  DirectusRelation,
  RelationshipType,
} from "./types";