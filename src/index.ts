import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { SpecReader } from "./services/SpecReader";
import { SchemaProcessor } from "./services/SchemaProcessor";
import type { ReadSpecFileOptions, GenerateTypeScriptOptions } from "./types";
import tmp from "tmp";
import { writeFile, unlink } from "fs/promises";

// Enable graceful cleanup for temporary files
tmp.setGracefulCleanup();

/**
 * Reads the OpenAPI specification file
 */
export async function readSpecFile(
  options: ReadSpecFileOptions,
): Promise<OpenAPIV3.Document> {
  return SpecReader.readSpec(options);
}

/**
 * Generates TypeScript types from an OpenAPI specification
 */
export async function generateTypeScript(
  spec: OpenAPIV3.Document,
  options: GenerateTypeScriptOptions,
): Promise<string> {
  const tempFile = tmp.fileSync({ postfix: ".json" });
  const tempFilePath = tempFile.name;

  try {
    // Write spec to temporary file
    await writeFile(tempFilePath, JSON.stringify(spec), { encoding: "utf-8" });

    // Process schema and generate types with defaults for missing options
    const processor = new SchemaProcessor(spec, {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
    });

    const source = processor.processSchema();

    return source;
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore errors during cleanup
    }
  }
}

export type {
  ReadSpecFileOptions,
  GenerateTypeScriptOptions,
  TypeDefinition,
  ExtendedSchemaObject,
  FieldItems,
  CollectionSchema,
} from "./types";
