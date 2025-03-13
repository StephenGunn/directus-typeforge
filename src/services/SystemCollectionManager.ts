import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { CollectionSchema, ExtendedSchemaObject } from "../types";
import { findSystemCollections } from "../utils/schema";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import { TypeTracker } from "./TypeTracker";
import { TypeNameManager } from "./TypeNameManager";

/**
 * Handles processing of system collections
 */
export class SystemCollectionManager {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private typeNameManager: TypeNameManager;

  constructor(
    spec: OpenAPIV3.Document,
    typeTracker: TypeTracker,
    typeNameManager: TypeNameManager,
  ) {
    this.spec = spec;
    this.typeTracker = typeTracker;
    this.typeNameManager = typeNameManager;
  }

  /**
   * Process system collections and add to schemas
   */
  processSystemCollections(schemas: Record<string, CollectionSchema>): void {
    // Always process system collections
    const systemCollections = findSystemCollections(this.spec);
    for (const collection of systemCollections) {
      const schema = Object.values(this.spec.components?.schemas ?? {}).find(
        (schema) => {
          return (
            (schema as ExtendedSchemaObject)["x-collection"] === collection
          );
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        const typeName =
          this.typeNameManager.getSystemCollectionTypeName(collection);

        if (!this.typeNameManager.hasProcessedType(typeName)) {
          this.typeNameManager.addProcessedType(typeName);

          // Only generate the interface if there are custom fields
          const customFields = Object.entries(schema.properties || {}).filter(
            ([propName]) => !this.isSystemField(propName, collection),
          );

          if (customFields.length > 0) {
            this.generateSystemCollectionInterface(schema, collection);
          }
        }

        if (this.typeTracker.hasValidContent(typeName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }

    // If there are no system collections with custom fields, we don't generate anything
    // This avoids having empty interfaces for system collections
  }

  /**
   * Checks if a field is a system field
   */
  isSystemField(fieldName: string, collection?: string): boolean {
    if (fieldName === "id") return false;
    if (!collection?.startsWith("directus_")) return false;

    if (collection && collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    }

    return false;
  }

  /**
   * Generates interface for system collection's custom fields
   */
  generateSystemCollectionInterface(
    schema: OpenAPIV3.SchemaObject,
    collection: string,
  ): void {
    if (!schema.properties) return;

    // Get only non-system fields for the system collection
    const customFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collection),
    );

    // Don't generate an interface if there are no custom fields
    if (customFields.length === 0) {
      return;
    }

    // Use the system collection type name
    const typeName =
      this.typeNameManager.getSystemCollectionTypeName(collection);
    let interfaceStr = `export interface ${typeName} {\n`;

    const properties: string[] = [];

    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      // Generate property (use a simplified version for system collections)
      const isOptional = this.isNullable(propSchema);
      const typeStr = this.determinePropertyType(propSchema);
      interfaceStr += `  ${propName}${isOptional ? "?" : ""}: ${typeStr};\n`;
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Type-safe check for whether a field should be optional
   */
  private isNullable(
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): boolean {
    // Reference objects don't have a nullable property
    if ("$ref" in schema) {
      return false;
    }

    // In OpenAPI 3.1, nullable is not a standard property of SchemaObject
    // We need to check for the property without triggering TypeScript errors
    // Use type assertion to ExtendedSchemaObject which may have these properties
    const extendedSchema = schema as ExtendedSchemaObject;

    return (
      extendedSchema.nullable === true ||
      // Check for OpenAPI 3.0 style nullable
      extendedSchema.required === false ||
      // OpenAPI 3.1 style nullable via type array containing 'null'
      (Array.isArray(schema.type) && schema.type.includes("null"))
    );
  }

  /**
   * Simple property type determination for system collections
   * This preserves the special Directus types for fields
   */
  private determinePropertyType(
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): string {
    // Reference objects should return their references
    if ("$ref" in propSchema) {
      return "string"; // References in system collections are typically strings
    }

    // Handle special Directus field types
    const extendedSchema = propSchema as ExtendedSchemaObject;

    // Check for datetime format
    if (
      propSchema.type === "string" &&
      (propSchema.format === "date-time" ||
        propSchema.format === "date" ||
        propSchema.format === "timestamp")
    ) {
      return "'datetime'";
    }

    // Check for CSV format
    if (
      propSchema.type === "array" &&
      typeof propSchema.items === "object" &&
      !("$ref" in propSchema.items) &&
      propSchema.items.type === "string"
    ) {
      // This is likely a CSV field
      if (
        propSchema.format === "csv" ||
        extendedSchema["x-directus-type"] === "csv"
      ) {
        return "'csv'";
      }
    }

    // Check for JSON field
    if (
      propSchema.format === "json" ||
      extendedSchema["x-directus-type"] === "json"
    ) {
      return "'json'";
    }

    // Now TypeScript knows propSchema is a SchemaObject
    if (propSchema.type === "integer" || propSchema.type === "number") {
      return "number";
    } else if (propSchema.type === "array") {
      // For array types in system collections, use string[] instead of any[]
      // This is important for compatibility with the Directus SDK
      return "string[]";
    } else if (propSchema.type === "object") {
      return "Record<string, unknown>";
    } else {
      return (propSchema.type as string) || "unknown";
    }
  }
}
