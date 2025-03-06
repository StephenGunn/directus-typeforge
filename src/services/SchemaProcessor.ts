import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import type {
  ExtendedSchemaObject,
  GenerateTypeScriptOptions,
  CollectionSchema,
} from "../types";
import { TypeTracker } from "./TypeTracker";
import { toPascalCase } from "../utils/string";
import {
  extractRefFromPathItem,
  findSystemCollections,
  isReferenceObject,
  isArraySchema,
} from "../utils/schema";

/**
 * Processes OpenAPI schemas and generates TypeScript interfaces
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private options: GenerateTypeScriptOptions;
  private processedTypes: Set<string> = new Set();
  private systemCollectionMap: Map<string, string> = new Map();

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
    };

    // Initialize system collection mapping
    this.initializeSystemCollectionMap();
  }

  /**
   * Initialize the mapping between collection names and their type names
   */
  private initializeSystemCollectionMap(): void {
    // Map standard Directus system collections to their Type names
    this.systemCollectionMap.set("users", "DirectusUsers");
    this.systemCollectionMap.set("files", "DirectusFiles");
    this.systemCollectionMap.set("folders", "DirectusFolders");
    this.systemCollectionMap.set("roles", "DirectusRoles");
    this.systemCollectionMap.set("activity", "DirectusActivity");
    this.systemCollectionMap.set("permissions", "DirectusPermissions");
    this.systemCollectionMap.set("fields", "DirectusFields");
    this.systemCollectionMap.set("collections", "DirectusCollections");
    this.systemCollectionMap.set("presets", "DirectusPresets");
    this.systemCollectionMap.set("relations", "DirectusRelations");
    this.systemCollectionMap.set("revisions", "DirectusRevisions");
    this.systemCollectionMap.set("webhooks", "DirectusWebhooks");
    this.systemCollectionMap.set("flows", "DirectusFlows");
    this.systemCollectionMap.set("operations", "DirectusOperations");
    this.systemCollectionMap.set("versions", "DirectusVersions");
    this.systemCollectionMap.set("extensions", "DirectusExtensions");
    this.systemCollectionMap.set("comments", "DirectusComments");
    this.systemCollectionMap.set("settings", "DirectusSettings");
  }

  /**
   * Gets the correct type name for a system collection
   */
  private getSystemCollectionTypeName(collectionNameOrRef: string): string {
    // If it's a short name like 'users', map it to 'DirectusUsers'
    const mappedName = this.systemCollectionMap.get(collectionNameOrRef);
    if (mappedName) {
      return mappedName;
    }

    // If it's a full name like 'directus_users', convert to 'DirectusUsers'
    if (collectionNameOrRef.startsWith("directus_")) {
      const baseName = collectionNameOrRef.replace("directus_", "");
      const mappedBaseName = this.systemCollectionMap.get(baseName);
      if (mappedBaseName) {
        return mappedBaseName;
      }
      // If not found in map, use PascalCase
      return toPascalCase(collectionNameOrRef);
    }

    // Not a system collection
    return toPascalCase(collectionNameOrRef);
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    // Collect all schemas and process them
    const collectionSchemas = this.collectSchemas();

    // Generate the final type definitions
    return this.generateTypeDefinitions(collectionSchemas);
  }

  /**
   * Collects all schemas from the spec
   */
  private collectSchemas(): Record<string, CollectionSchema> {
    const schemas: Record<string, CollectionSchema> = {};

    // Process path schemas
    if (this.spec.paths) {
      this.processPathSchemas(schemas);
    }

    // Process system collections
    this.processSystemCollections(schemas);

    return schemas;
  }

  /**
   * Processes schemas from paths
   */
  private processPathSchemas(schemas: Record<string, CollectionSchema>): void {
    for (const [path, pathItem] of Object.entries(this.spec.paths ?? {})) {
      const collectionMatch = /^\/items\/(?<collection>[a-zA-Z0-9_]+)$/.exec(
        path,
      );
      const collection = collectionMatch?.groups?.["collection"];
      if (!collection) continue;

      // Always include system collections (we'll handle them differently in the output)
      const isSystemCollection = collection.startsWith("directus_");

      const ref = extractRefFromPathItem(pathItem as OpenAPIV3.PathItemObject);
      if (!ref) continue;

      const schema = (this.spec.components?.schemas?.[ref] ??
        {}) as OpenAPIV3.SchemaObject;
      const refName = toPascalCase(ref);

      if (!this.processedTypes.has(refName)) {
        this.processedTypes.add(refName);

        // For system collections, we'll only include custom fields
        if (isSystemCollection) {
          this.generateSystemCollectionInterface(schema, collection);
        } else {
          // Generate interface for regular collection
          this.generateSDKInterface(schema, refName, collection);
        }
      }

      if (this.typeTracker.hasValidContent(refName)) {
        schemas[collection] = { ref, schema };
      }
    }
  }

  /**
   * Processes system collection schemas
   */
  private processSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // Always process system collections
    const systemCollections = findSystemCollections(this.spec);
    for (const collection of systemCollections) {
      const schema = Object.values(this.spec.components?.schemas ?? {}).find(
        (schema) => {
          const schemaObject = schema as ExtendedSchemaObject;
          return schemaObject["x-collection"] === collection;
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        const refName = this.getSystemCollectionTypeName(collection);

        if (!this.processedTypes.has(refName)) {
          this.processedTypes.add(refName);
          this.generateSystemCollectionInterface(schema, collection);
        }

        if (this.typeTracker.hasValidContent(refName)) {
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
    // For each standard system collection
    for (const [shortName, typeName] of this.systemCollectionMap) {
      const collectionName = `directus_${shortName}`;

      // If it's not already processed and not already in schemas
      if (!this.processedTypes.has(typeName) && !schemas[collectionName]) {
        this.processedTypes.add(typeName);

        // Create a minimal schema for the system collection
        const minimalSchema = {
          type: "object",
          properties: {
            id: {
              type:
                shortName === "permissions" ||
                shortName === "activity" ||
                shortName === "presets" ||
                shortName === "revisions" ||
                shortName === "webhooks" ||
                shortName === "settings"
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
   * Generates interface for system collection's custom fields
   */
  private generateSystemCollectionInterface(
    schema: OpenAPIV3.SchemaObject,
    collection: string,
  ): void {
    if (!schema.properties) return;

    // Get only non-system fields for the system collection
    const customFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collection),
    );

    // Use the system collection type name
    const typeName = this.getSystemCollectionTypeName(collection);
    let interfaceStr = `export interface ${typeName} {\n`;

    // Check if customFields already has an ID field
    const hasCustomId = customFields.some(
      ([propName]) => propName.toLowerCase() === "id",
    );

    // Only add the ID field if not already present in customFields
    if (!hasCustomId) {
      interfaceStr += `  id: ${this.getSystemCollectionIdType(collection)};\n`;
    }

    const properties: string[] = hasCustomId ? [] : ["id"];

    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      // Generate property with proper handling for system collections
      interfaceStr += this.generatePropertyDefinition(
        propName,
        propSchema,
        true,
      );
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Get the appropriate ID type for system collections
   */
  private getSystemCollectionIdType(collection: string): string {
    // Most system collections have string ids, except for specific ones
    if (
      collection === "directus_permissions" ||
      collection === "directus_activity" ||
      collection === "directus_presets" ||
      collection === "directus_revisions" ||
      collection === "directus_webhooks" ||
      collection === "directus_settings"
    ) {
      return "number";
    }
    return "string";
  }

  /**
   * Generates TypeScript interface from schema
   */
  private generateSDKInterface(
    schema: OpenAPIV3.SchemaObject,
    refName: string,
    collectionName?: string,
  ): void {
    if (!schema.properties) return;

    const nonSystemFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collectionName),
    );

    if (nonSystemFields.length === 0) {
      // If no properties, add default id field for regular collections
      const interfaceStr = `export interface ${refName} {\n  id: string;\n}\n\n`;
      this.typeTracker.addType(refName, interfaceStr, ["id"]);
      return;
    }

    let interfaceStr = `export interface ${refName} {\n`;
    const properties: string[] = [];

    for (const [propName, propSchema] of nonSystemFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      interfaceStr += this.generatePropertyDefinition(
        propName,
        propSchema,
        false,
      );
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(refName, interfaceStr, properties);
  }

  /**
   * Generates TypeScript definition for a property
   */
  private generatePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
  ): string {
    // Special handling for user references that commonly cause recursion
    if (
      propName === "user_created" ||
      propName === "user_updated" ||
      propName === "user"
    ) {
      // For these fields, always use string | DirectusUsers
      if (this.options.useTypeReferences && !isSystemCollection) {
        return `  ${propName}?: string | DirectusUsers;\n`;
      } else {
        return `  ${propName}?: string;\n`;
      }
    }

    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
      );
    }

    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
      );
    }

    if (isArraySchema(propSchema)) {
      return this.generateArrayPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
      );
    }

    if (propName.endsWith("_id") || propName === "item") {
      return this.generateIdPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
      );
    }

    return this.generateBasicPropertyDefinition(propName, propSchema);
  }

  /**
   * Checks if a field is a system field
   */
  private isSystemField(fieldName: string, collection?: string): boolean {
    if (fieldName === "id") return false;
    if (!collection?.startsWith("directus_")) return false;

    if (collection && collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    }

    return false;
  }

  /**
   * Generates final type definitions
   */
  private generateTypeDefinitions(
    collectionSchemas: Record<string, CollectionSchema>,
  ): string {
    const validCollections = Object.entries(collectionSchemas).filter(
      ([, { ref }]) =>
        this.typeTracker.hasValidContent(this.getSystemCollectionTypeName(ref)),
    );

    // First add all interfaces
    let source = "";
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }

    // Then create the main schema type
    if (validCollections.length > 0) {
      source += `\nexport type ${this.options.typeName} = {\n`;

      // First add non-system collections (as arrays)
      const nonSystemCollections = validCollections.filter(
        ([collectionName]) => !collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of nonSystemCollections) {
        const schema = (this.spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];
        const pascalCaseName = toPascalCase(ref);

        source += `  ${collectionName}: ${pascalCaseName}${isSingleton ? "" : "[]"};\n`;
      }

      // Then add system collections (as arrays)
      const systemCollections = validCollections.filter(([collectionName]) =>
        collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of systemCollections) {
        const typeName = this.getSystemCollectionTypeName(ref);
        source += `  ${collectionName}: ${typeName}[];\n`;
      }

      source += `};\n\n`;
    }

    return source;
  }

  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
  ): string {
    // Extract reference type name
    const refPath = propSchema.$ref;
    const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

    if (!refMatch || !refMatch[1]) {
      return `  ${propName}?: string;\n`;
    }

    let refTypeName = refMatch[1];

    // Check if the reference is to a system collection and use the correct name
    if (refTypeName === "Users") {
      refTypeName = "DirectusUsers";
    } else if (refTypeName === "Files") {
      refTypeName = "DirectusFiles";
    } else if (refTypeName === "Folders") {
      refTypeName = "DirectusFolders";
    } else if (refTypeName === "Roles") {
      refTypeName = "DirectusRoles";
    } else {
      // For other potential system collections
      const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
      if (systemTypeName !== refTypeName) {
        refTypeName = systemTypeName;
      }
    }

    // For system collections, use string type
    if (isSystemCollection) {
      return `  ${propName}?: string;\n`;
    }

    // Otherwise, use the type reference if enabled
    if (this.options.useTypeReferences) {
      return `  ${propName}?: string | ${refTypeName};\n`;
    }

    return `  ${propName}?: string;\n`;
  }

  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    isSystemCollection: boolean = false,
  ): string {
    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem) {
      const refPath = refItem.$ref;
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

      if (refMatch && refMatch[1]) {
        let refTypeName = refMatch[1];

        // Adjust for system collections
        if (refTypeName === "Users") {
          refTypeName = "DirectusUsers";
        } else if (refTypeName === "Files") {
          refTypeName = "DirectusFiles";
        } else if (refTypeName === "Folders") {
          refTypeName = "DirectusFolders";
        } else if (refTypeName === "Roles") {
          refTypeName = "DirectusRoles";
        } else {
          // For other potential system collections
          const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
          if (systemTypeName !== refTypeName) {
            refTypeName = systemTypeName;
          }
        }

        // Use type references if enabled
        if (this.options.useTypeReferences && !isSystemCollection) {
          return `  ${propName}?: string | ${refTypeName};\n`;
        }
      }

      return `  ${propName}?: string;\n`;
    }

    return `  ${propName}?: unknown;\n`;
  }

  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
    isSystemCollection: boolean = false,
  ): string {
    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      const refPath = propSchema.items.$ref;
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

      if (refMatch && refMatch[1]) {
        let refTypeName = refMatch[1];

        // Adjust for system collections
        if (refTypeName === "Users") {
          refTypeName = "DirectusUsers";
        } else if (refTypeName === "Files") {
          refTypeName = "DirectusFiles";
        } else {
          // For other potential system collections
          const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
          if (systemTypeName !== refTypeName) {
            refTypeName = systemTypeName;
          }
        }

        // For regular collections, use both types
        if (this.options.useTypeReferences && !isSystemCollection) {
          return `  ${propName}?: string[] | ${refTypeName}[];\n`;
        }
      }

      return `  ${propName}?: string[];\n`;
    }

    // Handle arrays with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => "$ref" in item);

      if (refItem && "$ref" in refItem) {
        const refPath = refItem.$ref;
        const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

        if (refMatch && refMatch[1]) {
          let refTypeName = refMatch[1];

          // Adjust for system collections
          if (refTypeName === "Users") {
            refTypeName = "DirectusUsers";
          } else if (refTypeName === "Files") {
            refTypeName = "DirectusFiles";
          } else {
            // For other potential system collections
            const systemTypeName =
              this.getSystemCollectionTypeName(refTypeName);
            if (systemTypeName !== refTypeName) {
              refTypeName = systemTypeName;
            }
          }

          // For arrays of items with oneOf
          if (this.options.useTypeReferences && !isSystemCollection) {
            return `  ${propName}?: string[] | ${refTypeName}[];\n`;
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

  private generateIdPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    isSystemCollection: boolean = false,
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // Extract potential related collection name from field name (removing _id suffix)
    const relatedCollectionName = propName.endsWith("_id")
      ? propName.replace(/_id$/, "")
      : "";

    // Check if this is a reference to a system collection
    const systemTypeName = this.systemCollectionMap.get(relatedCollectionName);

    // For ID fields that reference other collections
    if (
      this.options.useTypeReferences &&
      relatedCollectionName &&
      !isSystemCollection
    ) {
      // If it's a reference to a system collection, use the system type name
      if (systemTypeName) {
        return `  ${propName}?: string | ${systemTypeName};\n`;
      } else {
        // Convert related collection name to PascalCase for type reference
        const relatedTypeName = toPascalCase(relatedCollectionName);

        // Check if related type exists in spec components
        const relatedTypeExists =
          !!this.spec.components?.schemas?.[relatedTypeName];

        if (relatedTypeExists) {
          return `  ${propName}?: string | ${relatedTypeName};\n`;
        }
      }
    }

    return `  ${propName}?: string;\n`;
  }

  private generateBasicPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    const baseType = propSchema.type === "integer" ? "number" : propSchema.type;
    const optional = "nullable" in propSchema && propSchema.nullable === true;

    // Handle special string formats
    if (baseType === "string" && "format" in propSchema) {
      const format = propSchema.format;
      if (
        format === "date" ||
        format === "time" ||
        format === "date-time" ||
        format === "timestamp"
      ) {
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
