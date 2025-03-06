import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { ExtendedSchemaObject } from "../types";

/**
 * Type guard to check if an object is a reference object
 */
export const isReferenceObject = (
  obj:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.SchemaObject
    | OpenAPIV3.ResponseObject,
): obj is OpenAPIV3.ReferenceObject => {
  return "$ref" in obj;
};

/**
 * Type guard to check if a schema is an array schema
 */
export const isArraySchema = (
  schema: OpenAPIV3.SchemaObject,
): schema is OpenAPIV3.ArraySchemaObject => {
  return schema.type === "array" && "items" in schema;
};

/**
 * Checks if an object has a $ref property
 */
export const hasRef = (obj: unknown): obj is { $ref: string } => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "$ref" in obj &&
    typeof obj.$ref === "string"
  );
};

/**
 * Extracts reference from a path item
 */
export const extractRefFromPathItem = (
  pathItem: OpenAPIV3.PathItemObject,
): string | null => {
  const operation = pathItem.get;
  if (!operation) return null;

  const response200 = operation.responses["200"];
  if (!response200 || isReferenceObject(response200)) return null;

  const content = response200.content?.["application/json"];
  if (!content) return null;

  const schema = content.schema;
  if (!schema || isReferenceObject(schema)) return null;

  if (!("properties" in schema) || !schema.properties) return null;

  const dataProp = schema.properties["data"];
  if (!dataProp || isReferenceObject(dataProp)) return null;

  if (!isArraySchema(dataProp)) return null;

  const items = dataProp.items;
  if (!items || !isReferenceObject(items)) return null;

  const refPattern = /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/;
  const match = refPattern.exec(items.$ref);
  return match?.groups?.ref ?? null;
};

/**
 * Finds system collections in the OpenAPI spec
 */
export const findSystemCollections = (spec: OpenAPIV3.Document): string[] => {
  const systemCollections: string[] = [];
  if (spec.components?.schemas) {
    for (const schema of Object.values(spec.components.schemas)) {
      const schemaObject = schema as ExtendedSchemaObject;
      if (schemaObject["x-collection"]) {
        const match = /^(directus_[a-zA-Z0-9_]+)$/.exec(
          schemaObject["x-collection"],
        );
        if (match?.[1]) {
          systemCollections.push(match[1]);
        }
      }
    }
  }
  return systemCollections;
};
