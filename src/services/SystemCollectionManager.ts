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
          this.generateSystemCollectionInterface(schema, collection);
        }

        if (this.typeTracker.hasValidContent(typeName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }

    // Ensure all standard system collections are defined even if not explicitly in the schema
    this.ensureStandardSystemCollections(schemas);
  }

  /**
   * Ensure all standard system collections are defined
   */
  private ensureStandardSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // For each standard system collection in our mapping
    const processedTypes = this.typeNameManager.getProcessedTypes();

    for (const collectionName of [
      "directus_users",
      "directus_files",
      "directus_folders",
      "directus_roles",
      "directus_activity",
      "directus_permissions",
      "directus_fields",
      "directus_collections",
      "directus_presets",
      "directus_relations",
      "directus_revisions",
      "directus_webhooks",
      "directus_flows",
      "directus_operations",
      "directus_versions",
      "directus_extensions",
      "directus_comments",
      "directus_settings",
    ]) {
      const typeName =
        this.typeNameManager.getSystemCollectionTypeName(collectionName);

      // If it's not already processed and not already in schemas
      if (!processedTypes.has(typeName) && !schemas[collectionName]) {
        this.typeNameManager.addProcessedType(typeName);

        // Create a minimal schema for the system collection
        const minimalSchema = {
          type: "object",
          properties: {
            id: {
              type:
                this.typeNameManager.getSystemCollectionIdType(
                  collectionName,
                ) === "number"
                  ? "integer"
                  : "string",
            },
          },
        } as OpenAPIV3.SchemaObject;

        this.generateSystemCollectionInterface(minimalSchema, collectionName);

        if (this.typeTracker.hasValidContent(typeName)) {
          schemas[collectionName] = {
            ref: collectionName,
            schema: minimalSchema,
          };
        }
      }
    }
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

    // Use the system collection type name
    const typeName =
      this.typeNameManager.getSystemCollectionTypeName(collection);
    let interfaceStr = `export interface ${typeName} {\n`;

    // Check if customFields already has an ID field
    const hasCustomId = customFields.some(
      ([propName]) => propName.toLowerCase() === "id",
    );

    // Only add the ID field if not already present in customFields
    if (!hasCustomId) {
      interfaceStr += `  id: ${this.typeNameManager.getSystemCollectionIdType(collection)};\n`;
    }

    const properties: string[] = hasCustomId ? [] : ["id"];

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
   */
  private determinePropertyType(
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): string {
    // Reference objects should return their references
    if ("$ref" in propSchema) {
      return "string"; // References in system collections are typically strings
    }

    // Now TypeScript knows propSchema is a SchemaObject
    if (propSchema.type === "integer" || propSchema.type === "number") {
      return "number";
    } else if (propSchema.type === "array") {
      return "any[]";
    } else if (propSchema.type === "object") {
      return "Record<string, unknown>";
    } else if (propSchema.format === "json") {
      return "unknown";
    } else {
      return (propSchema.type as string) || "unknown";
    }
  }
}
