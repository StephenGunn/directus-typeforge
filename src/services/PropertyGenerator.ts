import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { isReferenceObject, isArraySchema } from "../utils/schema";
import { TypeNameManager } from "./TypeNameManager";

/**
 * Generates TypeScript property definitions for interfaces
 */
export class PropertyGenerator {
  private typeNameManager: TypeNameManager;
  private useTypeReferences: boolean;

  constructor(typeNameManager: TypeNameManager, useTypeReferences: boolean) {
    this.typeNameManager = typeNameManager;
    this.useTypeReferences = useTypeReferences;
  }

  /**
   * Generates TypeScript definition for a property
   */
  generatePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
    parentCollection?: string,
  ): string {
    // Special handling for user references that commonly cause recursion
    if (
      propName === "user_created" ||
      propName === "user_updated" ||
      propName === "user"
    ) {
      // For these fields, always use string | DirectusUser
      if (this.useTypeReferences && !isSystemCollection) {
        return `  ${propName}?: string | DirectusUser;\n`;
      } else {
        return `  ${propName}?: string;\n`;
      }
    }

    // Check if this is a direct reference to a system collection type
    const systemType = this.typeNameManager.getSystemTypeFromReference(
      propName,
      parentCollection,
    );
    if (systemType && this.useTypeReferences && !isSystemCollection) {
      return `  ${propName}?: string | ${systemType};\n`;
    }

    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentCollection,
      );
    }

    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentCollection,
      );
    }

    if (isArraySchema(propSchema)) {
      return this.generateArrayPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentCollection,
      );
    }

    if (propName.endsWith("_id") || propName === "item") {
      return this.generateIdPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentCollection,
      );
    }

    return this.generateBasicPropertyDefinition(propName, propSchema);
  }

  /**
   * Generate property definition for reference fields
   */
  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
    parentCollection?: string,
  ): string {
    const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(propSchema.$ref);
    if (!refMatch || !refMatch[1]) {
      return `  ${propName}?: string;\n`;
    }

    const collectionName = refMatch[1];

    // For system collections, use string type if it's a system collection definition
    if (isSystemCollection) {
      return `  ${propName}?: string;\n`;
    }

    // Check for system collection references in junction tables
    const systemType = this.typeNameManager.getSystemTypeFromReference(
      propName,
      parentCollection,
    );
    if (systemType && this.useTypeReferences) {
      return `  ${propName}?: string | ${systemType};\n`;
    }

    // Otherwise, use the type reference if enabled
    if (this.useTypeReferences) {
      // For system collections like Users, use DirectusUser
      if (this.typeNameManager.isSystemCollection(collectionName)) {
        const typeName =
          this.typeNameManager.getSystemCollectionTypeName(collectionName);
        return `  ${propName}?: string | ${typeName};\n`;
      }

      // For regular collections, use clean singular names, removing any Items prefix
      let typeName =
        this.typeNameManager.getTypeNameForCollection(collectionName);
      typeName = this.typeNameManager.cleanTypeName(typeName);
      return `  ${propName}?: string | ${typeName};\n`;
    }

    return `  ${propName}?: string;\n`;
  }

  /**
   * Generate property definition for oneOf fields
   */
  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    isSystemCollection: boolean = false,
    parentCollection?: string,
  ): string {
    // First check for system type references in junction tables
    const systemType = this.typeNameManager.getSystemTypeFromReference(
      propName,
      parentCollection,
    );
    if (systemType && this.useTypeReferences && !isSystemCollection) {
      return `  ${propName}?: string | ${systemType};\n`;
    }

    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem && typeof refItem.$ref === "string") {
      // Extract proper type name
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refItem.$ref);
      if (refMatch && refMatch[1]) {
        const collectionName = refMatch[1];

        if (this.useTypeReferences && !isSystemCollection) {
          // For system collections
          if (this.typeNameManager.isSystemCollection(collectionName)) {
            const typeName =
              this.typeNameManager.getSystemCollectionTypeName(collectionName);
            return `  ${propName}?: string | ${typeName};\n`;
          }

          // For regular collections, use clean singular names, removing any Items prefix
          let typeName =
            this.typeNameManager.getTypeNameForCollection(collectionName);
          typeName = this.typeNameManager.cleanTypeName(typeName);
          return `  ${propName}?: string | ${typeName};\n`;
        }
      }

      return `  ${propName}?: string;\n`;
    }

    return `  ${propName}?: unknown;\n`;
  }

  /**
   * Generate property definition for array fields
   */
  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
    isSystemCollection: boolean = false,
    parentCollection?: string,
  ): string {
    // First check for system type references in junction tables
    const systemType = this.typeNameManager.getSystemTypeFromReference(
      propName,
      parentCollection,
    );
    if (systemType && this.useTypeReferences && !isSystemCollection) {
      return `  ${propName}?: string[] | ${systemType}[];\n`;
    }

    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      // Extract proper collection name and type
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(
        propSchema.items.$ref,
      );
      if (refMatch && refMatch[1]) {
        const collectionName = refMatch[1];

        // For regular collections, use both types
        if (this.useTypeReferences && !isSystemCollection) {
          // For system collections
          if (this.typeNameManager.isSystemCollection(collectionName)) {
            const typeName =
              this.typeNameManager.getSystemCollectionTypeName(collectionName);
            return `  ${propName}?: string[] | ${typeName}[];\n`;
          }

          // For regular collections, remove Items prefix if present
          let typeName =
            this.typeNameManager.getTypeNameForCollection(collectionName);
          typeName = this.typeNameManager.cleanTypeName(typeName);
          return `  ${propName}?: string[] | ${typeName}[];\n`;
        }
      }

      return `  ${propName}?: string[];\n`;
    }

    // Handle arrays with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => "$ref" in item);

      if (refItem && "$ref" in refItem && typeof refItem.$ref === "string") {
        // Extract proper collection name and type
        const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refItem.$ref);
        if (refMatch && refMatch[1]) {
          const collectionName = refMatch[1];

          // For arrays of items with oneOf
          if (this.useTypeReferences && !isSystemCollection) {
            // For system collections
            if (this.typeNameManager.isSystemCollection(collectionName)) {
              const typeName =
                this.typeNameManager.getSystemCollectionTypeName(
                  collectionName,
                );
              return `  ${propName}?: string[] | ${typeName}[];\n`;
            }

            // For regular collections, remove Items prefix if present
            let typeName =
              this.typeNameManager.getTypeNameForCollection(collectionName);
            typeName = this.typeNameManager.cleanTypeName(typeName);
            return `  ${propName}?: string[] | ${typeName}[];\n`;
          }
        }
      }

      return `  ${propName}?: string[];\n`;
    }

    // Handle simple array types
    if ("type" in propSchema.items) {
      if (propSchema.items.type === "integer") {
        return `  ${propName}?: number[];\n`;
      } else if (propSchema.items.type === "string") {
        return `  ${propName}?: string[];\n`;
      }
    }

    return `  ${propName}?: unknown[];\n`;
  }

  /**
   * Generate property definition for ID fields
   */
  private generateIdPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    isSystemCollection: boolean = false,
    parentCollection?: string,
  ): string {
    // First check for system type references in junction tables
    const systemType = this.typeNameManager.getSystemTypeFromReference(
      propName,
      parentCollection,
    );
    if (systemType && this.useTypeReferences && !isSystemCollection) {
      return `  ${propName}?: string | ${systemType};\n`;
    }

    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // Extract potential related collection name from field name (removing _id suffix)
    const relatedCollectionName = propName.endsWith("_id")
      ? propName.replace(/_id$/, "")
      : "";

    // For ID fields that reference other collections
    if (
      this.useTypeReferences &&
      relatedCollectionName &&
      !isSystemCollection
    ) {
      // Check if this is a reference to a system collection
      if (this.typeNameManager.isSystemCollection(relatedCollectionName)) {
        const typeName = this.typeNameManager.getSystemCollectionTypeName(
          relatedCollectionName,
        );
        return `  ${propName}?: string | ${typeName};\n`;
      } else {
        // For regular collections, use clean singular type and remove Items prefix
        let collectionTypeName = this.typeNameManager.getTypeNameForCollection(
          relatedCollectionName,
        );
        collectionTypeName =
          this.typeNameManager.cleanTypeName(collectionTypeName);

        return `  ${propName}?: string | ${collectionTypeName};\n`;
      }
    }

    return `  ${propName}?: string;\n`;
  }

  /**
   * Generate property definition for basic fields
   */
  private generateBasicPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    const baseType = propSchema.type === "integer" ? "number" : propSchema.type;
    const optional = "nullable" in propSchema && propSchema.nullable === true;

    // Handle special string formats
    if (
      baseType === "string" &&
      "format" in propSchema &&
      typeof propSchema.format === "string"
    ) {
      const format = propSchema.format;

      if (["date", "time", "date-time", "timestamp"].includes(format)) {
        return `  ${propName}${optional ? "?" : ""}: string;\n`;
      }

      if (format === "json") {
        return `  ${propName}${optional ? "?" : ""}: unknown;\n`;
      }

      if (format === "csv") {
        return `  ${propName}${optional ? "?" : ""}: string;\n`;
      }
    }

    // Handle object type
    if (baseType === "object") {
      return `  ${propName}${optional ? "?" : ""}: Record<string, unknown>;\n`;
    }

    // Handle array type
    if (baseType === "array") {
      return `  ${propName}${optional ? "?" : ""}: unknown[];\n`;
    }

    return `  ${propName}${optional ? "?" : ""}: ${baseType ?? "unknown"};\n`;
  }
}
