import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { CollectionSchema, ExtendedSchemaObject } from "../types";
import { findSystemCollections, isReferenceObject } from "../utils/schema";
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
  private options: {
    useTypes?: boolean;
    includeSystemFields?: boolean;
    makeRequired?: boolean;
  };
  private referencedSystemCollections: Set<string> = new Set();

  constructor(
    spec: OpenAPIV3.Document,
    typeTracker: TypeTracker,
    typeNameManager: TypeNameManager,
    options?: {
      useTypes?: boolean;
      includeSystemFields?: boolean;
      makeRequired?: boolean;
    },
  ) {
    this.spec = spec;
    this.typeTracker = typeTracker;
    this.typeNameManager = typeNameManager;
    this.options = options || {
      useTypes: false,
      includeSystemFields: false,
      makeRequired: false,
    };
  }

  /**
   * Determines the correct ID type from a schema
   */
  private determineIdType(
    schema: OpenAPIV3.SchemaObject,
    collectionName: string,
  ): "string" | "number" {
    // First check if it's a system collection with a known ID type
    const idType =
      this.typeNameManager.getSystemCollectionIdType(collectionName);
    if (idType !== "string") {
      return idType;
    }

    // Otherwise check schema properties
    if (schema.properties && "id" in schema.properties) {
      const idProperty = schema.properties.id;
      if (
        !isReferenceObject(idProperty) &&
        (idProperty.type === "integer" || idProperty.type === "number")
      ) {
        return "number";
      }
    }

    return "string";
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

          if (this.options.includeSystemFields) {
            // Generate interface with all system fields included
            this.generateFullSystemCollectionInterface(schema, collection);
          } else {
            // Get custom fields (non-system fields)
            const customFields = Object.entries(schema.properties || {}).filter(
              ([propName]) => !this.isSystemField(propName, collection),
            );

            // Generate the interface for system collections with custom fields
            if (customFields.length > 0) {
              this.generateSystemCollectionInterface(schema, collection);
            } else if (this.isReferencedSystemCollection(typeName)) {
              // Also generate minimal interface for system collections that are referenced
              // but don't have custom fields
              this.generateMinimalSystemCollectionInterface(collection, schema);
            }
          }
        }

        if (this.typeTracker.hasValidContent(typeName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }

    // Generate minimal interfaces for essential system collections that may be referenced
    // but not explicitly in the schema
    this.generateMissingEssentialSystemCollections(schemas);
  }

  /**
   * Registers a system collection as being referenced in custom types
   */
  registerReferencedSystemCollection(typeName: string): void {
    this.referencedSystemCollections.add(typeName);
  }

  /**
   * Checks if a system collection is referenced in any custom type
   */
  isReferencedSystemCollection(typeName: string): boolean {
    return this.referencedSystemCollections.has(typeName);
  }

  /**
   * Generates minimal interfaces for essential system collections
   * that might be referenced but not have custom fields
   */
  generateMissingEssentialSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // List of essential system collection types that should always be included
    const essentialSystemTypes = [
      "DirectusFile",
      "DirectusUser",
      "DirectusFolder",
      "DirectusRole",
    ];

    for (const systemType of essentialSystemTypes) {
      if (!this.typeTracker.hasType(systemType)) {
        const matchingCollection = Object.entries(schemas).find(
          ([collection]) =>
            this.typeNameManager.getSystemCollectionTypeName(collection) ===
            systemType,
        );

        if (matchingCollection) {
          // Collection exists in schemas but doesn't have an interface yet
          if (this.options.includeSystemFields) {
            this.generateFullSystemCollectionInterface(
              matchingCollection[1].schema,
              matchingCollection[0],
            );
          } else {
            this.generateMinimalSystemCollectionInterface(
              matchingCollection[0],
              matchingCollection[1].schema,
            );
          }
        } else {
          // Collection doesn't exist in schemas, create a minimal interface anyway
          // Determine the corresponding collection name for this type
          const collectionName =
            systemType === "DirectusFile"
              ? "directus_files"
              : systemType === "DirectusUser"
                ? "directus_users"
                : systemType === "DirectusFolder"
                  ? "directus_folders"
                  : systemType === "DirectusRole"
                    ? "directus_roles"
                    : null;

          if (collectionName) {
            this.generateMinimalSystemCollectionInterface(collectionName);
          }
        }
      }
    }
  }

  /**
   * Generates a minimal interface for system collections with no custom fields
   */
  generateMinimalSystemCollectionInterface(
    collection: string,
    schema?: OpenAPIV3.SchemaObject,
  ): void {
    const typeName =
      this.typeNameManager.getSystemCollectionTypeName(collection);
    const keyword = this.options.useTypes ? "type" : "interface";

    // Determine correct ID type for this system collection
    let idType = this.typeNameManager.getSystemCollectionIdType(collection);

    // Check schema if available to determine the actual type
    if (schema) {
      idType = this.determineIdType(schema, collection);
    }

    const interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};
}\n\n`;

    this.typeTracker.addType(typeName, interfaceStr, ["id"]);
  }

  /**
   * Checks if a field is a system field
   */
  isSystemField(fieldName: string, collection?: string): boolean {
    if (!collection?.startsWith("directus_")) return false;

    if (collection && collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    }

    return false;
  }

  /**
   * Generates a full interface for a system collection including all system fields
   */
  generateFullSystemCollectionInterface(
    schema: OpenAPIV3.SchemaObject,
    collection: string,
  ): void {
    if (!schema.properties) return;

    // Use the system collection type name
    const typeName =
      this.typeNameManager.getSystemCollectionTypeName(collection);
    const keyword = this.options.useTypes ? "type" : "interface";

    // We're going to start with the ID field
    const properties: string[] = [];

    // Determine ID type by checking the schema
    const idType = this.determineIdType(schema, collection);

    let interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};\n`;
    properties.push("id");

    // Get all system fields for this collection from our constant mapping
    const systemFieldsList =
      collection in SYSTEM_FIELDS
        ? SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS]
        : [];

    // Add other property fields based on schema and system fields
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (typeof propSchema !== "object" || propName === "id") continue;
      properties.push(propName);

      // Generate property with appropriate type (simplified for system collections)
      const isOptional = this.options.makeRequired
        ? false
        : this.isNullable(propSchema);
      const typeStr = this.determinePropertyType(propSchema);
      interfaceStr += `  ${propName}${isOptional ? "?" : ""}: ${typeStr};\n`;
    }

    // Add system fields that are not already in the schema
    if (this.options.includeSystemFields && systemFieldsList.length > 0) {
      for (const fieldName of systemFieldsList) {
        // Skip fields already added
        if (fieldName === "id" || fieldName in schema.properties) continue;

        properties.push(fieldName);
        // Use string as default type for system fields not in schema
        const isOptional = !this.options.makeRequired;
        interfaceStr += `  ${fieldName}${isOptional ? "?" : ""}: string;\n`;
      }
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
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
    const keyword = this.options.useTypes ? "type" : "interface";

    // We're going to add ID only once
    const properties: string[] = [];

    // Determine ID type by checking the schema
    const idType = this.determineIdType(schema, collection);

    let interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};\n`;
    properties.push("id");

    // Add custom fields
    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object" || propName === "id") continue;
      properties.push(propName);

      // Generate property (use a simplified version for system collections)
      const isOptional = this.options.makeRequired
        ? false
        : this.isNullable(propSchema);
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
