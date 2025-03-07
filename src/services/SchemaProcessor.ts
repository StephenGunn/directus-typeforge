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
  hasRef,
} from "../utils/schema";

/**
 * Processes OpenAPI schemas and generates TypeScript interfaces
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private options: {
    typeName: string;
    useTypeReferences: boolean;
  };
  private processedTypes: Set<string> = new Set();
  private systemCollectionMap: Map<string, string> = new Map();
  private collectionToTypeMap: Map<string, string> = new Map();
  private relationCache: Map<string, string[]> = new Map();

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
    this.systemCollectionMap.set("directus_users", "DirectusUser");
    this.systemCollectionMap.set("users", "DirectusUser");
    this.systemCollectionMap.set("directus_files", "DirectusFile");
    this.systemCollectionMap.set("files", "DirectusFile");
    this.systemCollectionMap.set("directus_folders", "DirectusFolder");
    this.systemCollectionMap.set("folders", "DirectusFolder");
    this.systemCollectionMap.set("directus_roles", "DirectusRole");
    this.systemCollectionMap.set("roles", "DirectusRole");
    this.systemCollectionMap.set("directus_activity", "DirectusActivity");
    this.systemCollectionMap.set("activity", "DirectusActivity");
    this.systemCollectionMap.set("directus_permissions", "DirectusPermission");
    this.systemCollectionMap.set("permissions", "DirectusPermission");
    this.systemCollectionMap.set("directus_fields", "DirectusField");
    this.systemCollectionMap.set("fields", "DirectusField");
    this.systemCollectionMap.set("directus_collections", "DirectusCollection");
    this.systemCollectionMap.set("collections", "DirectusCollection");
    this.systemCollectionMap.set("directus_presets", "DirectusPreset");
    this.systemCollectionMap.set("presets", "DirectusPreset");
    this.systemCollectionMap.set("directus_relations", "DirectusRelation");
    this.systemCollectionMap.set("relations", "DirectusRelation");
    this.systemCollectionMap.set("directus_revisions", "DirectusRevision");
    this.systemCollectionMap.set("revisions", "DirectusRevision");
    this.systemCollectionMap.set("directus_webhooks", "DirectusWebhook");
    this.systemCollectionMap.set("webhooks", "DirectusWebhook");
    this.systemCollectionMap.set("directus_flows", "DirectusFlow");
    this.systemCollectionMap.set("flows", "DirectusFlow");
    this.systemCollectionMap.set("directus_operations", "DirectusOperation");
    this.systemCollectionMap.set("operations", "DirectusOperation");
    this.systemCollectionMap.set("directus_versions", "DirectusVersion");
    this.systemCollectionMap.set("versions", "DirectusVersion");
    this.systemCollectionMap.set("directus_extensions", "DirectusExtension");
    this.systemCollectionMap.set("extensions", "DirectusExtension");
    this.systemCollectionMap.set("directus_comments", "DirectusComment");
    this.systemCollectionMap.set("comments", "DirectusComment");
    this.systemCollectionMap.set("directus_settings", "DirectusSetting");
    this.systemCollectionMap.set("settings", "DirectusSetting");
  }

  /**
   * Convert plural name to singular for type consistency
   */
  private makeSingular(name: string): string {
    // Common plural endings
    if (name.endsWith("ies")) {
      return name.slice(0, -3) + "y";
    } else if (name.endsWith("ses")) {
      return name.slice(0, -2);
    } else if (
      name.endsWith("s") &&
      !name.endsWith("ss") &&
      !name.endsWith("us") &&
      !name.endsWith("is")
    ) {
      return name.slice(0, -1);
    }
    return name;
  }

  /**
   * Gets the correct type name for a collection
   */
  private getTypeName(collectionName: string): string {
    // Check if it's already in the cache
    if (this.collectionToTypeMap.has(collectionName)) {
      return this.collectionToTypeMap.get(collectionName)!;
    }

    // Check if it's a system collection
    if (
      collectionName.startsWith("directus_") ||
      this.systemCollectionMap.has(collectionName)
    ) {
      const systemType = this.getSystemCollectionTypeName(collectionName);
      this.collectionToTypeMap.set(collectionName, systemType);
      return systemType;
    }

    // For regular collections, use Items prefix for custom collections
    const typeName = `Items${this.makeSingular(toPascalCase(collectionName))}`;
    this.collectionToTypeMap.set(collectionName, typeName);
    return typeName;
  }

  /**
   * Gets the correct type name for a system collection
   */
  private getSystemCollectionTypeName(collectionNameOrRef: string): string {
    // If it's a direct match in our map, use that
    if (this.systemCollectionMap.has(collectionNameOrRef)) {
      return this.systemCollectionMap.get(collectionNameOrRef)!;
    }

    // Try with directus_ prefix if the name doesn't have it
    if (
      !collectionNameOrRef.startsWith("directus_") &&
      this.systemCollectionMap.has(`directus_${collectionNameOrRef}`)
    ) {
      return this.systemCollectionMap.get(`directus_${collectionNameOrRef}`)!;
    }

    // For any other collection, use a standard PascalCase format
    return this.makeSingular(toPascalCase(collectionNameOrRef));
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    // First pass: collect all collections and create the type mapping
    const collectionSchemas = this.collectSchemas();

    // Second pass: process schemas to generate TypeScript interfaces
    for (const [collectionName, { schema }] of Object.entries(
      collectionSchemas,
    )) {
      const typeName = this.getTypeName(collectionName);

      // Process the collection to generate its interface
      if (collectionName.startsWith("directus_")) {
        this.generateSystemCollectionInterface(schema, collectionName);
      } else {
        this.generateSDKInterface(schema, typeName, collectionName);
      }
    }

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

    // Pre-calculate and cache relations to improve type generation
    this.cacheRelations(schemas);

    return schemas;
  }

  /**
   * Cache relationships between collections for better reference handling
   */
  private cacheRelations(schemas: Record<string, CollectionSchema>): void {
    for (const [collectionName, { schema }] of Object.entries(schemas)) {
      if (!schema.properties) continue;

      // Find all properties that reference other collections
      const relationalProps: string[] = [];

      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (typeof propSchema !== "object") continue;

        let isRelational = false;

        // Check direct references
        if (hasRef(propSchema)) {
          isRelational = true;
        }
        // Check oneOf references
        else if ("oneOf" in propSchema && Array.isArray(propSchema.oneOf)) {
          const hasRefs = propSchema.oneOf.some((item) => hasRef(item));
          if (hasRefs) isRelational = true;
        }
        // Check array item references
        else if (isArraySchema(propSchema) && propSchema.items) {
          if (hasRef(propSchema.items)) {
            isRelational = true;
          } else if (
            "oneOf" in propSchema.items &&
            Array.isArray(propSchema.items.oneOf)
          ) {
            const hasRefs = propSchema.items.oneOf.some((item) => hasRef(item));
            if (hasRefs) isRelational = true;
          }
        }
        // Check for _id fields that might be relational
        else if (propName.endsWith("_id") && propName !== "id") {
          const potentialCollection = propName.slice(0, -3);
          if (schemas[potentialCollection]) {
            isRelational = true;
          }
        }

        if (isRelational) {
          relationalProps.push(propName);
        }
      }

      this.relationCache.set(collectionName, relationalProps);
    }
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

      const ref = extractRefFromPathItem(pathItem as OpenAPIV3.PathItemObject);
      if (!ref) continue;

      const schema = (this.spec.components?.schemas?.[ref] ??
        {}) as OpenAPIV3.SchemaObject;

      // Store the collection schema for later processing
      schemas[collection] = { ref, schema };
    }
  }

  /**
   * Processes system collection schemas
   */
  private processSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // Process system collections from the schema
    const systemCollections = findSystemCollections(this.spec);
    for (const collection of systemCollections) {
      const schema = Object.values(this.spec.components?.schemas ?? {}).find(
        (schema) => {
          const schemaObject = schema as ExtendedSchemaObject;
          return schemaObject["x-collection"] === collection;
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        schemas[collection] = { ref: collection, schema };
      }
    }

    // Ensure all standard system collections are defined even if not in the schema
    this.ensureStandardSystemCollections(schemas);
  }

  /**
   * Ensure all standard system collections are defined
   */
  private ensureStandardSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // For each standard system collection
    for (const [shortName] of this.systemCollectionMap.entries()) {
      if (!shortName.startsWith("directus_")) continue;

      // If not already in schemas
      if (!schemas[shortName]) {
        // Create a minimal schema for the system collection
        const minimalSchema = {
          type: "object",
          properties: {
            id: {
              type:
                this.getSystemCollectionIdType(shortName) === "number"
                  ? "integer"
                  : "string",
            },
          },
        } as OpenAPIV3.SchemaObject;

        schemas[shortName] = {
          ref: shortName,
          schema: minimalSchema,
        };
      }
    }
  }

  /**
   * Get the appropriate ID type for system collections
   */
  private getSystemCollectionIdType(collection: string): string {
    // Most system collections have string ids, except for specific ones
    const numberIdCollections = [
      "directus_permissions",
      "directus_activity",
      "directus_presets",
      "directus_revisions",
      "directus_webhooks",
      "directus_settings",
    ];

    return numberIdCollections.includes(collection) ? "number" : "string";
  }

  /**
   * Checks if a field is a system field
   */
  private isSystemField(fieldName: string, collection?: string): boolean {
    if (fieldName === "id") return false; // Always keep ID fields
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
  private generateSystemCollectionInterface(
    schema: OpenAPIV3.SchemaObject,
    collection: string,
  ): void {
    if (!schema.properties) return;

    // Get only non-system fields for the system collection
    const customFields = Object.entries(schema.properties).filter(
      ([propName]) =>
        !this.isSystemField(propName, collection) && propName !== "id",
    );

    // Use the system collection type name
    const typeName = this.getSystemCollectionTypeName(collection);

    // If we've already processed this type, don't duplicate it
    if (this.processedTypes.has(typeName)) {
      return;
    }
    this.processedTypes.add(typeName);

    let interfaceStr = `export interface ${typeName} {\n`;

    // Add the ID field first
    const idType = this.getSystemCollectionIdType(collection);
    interfaceStr += `  id: ${idType};\n`;

    const properties: string[] = ["id"];

    // Add custom fields
    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      // Generate property with proper handling for system collections
      interfaceStr += this.generatePropertyDefinition(propName, propSchema);
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Generates TypeScript interface from schema
   */
  private generateSDKInterface(
    schema: OpenAPIV3.SchemaObject,
    typeName: string,
    collectionName?: string,
  ): void {
    if (!schema.properties) return;

    // If we've already processed this type, don't duplicate it
    if (this.processedTypes.has(typeName)) {
      return;
    }
    this.processedTypes.add(typeName);

    // Filter out system fields for regular collections and id field (we'll add it explicitly)
    const nonSystemFields = Object.entries(schema.properties).filter(
      ([propName]) =>
        propName !== "id" && !this.isSystemField(propName, collectionName),
    );

    let interfaceStr = `export interface ${typeName} {\n`;
    const properties: string[] = [];

    // Always include an id field
    interfaceStr += `  id: string;\n`;
    properties.push("id");

    for (const [propName, propSchema] of nonSystemFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      interfaceStr += this.generatePropertyDefinition(propName, propSchema);
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Resolves reference type name from a reference path
   */
  private resolveRefTypeName(refPath: string): string {
    const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);
    if (!refMatch || !refMatch[1]) return "";

    const refTypeName = refMatch[1];

    // Extract collection name from the reference
    // For references like "User" or "Event" in the schema, convert to collection name
    const collectionName = this.makeSingular(refTypeName).toLowerCase();

    // If this is a known collection, return its type name
    if (this.collectionToTypeMap.has(collectionName)) {
      return this.collectionToTypeMap.get(collectionName)!;
    }

    // For system collections direct reference
    for (const [collection, typeName] of this.systemCollectionMap) {
      // Check both the full name (directus_users) and the shortened name (Users)
      if (
        collection === refTypeName ||
        toPascalCase(collection.replace("directus_", "")) === refTypeName
      ) {
        return typeName;
      }
    }

    // Regular collection - apply Items prefix
    return `Items${this.makeSingular(refTypeName)}`;
  }

  /**
   * Generates TypeScript definition for a property
   */
  private generatePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): string {
    // Special handling for common user reference fields
    if (
      propName === "user_created" ||
      propName === "user_updated" ||
      propName === "user"
    ) {
      return `  ${propName}?: string | DirectusUser;\n`;
    }

    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(propName, propSchema);
    }

    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(propName, propSchema);
    }

    if (isArraySchema(propSchema)) {
      return this.generateArrayPropertyDefinition(propName, propSchema);
    }

    if (propName.endsWith("_id") || propName === "item") {
      return this.generateIdPropertyDefinition(propName, propSchema);
    }

    return this.generateBasicPropertyDefinition(propName, propSchema);
  }

  /**
   * Generate property definition for reference fields
   */
  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
  ): string {
    const refTypeName = this.resolveRefTypeName(propSchema.$ref);

    if (refTypeName === "") {
      return `  ${propName}?: string;\n`;
    }

    // Use the type reference
    return `  ${propName}?: string | ${refTypeName};\n`;
  }

  /**
   * Generate property definition for oneOf fields
   */
  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem && typeof refItem.$ref === "string") {
      const refTypeName = this.resolveRefTypeName(refItem.$ref);

      if (refTypeName !== "") {
        return `  ${propName}?: string | ${refTypeName};\n`;
      }
    }

    return `  ${propName}?: unknown;\n`;
  }

  /**
   * Generate property definition for array fields
   */
  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
  ): string {
    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      const refTypeName = this.resolveRefTypeName(propSchema.items.$ref);

      if (refTypeName !== "") {
        return `  ${propName}?: string[] | ${refTypeName}[];\n`;
      }

      return `  ${propName}?: string[];\n`;
    }

    // Handle arrays with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => "$ref" in item);

      if (refItem && "$ref" in refItem && typeof refItem.$ref === "string") {
        const refTypeName = this.resolveRefTypeName(refItem.$ref);

        if (refTypeName !== "") {
          return `  ${propName}?: string[] | ${refTypeName}[];\n`;
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
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // Extract potential related collection name from field name (removing _id suffix)
    const relatedCollectionName = propName.endsWith("_id")
      ? propName.replace(/_id$/, "")
      : "";

    // Check if this is a reference to a system collection
    if (this.systemCollectionMap.has(`directus_${relatedCollectionName}`)) {
      const systemTypeName = this.systemCollectionMap.get(
        `directus_${relatedCollectionName}`,
      )!;
      return `  ${propName}?: string | ${systemTypeName};\n`;
    }

    // For regular collections, create a reference if the collection exists in our schema
    if (
      relatedCollectionName &&
      this.collectionToTypeMap.has(relatedCollectionName)
    ) {
      const relatedTypeName = this.collectionToTypeMap.get(
        relatedCollectionName,
      )!;
      return `  ${propName}?: string | ${relatedTypeName};\n`;
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
    const optional = true; // All properties are optional in Directus

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
        return `  ${propName}${optional ? "?" : ""}: string[];\n`;
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

  /**
   * Generates final type definitions
   */
  private generateTypeDefinitions(
    collectionSchemas: Record<string, CollectionSchema>,
  ): string {
    // First add all interfaces
    let source = "";
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }

    // Then create the main schema type
    source += `\nexport interface ${this.options.typeName} {\n`;

    // First add non-system collections
    const nonSystemCollections = Object.entries(collectionSchemas).filter(
      ([collectionName]) => !collectionName.startsWith("directus_"),
    );

    for (const [collectionName, { schema }] of nonSystemCollections) {
      const isSingleton = !!(schema as ExtendedSchemaObject)?.["x-singleton"];
      const typeName = this.getTypeName(collectionName);

      source += `  ${collectionName}: ${typeName}${isSingleton ? "" : "[]"};\n`;
    }

    // Then add system collections
    const systemCollections = Object.entries(collectionSchemas).filter(
      ([collectionName]) => collectionName.startsWith("directus_"),
    );

    for (const [collectionName] of systemCollections) {
      const typeName = this.getSystemCollectionTypeName(collectionName);
      source += `  ${collectionName}: ${typeName}[];\n`;
    }

    source += `};\n\n`;

    return source;
  }
}
