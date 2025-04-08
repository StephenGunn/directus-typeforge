import { SchemaReader } from "./services/SchemaReader";
import { SchemaProcessor } from "./services/SchemaProcessor";
import { SystemFieldDetector } from "./services/SystemFieldDetector";
import type { 
  SchemaReadOptions, 
  GenerateTypeScriptOptions, 
  DirectusSchemaSnapshot,
  DirectusFieldsResponse
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
 * Read fields data from a file or Directus server
 * 
 * @param options Options for reading the fields
 * @returns The fields data
 */
export async function readFields(options: SchemaReadOptions): Promise<DirectusFieldsResponse> {
  return SchemaReader.readFields(options);
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
  // Initialize system field detector if schema options are provided
  let systemFieldDetector: SystemFieldDetector | undefined;
  
  if (schemaOptions) {
    systemFieldDetector = new SystemFieldDetector(schemaOptions);
    await systemFieldDetector.initialize();
  }
  
  // Create the schema processor with the provided schema and options
  const processor = new SchemaProcessor(schema, options, systemFieldDetector);
  
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