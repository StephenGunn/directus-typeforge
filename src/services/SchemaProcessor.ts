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
  private options: {
    typeName: string;
    useTypeReferences: boolean;
  };
  private processedTypes: Set<string> = new Set();
  private systemCollectionMap: Map<string, string> = new Map();
  // Map to store collection name to type name mappings
  private collectionTypeMap: Map<string, string> = new Map();

  /**
   * Cleans a type name by removing unnecessary prefixes
   */
  private cleanTypeName(typeName: string): string {
    // Remove the "Items" prefix if it exists
    if (typeName.startsWith("Items")) {
      return typeName.substring(5);
    }
    return typeName;
  }

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
    this.systemCollectionMap.set("users", "DirectusUser");
    this.systemCollectionMap.set("files", "DirectusFile");
    this.systemCollectionMap.set("folders", "DirectusFolder");
    this.systemCollectionMap.set("roles", "DirectusRole");
    this.systemCollectionMap.set("activity", "DirectusActivity");
    this.systemCollectionMap.set("permissions", "DirectusPermission");
    this.systemCollectionMap.set("fields", "DirectusField");
    this.systemCollectionMap.set("collections", "DirectusCollection");
    this.systemCollectionMap.set("presets", "DirectusPreset");
    this.systemCollectionMap.set("relations", "DirectusRelation");
    this.systemCollectionMap.set("revisions", "DirectusRevision");
    this.systemCollectionMap.set("webhooks", "DirectusWebhook");
    this.systemCollectionMap.set("flows", "DirectusFlow");
    this.systemCollectionMap.set("operations", "DirectusOperation");
    this.systemCollectionMap.set("versions", "DirectusVersion");
    this.systemCollectionMap.set("extensions", "DirectusExtension");
    this.systemCollectionMap.set("comments", "DirectusComment");
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
   * Gets the correct type name for a system collection
   */
  private getSystemCollectionTypeName(collectionNameOrRef: string): string {
    // If it's a short name like 'users', map it to 'DirectusUser'
    const mappedName = this.systemCollectionMap.get(collectionNameOrRef);
    if (mappedName) {
      return mappedName;
    }

    // If it's a full name like 'directus_users', convert to 'DirectusUser'
    if (collectionNameOrRef.startsWith("directus_")) {
      const baseName = collectionNameOrRef.replace("directus_", "");
      const mappedBaseName = this.systemCollectionMap.get(baseName);
      if (mappedBaseName) {
        return mappedBaseName;
      }
      // If not found in map, use PascalCase and make singular
      const plural = toPascalCase(collectionNameOrRef);
      return this.makeSingular(plural);
    }

    // Not a system collection - generate appropriate name
    const pascalName = toPascalCase(collectionNameOrRef);
    return this.makeSingular(pascalName);
  }

  /**
   * Get type name for a collection
   */
  private getTypeNameForCollection(collectionName: string): string {
    // First check if we already have this collection mapped
    if (this.collectionTypeMap.has(collectionName)) {
      return this.collectionTypeMap.get(collectionName)!;
    }

    // For system collections, use the system naming convention
    if (collectionName.startsWith("directus_")) {
      const typeName = this.getSystemCollectionTypeName(collectionName);
      this.collectionTypeMap.set(collectionName, typeName);
      return typeName;
    }

    // For regular collections, just use the singular form in PascalCase without any prefix
    const typeName = toPascalCase(this.makeSingular(collectionName));
    this.collectionTypeMap.set(collectionName, typeName);
    return typeName;
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

      // Generate type name for the collection
      const typeName = this.getTypeNameForCollection(collection);

      // Map the collection to its clean type name
      const cleanTypeName = this.cleanTypeName(typeName);
      this.collectionTypeMap.set(collection, cleanTypeName);

      if (!this.processedTypes.has(cleanTypeName)) {
        this.processedTypes.add(cleanTypeName);

        // For system collections, we'll only include custom fields
        if (isSystemCollection) {
          this.generateSystemCollectionInterface(schema, collection);
        } else {
          // Generate interface for regular collection
          this.generateSDKInterface(schema, typeName, collection);
        }
      }

      if (this.typeTracker.hasValidContent(cleanTypeName)) {
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
        const typeName = this.getSystemCollectionTypeName(collection);

        if (!this.processedTypes.has(typeName)) {
          this.processedTypes.add(typeName);
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
                this.getSystemCollectionIdType(collectionName) === "number"
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
   * Generates TypeScript interface from schema
   */
  private generateSDKInterface(
    schema: OpenAPIV3.SchemaObject,
    refName: string,
    collectionName?: string,
  ): void {
    if (!schema.properties) return;

    // Clean the type name to remove Items prefix
    const typeName = this.cleanTypeName(refName);

    const nonSystemFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collectionName),
    );

    if (nonSystemFields.length === 0) {
      // If no properties, add default id field for regular collections
      const interfaceStr = `export interface ${typeName} {\n  id: string;\n}\n\n`;
      this.typeTracker.addType(typeName, interfaceStr, ["id"]);
      return;
    }

    let interfaceStr = `export interface ${typeName} {\n`;
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
    this.typeTracker.addType(typeName, interfaceStr, properties);
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
      // For these fields, always use string | DirectusUser
      if (this.options.useTypeReferences && !isSystemCollection) {
        return `  ${propName}?: string | DirectusUser;\n`;
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
   * Generate property definition for reference fields
   */
  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
  ): string {
    const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(propSchema.$ref);
    if (!refMatch || !refMatch[1]) {
      return `  ${propName}?: string;\n`;
    }

    const collectionName = refMatch[1];

    // For system collections, use string type
    if (isSystemCollection) {
      return `  ${propName}?: string;\n`;
    }

    // Otherwise, use the type reference if enabled
    if (this.options.useTypeReferences) {
      // For system collections like Users, use DirectusUser
      if (
        collectionName.startsWith("directus_") ||
        this.systemCollectionMap.has(collectionName.toLowerCase())
      ) {
        const typeName = this.getSystemCollectionTypeName(collectionName);
        return `  ${propName}?: string | ${typeName};\n`;
      }

      // For regular collections, use clean singular names, removing any Items prefix
      let typeName = toPascalCase(this.makeSingular(collectionName));
      typeName = this.cleanTypeName(typeName);
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
  ): string {
    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem && typeof refItem.$ref === "string") {
      // Extract proper type name
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refItem.$ref);
      if (refMatch && refMatch[1]) {
        const collectionName = refMatch[1];

        if (this.options.useTypeReferences && !isSystemCollection) {
          // For system collections
          if (
            collectionName.startsWith("directus_") ||
            this.systemCollectionMap.has(collectionName.toLowerCase())
          ) {
            const typeName = this.getSystemCollectionTypeName(collectionName);
            return `  ${propName}?: string | ${typeName};\n`;
          }

          // For regular collections, use clean singular names, removing any Items prefix
          let typeName = toPascalCase(this.makeSingular(collectionName));
          typeName = this.cleanTypeName(typeName);
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
  ): string {
    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      // Extract proper collection name and type
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(
        propSchema.items.$ref,
      );
      if (refMatch && refMatch[1]) {
        const collectionName = refMatch[1];

        // For regular collections, use both types
        if (this.options.useTypeReferences && !isSystemCollection) {
          // For system collections
          if (
            collectionName.startsWith("directus_") ||
            this.systemCollectionMap.has(collectionName.toLowerCase())
          ) {
            const typeName = this.getSystemCollectionTypeName(collectionName);
            return `  ${propName}?: string[] | ${typeName}[];\n`;
          }

          // For regular collections, remove Items prefix if present
          let typeName = toPascalCase(this.makeSingular(collectionName));
          typeName = this.cleanTypeName(typeName);
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
          if (this.options.useTypeReferences && !isSystemCollection) {
            // For system collections
            if (
              collectionName.startsWith("directus_") ||
              this.systemCollectionMap.has(collectionName.toLowerCase())
            ) {
              const typeName = this.getSystemCollectionTypeName(collectionName);
              return `  ${propName}?: string[] | ${typeName}[];\n`;
            }

            // For regular collections, remove Items prefix if present
            let typeName = toPascalCase(this.makeSingular(collectionName));
            typeName = this.cleanTypeName(typeName);
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
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // Extract potential related collection name from field name (removing _id suffix)
    const relatedCollectionName = propName.endsWith("_id")
      ? propName.replace(/_id$/, "")
      : "";

    // For ID fields that reference other collections
    if (
      this.options.useTypeReferences &&
      relatedCollectionName &&
      !isSystemCollection
    ) {
      // Check if this is a reference to a system collection
      if (
        relatedCollectionName.startsWith("directus_") ||
        this.systemCollectionMap.has(relatedCollectionName)
      ) {
        const typeName = this.getSystemCollectionTypeName(
          relatedCollectionName,
        );
        return `  ${propName}?: string | ${typeName};\n`;
      } else {
        // For regular collections, use clean singular type and remove Items prefix
        let collectionTypeName = toPascalCase(
          this.makeSingular(relatedCollectionName),
        );
        collectionTypeName = this.cleanTypeName(collectionTypeName);

        // Try to check if this type might exist
        const potentialCollections = [
          relatedCollectionName,
          relatedCollectionName + "s",
          relatedCollectionName + "es",
          relatedCollectionName.replace(/y$/, "ies"),
        ];

        const collectionExists = potentialCollections.some(
          (name) =>
            this.collectionTypeMap.has(name) ||
            name in (this.spec.components?.schemas || {}),
        );

        if (collectionExists || this.processedTypes.has(collectionTypeName)) {
          return `  ${propName}?: string | ${collectionTypeName};\n`;
        }
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

  /**
   * Generates final type definitions
   */
  private generateTypeDefinitions(
    collectionSchemas: Record<string, CollectionSchema>,
  ): string {
    const validCollections = Object.entries(collectionSchemas).filter(
      ([, { ref }]) => {
        const typeName = this.getTypeNameForCollection(ref);
        const cleanTypeName = this.cleanTypeName(typeName);
        return this.typeTracker.hasValidContent(cleanTypeName);
      },
    );

    // First add all interfaces
    let source = "";
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }

    // Then create the main schema type
    if (validCollections.length > 0) {
      source += `\nexport interface ${this.options.typeName} {\n`;

      // First add non-system collections
      const nonSystemCollections = validCollections.filter(
        ([collectionName]) => !collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of nonSystemCollections) {
        const schema = (this.spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];

        // Use type name from our map, ensuring it's clean
        const typeName = this.getTypeNameForCollection(collectionName);
        const cleanTypeName = this.cleanTypeName(typeName);

        source += `  ${collectionName}: ${cleanTypeName}${isSingleton ? "" : "[]"};\n`;
      }

      // Then add system collections
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
}
